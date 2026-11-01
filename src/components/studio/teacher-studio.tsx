import {
  ArrowRight,
  BookOpen,
  Check,
  Globe2,
  Layers3,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  FileText,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { readResponseJson } from "@/lib/http";
import {
  GENERIC_GENERATION_FAILURE_MESSAGE,
  resolveFailure,
} from "@/lib/generation-failures";
import { cn } from "@/lib/utilities";
import { LessonPreview } from "@/components/a2ui/lesson-preview";
import { Button } from "@/components/ui/button";
import { ReviewStudio } from "@/components/studio/review-studio";
import { SourcePanel } from "@/components/studio/source-panel";
import { ValidationDiagnostics } from "@/components/studio/validation-diagnostics";
import { csrfHeaderName } from "@/shared/identity-contract";
import { publicGenerationResultSchema } from "@/shared/generation-contract";
import { displayStandardCode } from "@/shared/standard-display";
import type { BoundSource } from "@/components/studio/source-panel";
import type {
  LessonGenerationInput,
  PublicGenerationResult,
  RecoveryAction,
} from "@/shared/generation-contract";

import type {
  KeyboardEvent as ReactKeyboardEvent,
  SyntheticEvent,
} from "react";

interface TeacherStudioProperties {
  readonly csrf: string;
  readonly generation: string;
  readonly reviewRequestId?: string;
  readonly onOpenReview: (requestId: string) => void;
  readonly onCloseReview: () => void;
  readonly onUnauthorized: () => void;
}

/**
The seeded synthetic curriculum every draft is generated against. The identity session projection carries no curriculum id, so the studio pins the classroom's current standard here until a teacher can choose one.
*/
const DEFAULT_STANDARD_ID = "standard_ccss_4_nf_a_01";

const GENERATE_ENDPOINT = "/api/lessons/generate";

const GRADES = ["3", "4", "5", "6"] as const;

interface PromptContext {
  grade: (typeof GRADES)[number];
  language: "en" | "ar";
  difficulty: "support" | "on-level" | "stretch";
}

const variantLabels = {
  standard: "Core idea",
  scaffold: "Extra support",
  challenge: "Stretch it",
} as const;

const guidancePanels = [
  {
    key: "target",
    title: "Target",
    short: "Keep the goal precise",
    detail: "We will start with the clearest learning target we can find.",
    Icon: BookOpen,
  },
  {
    key: "support",
    title: "Support",
    short: "Make room for every learner",
    detail: "The draft includes a gentler path and a way to stretch the idea.",
    Icon: Layers3,
  },
  {
    key: "review",
    title: "Review",
    short: "You decide what goes live",
    detail: "Every version stays private until you approve it for students.",
    Icon: ShieldCheck,
  },
] as const;

const DIFFICULTY_SIGNALS: readonly [string, PromptContext["difficulty"]][] = [
  ["challenge", "stretch"],
  ["support", "support"],
  ["scaffold", "support"],
];

const getDifficulty = (lowerPrompt: string): PromptContext["difficulty"] => {
  return (
    DIFFICULTY_SIGNALS.find(([signal]) => lowerPrompt.includes(signal))?.[1] ??
    "on-level"
  );
};

const getPromptContext = (prompt: string): PromptContext => {
  const gradeMatch = prompt.match(
    /\b(?:grade|year|class)\s*(?<grade>[3-6])\b/iu
  );
  const lowerPrompt = prompt.toLowerCase();
  const matchedGrade = gradeMatch?.groups?.grade;

  return {
    grade: GRADES.find((grade) => grade === matchedGrade) ?? "4",
    language: /[\u{600}-\u{6FF}]/u.test(prompt) ? "ar" : "en",
    difficulty: getDifficulty(lowerPrompt),
  };
};

const READY_FOR_REVIEW_STATE = "ready-for-review";
const BLOCKED_BY_VALIDATION_STATE = "blocked-by-validation";

const getResultTitle = (state: PublicGenerationResult["state"]) => {
  switch (state) {
    case READY_FOR_REVIEW_STATE: {
      return "Choose the version that fits the room.";
    }
    case "generating": {
      return "Your idea is taking shape.";
    }
    case "blocked-by-validation": {
      return "This draft needs a little more care.";
    }
    case "blocked-by-moderation": {
      return "Let’s reshape that request.";
    }
    case "failed-retryable": {
      return "The first pass missed a beat.";
    }
    case "failed-terminal": {
      return "That draft could not be finished.";
    }
    default: {
      return "Your lesson is taking shape.";
    }
  }
};

const TEACHER_REVIEW_DIAGNOSTIC_CODES: ReadonlySet<string> = new Set([
  "PREREQUISITE_PACK_MISSING",
  "PREREQUISITE_PATH_MISSING",
  "LEARNING_PATH_BLOCKED",
  "CURRICULUM_TENANT_MISMATCH",
  "CURRICULUM_CONTEXT_MISMATCH",
  "CURRICULUM_GRAPH_VERSION_UNSUPPORTED",
]);

const isTeacherReviewDiagnostic = (code: string): boolean =>
  TEACHER_REVIEW_DIAGNOSTIC_CODES.has(code);

const STATUS_ANNOUNCEMENTS: Partial<
  Record<PublicGenerationResult["state"], string>
> = {
  [READY_FOR_REVIEW_STATE]:
    "Four lesson variants are ready for teacher review.",
  generating: "A duplicate request is still being completed.",
};

const getStatusAnnouncement = (
  state: PublicGenerationResult["state"]
): string => {
  return (
    STATUS_ANNOUNCEMENTS[state] ??
    `Generation state: ${state.replaceAll("-", " ")}`
  );
};

const RESULT_DESCRIPTIONS: Partial<
  Record<PublicGenerationResult["state"], string>
> = {
  [READY_FOR_REVIEW_STATE]:
    "Look for the version that sounds like your classroom. You can review every one before anything moves forward.",
};

const getResultDescription = (
  result: PublicGenerationResult,
  requiresTeacherReview: boolean
): string => {
  return requiresTeacherReview
    ? "The approved prerequisite context is unavailable, so nothing has been prepared for students."
    : (RESULT_DESCRIPTIONS[result.state] ??
        "The draft remains private while we finish the safe, reviewable handoff.");
};

const getStateLabel = (state: PublicGenerationResult["state"]): string => {
  switch (state) {
    case READY_FOR_REVIEW_STATE: {
      return "Ready to review";
    }
    case "generating": {
      return "In progress";
    }
    default: {
      return "Needs a look";
    }
  }
};

const DIAGNOSTIC_SEVERITY_LABELS: Record<
  PublicGenerationResult["diagnostics"][number]["severity"],
  string
> = {
  error: "Review this",
  warning: "Worth noticing",
};

const getDiagnosticLabel = (
  diagnostic: PublicGenerationResult["diagnostics"][number]
): string => {
  return TEACHER_REVIEW_DIAGNOSTIC_CODES.has(diagnostic.code)
    ? "Teacher review"
    : DIAGNOSTIC_SEVERITY_LABELS[diagnostic.severity];
};

const getVariantNoteName = (variant: {
  readonly kind: keyof typeof variantLabels;
  readonly title: string;
}): string => `${variant.title} (${variantLabels[variant.kind]})`;

interface GroupedDiagnostic {
  readonly key: string;
  readonly label: string;
  readonly variantNames: string[];
  readonly message: string;
}

/**
 * Identical findings across variants collapse into one note that names the
 * variants it describes, so a draft with structurally repeated variants never
 * prints the same sentence twice (#168 P1-1).
 */
const groupDiagnostics = (
  diagnostics: PublicGenerationResult["diagnostics"],
  variantNameById: ReadonlyMap<string, string>
): GroupedDiagnostic[] => {
  const byKey = new Map<string, GroupedDiagnostic>();
  const groups: GroupedDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}:${diagnostic.message}`;
    const variantName = diagnostic.variantId
      ? variantNameById.get(diagnostic.variantId)
      : undefined;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label: getDiagnosticLabel(diagnostic),
        variantNames: [],
        message: diagnostic.message,
      };
      byKey.set(key, group);
      groups.push(group);
    }
    if (variantName && !group.variantNames.includes(variantName)) {
      group.variantNames.push(variantName);
    }
  }
  return groups;
};

/**
 * The edit recovery action returns the teacher to the objective field. The field keeps its current text and the caret moves to the logical end, so an edit never replaces what the teacher already wrote.
 */
const focusLessonPrompt = (): void => {
  const field = document.querySelector<HTMLTextAreaElement>("#lesson-prompt");
  if (!field) {
    return;
  }
  field.focus();
  const end = field.value.length;
  field.setSelectionRange(end, end);
};

/**
 * What each recovery action does today. Edit returns to the objective and keeps the teacher's text. Replace and retry both ask for a new generation; neither can regenerate a single screen yet, so the action label says "regenerate".
 */
const recoveryEffect = (
  action: RecoveryAction
): "focus-objective" | "regenerate" => {
  switch (action) {
    case "edit": {
      return "focus-objective";
    }
    case "replace": {
      return "regenerate";
    }
    case "retry": {
      return "regenerate";
    }
    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled recovery action: ${exhaustive}`);
    }
  }
};

const directionForLanguage = (language: PublicGenerationResult["language"]) =>
  language === "ar" ? "rtl" : "ltr";

type GenerationAttempt =
  | { readonly kind: "result"; readonly result: PublicGenerationResult }
  | { readonly kind: "unauthorized" }
  | { readonly kind: "error"; readonly message: string };

const postGenerationRequest = async (
  input: LessonGenerationInput,
  csrf: string
): Promise<GenerationAttempt> => {
  let response: Response;
  try {
    response = await fetch(GENERATE_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [csrfHeaderName]: csrf,
      },
      body: JSON.stringify(input),
    });
  } catch {
    return { kind: "error", message: GENERIC_GENERATION_FAILURE_MESSAGE };
  }

  const payload = await readResponseJson(response);

  if (!response.ok) {
    return resolveFailure(response.status, payload);
  }

  const parsed = publicGenerationResultSchema.safeParse(payload);
  return parsed.success
    ? { kind: "result", result: parsed.data }
    : { kind: "error", message: GENERIC_GENERATION_FAILURE_MESSAGE };
};

const PromptSignals = ({
  context,
  standardId,
}: {
  readonly context: PromptContext;
  readonly standardId: string;
}) => {
  return (
    <div className="prompt-signals" aria-live="polite">
      <span className="prompt-signals__label">
        <Sparkles aria-hidden="true" /> We will quietly pick up
      </span>
      <span className="prompt-signal">
        <BookOpen aria-hidden="true" /> Grade {context.grade}
      </span>
      <span className="prompt-signal">
        <span className="prompt-signal__mark" aria-hidden="true" />
        {displayStandardCode(standardId)}
      </span>
      <span className="prompt-signal">
        <Globe2 aria-hidden="true" />
        {context.language === "ar" ? "Arabic / RTL" : "English / LTR"}
      </span>
    </div>
  );
};

const TeacherGuidance = ({
  context,
  prompt,
  standardId,
}: {
  readonly context: PromptContext;
  readonly prompt: string;
  readonly standardId: string;
}) => {
  const [activePanel, setActivePanel] = useState("target");
  const safePrompt = prompt.trim() || "your learning idea";

  return (
    <section className="teacher-guidance" aria-labelledby="guidance-heading">
      <div className="teacher-guidance__rail">
        <p className="studio-kicker">A little help, quietly</p>
        <h2 id="guidance-heading">Good prompts carry more than a topic.</h2>
        <p>
          As you write, Edu-Canvas looks for the small details that help a
          visual lesson feel fair, focused, and ready to review.
        </p>
        <div className="teacher-guidance__signal">
          <span className="teacher-guidance__signal-dot" aria-hidden="true" />
          <span>Context is forming around your brief</span>
        </div>
      </div>

      <div className="teacher-guidance__content">
        <div className="insight-grid">
          <article className="insight-card insight-card--wide">
            <div className="insight-card__topline">
              <span className="insight-card__mark" aria-hidden="true">
                /
              </span>
              <span>What we heard</span>
            </div>
            <h3>{safePrompt}</h3>
            <p>
              The first draft will keep this idea at the center instead of
              asking you to translate it into a form.
            </p>
          </article>

          <article className="insight-card insight-card--warm">
            <div className="insight-card__topline">
              <BookOpen aria-hidden="true" />
              <span>Learning target</span>
            </div>
            <strong>{displayStandardCode(standardId)}</strong>
            <p>Equivalent fractions, made visible.</p>
          </article>

          <article className="insight-card insight-card--cool">
            <div className="insight-card__topline">
              <Globe2 aria-hidden="true" />
              <span>Language</span>
            </div>
            <strong>
              {context.language === "ar" ? "Arabic / RTL" : "English / LTR"}
            </strong>
            <p>We will keep the lesson readable in the language you use.</p>
          </article>

          <article className="insight-card insight-card--wide insight-card--dark">
            <div>
              <div className="insight-card__topline">
                <Layers3 aria-hidden="true" />
                <span>Room for difference</span>
              </div>
              <h3>One idea, three ways in.</h3>
              <p>
                A clear core path, a scaffold for learners who need a little
                more support, and a stretch for those ready to go further.
              </p>
            </div>
            <div className="insight-card__levels">
              <span>Core</span>
              <span>Support</span>
              <span>Stretch</span>
            </div>
          </article>
        </div>

        <div className="guidance-accordion">
          {guidancePanels.map((panel) => {
            const { Icon } = panel;
            const isActive = activePanel === panel.key;

            return (
              <button
                className={cn("guidance-panel", { "is-active": isActive })}
                type="button"
                key={panel.key}
                aria-expanded={isActive}
                onClick={() => setActivePanel(panel.key)}
              >
                <span className="guidance-panel__icon">
                  <Icon aria-hidden="true" />
                </span>{" "}
                <span className="guidance-panel__title">{panel.title}</span>{" "}
                <span className="guidance-panel__copy">
                  {isActive ? panel.detail : panel.short}
                </span>
                <ArrowRight aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <div className="teacher-marquee" aria-hidden="true">
          <div className="teacher-marquee__track">
            {[
              "clear target",
              "visible support",
              "teacher approval",
              "a reason to continue",
            ].map((item) => {
              return (
                <span key={item}>
                  {item}
                  <i aria-hidden="true" />
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

type DraftVariant = NonNullable<
  PublicGenerationResult["draft"]
>["variants"][number];

const moveChosenVariant = (
  event: ReactKeyboardEvent<HTMLInputElement>
): string | null => {
  const radios = [
    ...document.querySelectorAll<HTMLInputElement>(
      'input[name="chosen-variant"]'
    ),
  ];
  const step =
    event.key.endsWith("Right") || event.key === "ArrowDown" ? 1 : -1;
  const next =
    radios[
      (radios.indexOf(event.currentTarget) + step + radios.length) %
        radios.length
    ];
  next?.focus();
  return next?.value ?? null;
};

/**
 * The four variant cards are the chooser (#168 P0-1): a native radio group
 * whose keyboard story follows the membership screen's explicit-key pattern,
 * one primary action, and a note that keeps the publish promise honest.
 */
const VariantChooser = ({
  variants,
  chosenVariantId,
  onChoose,
  onPreview,
}: {
  readonly variants: readonly DraftVariant[];
  readonly chosenVariantId: string | null;
  readonly onChoose: (variantId: string) => void;
  readonly onPreview: (variantId: string) => void;
}) => {
  return (
    <section className="variant-stack" aria-label="Generated lesson variants">
      <fieldset className="variant-picker">
        <legend className="sr-only">
          Choose the version to open in the preview
        </legend>
        <div className="variant-picker__cards">
          {variants.map((variant) => {
            const isChosen = chosenVariantId === variant.id;
            return (
              <label
                className={cn(
                  "variant-card",
                  isChosen && "variant-card--chosen"
                )}
                key={variant.id}
              >
                <input
                  type="radio"
                  name="chosen-variant"
                  className="variant-card__radio"
                  value={variant.id}
                  aria-label={`${variantLabels[variant.kind]}, ${variant.title}`}
                  checked={isChosen}
                  onChange={() => {
                    onChoose(variant.id);
                  }}
                  onKeyDown={(event) => {
                    // Keyboard selection is set explicitly: the hidden
                    // radio's change event alone does not reach React state
                    // reliably (the membership screen ships the same explicit
                    // pattern).
                    if (event.key === " " || event.key === "Enter") {
                      event.preventDefault();
                      onChoose(variant.id);
                      return;
                    }
                    if (!event.key.startsWith("Arrow")) {
                      return;
                    }
                    event.preventDefault();
                    const next = moveChosenVariant(event);
                    if (next) {
                      onChoose(next);
                    }
                  }}
                />
                <span
                  className={
                    isChosen
                      ? "variant-card__pick variant-card__pick--on"
                      : "variant-card__pick"
                  }
                  aria-hidden="true"
                >
                  <Check aria-hidden="true" />
                </span>
                <span className="variant-card__heading">
                  <span
                    className={`variant-kind variant-kind--${variant.kind}`}
                  >
                    {variantLabels[variant.kind]}
                  </span>
                  <span>{variant.sourceItems.length} matching pieces</span>
                </span>
                <h3>{variant.title}</h3>
                <p>{variant.instructions}</p>
                <div className="variant-card__items">
                  <div>
                    <span>
                      {variant.accessibilityMetadata.sourceGroupLabel}
                    </span>
                    <strong>{variant.sourceItems.length} choices</strong>
                  </div>
                  <div>
                    <span>
                      {variant.accessibilityMetadata.targetGroupLabel}
                    </span>
                    <strong>{variant.targetItems.length} connections</strong>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>
      {chosenVariantId ? (
        <div className="variant-picker__action">
          <Button
            type="button"
            onClick={() => {
              onPreview(chosenVariantId);
            }}
          >
            Open the preview for this version
            <ArrowRight aria-hidden="true" />
          </Button>
          <span>You choose what students see next; nothing is shared yet.</span>
        </div>
      ) : null}
    </section>
  );
};

interface GenerationResultProperties {
  readonly result: PublicGenerationResult;
  readonly onRetry: (event: SyntheticEvent<HTMLFormElement>) => void;
  readonly onRecover: (action: RecoveryAction, variantId?: string) => void;
  readonly onOpenReview: (requestId: string) => void;
}

const GenerationResult = ({
  result,
  onRetry,
  onRecover,
  onOpenReview,
}: GenerationResultProperties) => {
  // A blocked record has no draft, so the record input language keeps the
  // result in its own reading direction.
  const direction = directionForLanguage(result.language);
  const requiresTeacherReview = result.diagnostics.some((diagnostic) =>
    isTeacherReviewDiagnostic(diagnostic.code)
  );
  const isBlockedByValidation = result.state === BLOCKED_BY_VALIDATION_STATE;
  const hasValidationFindings =
    result.diagnosticsRollup.screens.length > 0 ||
    result.diagnosticsRollup.flow.length > 0;
  const hasVisibleValidationPanel =
    isBlockedByValidation && hasValidationFindings;

  // #168 P0-1: the variant cards are the chooser. Selection is in-page state
  // for now; the decision endpoint belongs to the teacher-decisions seam (#8).
  const [chosenVariantId, setChosenVariantId] = useState<string | null>(null);
  const [previewVariantId, setPreviewVariantId] = useState<string | null>(null);
  const variants = result.draft?.variants ?? [];
  const variantNameById = new Map(
    variants.map((variant) => [variant.id, getVariantNoteName(variant)])
  );
  const diagnosticGroups = groupDiagnostics(
    result.diagnostics,
    variantNameById
  );

  return (
    <div
      className="generation-result teacher-result"
      dir={direction}
      lang={result.language}
    >
      {isBlockedByValidation ? null : (
        <output className="sr-only">
          {getStatusAnnouncement(result.state)}
        </output>
      )}
      <div className="generation-result__header teacher-result__header">
        <div>
          <p className="studio-kicker">Your first pass</p>
          <h2>{getResultTitle(result.state)}</h2>
          <p className="teacher-result__description">
            {getResultDescription(result, requiresTeacherReview)}
          </p>
        </div>
        <span className={`result-state result-state--${result.state}`}>
          <span aria-hidden="true" />
          {getStateLabel(result.state)}
        </span>
      </div>

      {hasVisibleValidationPanel ? (
        <ValidationDiagnostics
          rollup={result.diagnosticsRollup}
          requestId={result.requestId}
          direction={direction}
          language={result.language}
          onRecover={onRecover}
        />
      ) : null}

      {!hasVisibleValidationPanel && result.diagnostics.length > 0 ? (
        <ul
          className="diagnostic-list teacher-diagnostics"
          aria-label="Draft notes"
        >
          {diagnosticGroups.map((group) => {
            return (
              <li key={group.key}>
                <strong>
                  {group.label}
                  {group.variantNames.length > 0
                    ? ` · ${group.variantNames.join(", ")}`
                    : ""}
                </strong>
                <span>{group.message}</span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {requiresTeacherReview ? (
        <section
          className="teacher-review-state"
          aria-label="Teacher review required"
        >
          <strong>Teacher review required before continuing</strong>
          <p>
            Check that the approved prerequisite pack is available, then try the
            draft again. No unreviewed student content was created.
          </p>
        </section>
      ) : null}

      {result.draft ? (
        <>
          <div className="teacher-review-layout">
            <aside
              className="teacher-evidence-card"
              aria-label="Lesson context"
            >
              <div className="teacher-evidence-card__topline">
                <span>Keep this in sight</span>
                <ShieldCheck aria-hidden="true" />
              </div>
              <strong>{displayStandardCode(result.draft.standardId)}</strong>
              <p>Equivalent fractions for Grade {result.draft.grade}.</p>
              <dl>
                <div>
                  <dt>Paths ready</dt>
                  <dd>{result.draft.variants.length}</dd>
                </div>
                <div>
                  <dt>Next step</dt>
                  <dd>Your review</dd>
                </div>
              </dl>
              <p className="teacher-evidence-card__note">
                The learning target stays visible while you choose what belongs
                in the room.
              </p>
            </aside>

            <VariantChooser
              variants={variants}
              chosenVariantId={chosenVariantId}
              onChoose={setChosenVariantId}
              onPreview={setPreviewVariantId}
            />
          </div>

          {result.state === READY_FOR_REVIEW_STATE ? (
            <>
              <LessonPreview
                key={result.requestId}
                requestId={result.requestId}
                catalogVersion={result.provenance?.catalogVersion}
                focusVariantId={previewVariantId}
              />
              <div className="teacher-result__cta">
                <Button
                  type="button"
                  onClick={() => onOpenReview(result.requestId)}
                >
                  <ShieldCheck aria-hidden="true" />
                  Review and publish this pack
                  <ArrowRight aria-hidden="true" />
                </Button>
                <p>
                  Approve every screen and the reverse path. Nothing reaches
                  students until you publish.
                </p>
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {result.retry.available ? (
        <form onSubmit={onRetry}>
          <Button type="submit" variant="outline" className="retry-button">
            Try that again <ArrowRight aria-hidden="true" />
          </Button>
        </form>
      ) : null}

      {result.draft ? (
        <div className="teacher-result__footer">
          <span>
            <Check aria-hidden="true" /> You choose what students see next.
          </span>
          <span>Draft stays private until approved.</span>
        </div>
      ) : null}
    </div>
  );
};

interface TeacherLessonComposerProperties {
  readonly csrf: string;
  readonly generation: string;
  readonly onOpenReview: (requestId: string) => void;
  readonly onUnauthorized: () => void;
  readonly standardId: string;
}

const TeacherLessonComposer = ({
  csrf,
  generation,
  onOpenReview,
  onUnauthorized,
  standardId,
}: TeacherLessonComposerProperties) => {
  const [prompt, setPrompt] = useState("equivalent fractions for grade 4");
  const requestKeyReference = useRef("");
  const submittingReference = useRef(false);
  // Mirrors the live session generation so a response that lands after the
  // session changed (sign-out, expiry, renewal) is discarded instead of shown.
  const generationReference = useRef(generation);
  const [result, setResult] = useState<PublicGenerationResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  // #168 P0-2: on failure the inline status next to Create lesson receives
  // focus, so the cause lands in view and in the screen reader's mouth.
  const statusReference = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    if (requestError) {
      statusReference.current?.focus();
    }
  }, [requestError]);
  // The reviewed source snapshot the next draft is grounded in (#114). Null
  // keeps the prompt-only path the focused event composer relies on.
  const [boundSource, setBoundSource] = useState<BoundSource | null>(null);
  const context = getPromptContext(prompt);

  useEffect(() => {
    generationReference.current = generation;
  }, [generation]);

  const updateRequestKey = () => {
    requestKeyReference.current = "";
    setResult(null);
    setRequestError(null);
  };

  const submitGeneration = async (
    event: SyntheticEvent<HTMLFormElement> | undefined,
    retryOfRequestId?: string
  ): Promise<void> => {
    event?.preventDefault();
    if (submittingReference.current) {
      return;
    }
    submittingReference.current = true;
    setIsGenerating(true);
    setRequestError(null);

    const startedGeneration = generationReference.current;

    // Browser crypto has no UUIDv7, and this key needs uniqueness only.
    const idempotencyKey = retryOfRequestId
      ? crypto.randomUUID()
      : requestKeyReference.current || crypto.randomUUID();
    if (!retryOfRequestId) {
      requestKeyReference.current = idempotencyKey;
    }

    const input: LessonGenerationInput = {
      prompt,
      grade: context.grade,
      standardId,
      language: context.language,
      difficulty: context.difficulty,
      idempotencyKey,
      ...(retryOfRequestId && { retryOfRequestId }),
      ...(boundSource && { sourceSnapshotId: boundSource.id }),
    };

    const stopSubmitting = (): void => {
      submittingReference.current = false;
      setIsGenerating(false);
    };

    const attempt = await postGenerationRequest(input, csrf);

    if (generationReference.current !== startedGeneration) {
      // The session changed while this request was in flight; drop the result.
      stopSubmitting();
      return;
    }

    stopSubmitting();

    switch (attempt.kind) {
      case "result": {
        setResult(attempt.result);
        break;
      }
      case "unauthorized": {
        setResult(null);
        onUnauthorized();
        break;
      }
      default: {
        setResult(null);
        setRequestError(attempt.message);
      }
    }
  };

  return (
    <section className="teacher-studio" aria-labelledby="generation-heading">
      <div className="teacher-hero">
        <div className="teacher-hero__copy">
          <p className="studio-kicker">
            <span className="studio-kicker__line" aria-hidden="true" />A calmer
            way to begin
          </p>
          <h1 id="generation-heading">
            Make the idea{" "}
            <span className="inline-fraction-art" aria-hidden="true">
              <span>1</span>
              <i />
              <span>2</span>
            </span>{" "}
            click.
          </h1>
          <p className="teacher-hero__description">
            Describe the learning moment in your own words. We will shape a
            clear first draft, then you decide what is worth sharing.
          </p>
        </div>
        <div className="teacher-hero__art" aria-hidden="true">
          <div className="teacher-hero__art-image" />
          <div className="fraction-orbit fraction-orbit--one">
            <span>1</span>
            <i />
            <span>2</span>
          </div>
          <div className="fraction-orbit fraction-orbit--two">
            <span>2</span>
            <i />
            <span>4</span>
          </div>
          <div className="teacher-hero__art-note">same whole, new view</div>
        </div>
      </div>

      <form className="prompt-composer" onSubmit={submitGeneration}>
        <div className="prompt-composer__heading">
          <label htmlFor="lesson-prompt" id="lesson-prompt-label">
            What should students practice?
          </label>
          <span>{prompt.length}/500</span>
        </div>
        <textarea
          id="lesson-prompt"
          name="prompt"
          aria-labelledby="lesson-prompt-label"
          required
          maxLength={500}
          rows={1}
          value={prompt}
          placeholder="e.g. equivalent fractions for grade 4"
          onChange={(event) => {
            setPrompt(event.target.value);
            updateRequestKey();
          }}
        />
        <div className="prompt-composer__bottom">
          <PromptSignals context={context} standardId={standardId} />
          {boundSource ? (
            <span className="prompt-composer__source-chip">
              <FileText aria-hidden="true" />
              <span>
                Source: <strong>{boundSource.fileName}</strong>
              </span>
            </span>
          ) : null}
          <Button
            type="submit"
            size="lg"
            className="prompt-composer__submit"
            disabled={isGenerating}
          >
            <WandSparkles aria-hidden="true" />
            {isGenerating ? "Shaping the draft…" : "Create lesson"}
            {isGenerating ? null : <ArrowRight aria-hidden="true" />}
          </Button>
        </div>
        {/* #168 P0-2: progress and failure feedback sit with the submit
            button, in the form, where a teacher looks for it — the guidance
            rail never stands between them. */}
        <output
          className="generation-status teacher-generation-status"
          aria-live="polite"
          tabIndex={-1}
          ref={statusReference}
        >
          {isGenerating ? (
            <p className="status-pulse">
              <span aria-hidden="true" /> Reading the idea, finding the cleanest
              path…
            </p>
          ) : null}
          {requestError ? (
            <p className="generation-error">
              {requestError}
              <span className="generation-error__hint">
                Fix the objective or the source, then press Create lesson again.
              </span>
            </p>
          ) : null}
        </output>
      </form>

      <SourcePanel
        csrf={csrf}
        onUnauthorized={onUnauthorized}
        boundSource={boundSource}
        onBoundSnapshotChange={setBoundSource}
      />

      <div className="teacher-trust-line">
        <ShieldCheck aria-hidden="true" />
        <span>
          Private draft first. You approve every version before students see it.
        </span>
      </div>

      <TeacherGuidance
        context={context}
        prompt={prompt}
        standardId={standardId}
      />

      {result ? (
        <GenerationResult
          key={result.requestId}
          result={result}
          onOpenReview={onOpenReview}
          onRetry={(event) => {
            submitGeneration(event, result.requestId);
          }}
          onRecover={(action) => {
            if (recoveryEffect(action) === "focus-objective") {
              focusLessonPrompt();
              return;
            }
            void submitGeneration(undefined, result.requestId);
          }}
        />
      ) : (
        <div className="teacher-action-band">
          <div>
            <p className="studio-kicker">Ready when you are</p>
            <p>One sentence is enough to start a useful conversation.</p>
          </div>
          <span>
            <Check aria-hidden="true" />
            Nothing publishes automatically
          </span>
        </div>
      )}
    </section>
  );
};

/**
The authenticated teacher studio. It renders the lesson composer against the
session-bound HTTP seam; a `401` hands control back through `onUnauthorized` so
the workspace route can hide private content.
*/
export const TeacherStudio = ({
  csrf,
  generation,
  reviewRequestId,
  onOpenReview,
  onCloseReview,
  onUnauthorized,
}: TeacherStudioProperties) => {
  if (reviewRequestId) {
    return (
      <ReviewStudio
        requestId={reviewRequestId}
        csrf={csrf}
        onClose={onCloseReview}
        onUnauthorized={onUnauthorized}
      />
    );
  }

  return (
    <TeacherLessonComposer
      csrf={csrf}
      generation={generation}
      onOpenReview={onOpenReview}
      onUnauthorized={onUnauthorized}
      standardId={DEFAULT_STANDARD_ID}
    />
  );
};
