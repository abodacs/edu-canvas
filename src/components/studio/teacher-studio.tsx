import { ArrowRight, CircleAlert, CircleX, FileText, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { readResponseJson } from "@/lib/http";
import {
  GENERIC_GENERATION_FAILURE_MESSAGE,
  resolveFailure,
} from "@/lib/generation-failures";
import { cn } from "@/lib/utilities";
import { LessonPreview } from "@/components/a2ui/lesson-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { Steps } from "@/components/ui/steps";
import { ModerationRecoveryPanel } from "@/components/studio/moderation-recovery-panel";
import { ReviewStudio } from "@/components/studio/review-studio";
import { SourcePanel } from "@/components/studio/source-panel";
import { useStoredDraft } from "@/components/studio/use-stored-draft";
import {
  boardHeading,
  groupDiagnostics,
  readyCountLine,
  isTeacherReviewDiagnostic,
  variantLetter,
  variantStatus,
} from "@/components/studio/teacher-studio-board";
import { ValidationDiagnostics } from "@/components/studio/validation-diagnostics";
import type {
  GroupedDiagnostic,
  VariantStatus,
} from "@/components/studio/teacher-studio-board";
import { csrfHeaderName } from "@/shared/identity-contract";
import { publicGenerationResultSchema } from "@/shared/generation-contract";
import {
  displayStandardCode,
  displayStandardTopic,
} from "@/shared/standard-display";
import type { GenerationFailure } from "@/lib/generation-failures";
import type { BoundSource } from "@/components/studio/source-panel";
import type {
  LessonGenerationInput,
  ModerationCategory,
  PublicGenerationResult,
  RecoveryAction,
} from "@/shared/generation-contract";

import type {
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  RefObject,
  SyntheticEvent,
} from "react";

interface TeacherStudioProperties {
  readonly csrf: string;
  readonly generation: string;
  readonly reviewRequestId?: string;
  /** A persisted draft to open in the composer (`/workspace?draft=<id>`). */
  readonly draftRequestId?: string;
  readonly onOpenReview: (requestId: string) => void;
  readonly onCloseReview: () => void;
  readonly onUnauthorized: () => void;
}

/**
The seeded synthetic curriculum every draft is generated against. The identity session projection carries no curriculum id, so the studio pins the classroom's current standard here until a teacher can choose one.
*/
const DEFAULT_STANDARD_ID = "standard_ccss_4_nf_a_01";

/** The page names the standard's topic; an unknown pin reads "New lesson". */
const topicFor = (standardId: string): string =>
  displayStandardTopic(standardId) ?? "New lesson";

const GENERATE_ENDPOINT = "/api/lessons/generate";

const PROMPT_MAX_LENGTH = 500;

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

const languageNames = { en: "English", ar: "Arabic" } as const;

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
const GENERATING_STATE = "generating";
const BLOCKED_BY_VALIDATION_STATE = "blocked-by-validation";
const BLOCKED_BY_MODERATION_STATE = "blocked-by-moderation";

// #119: the same-prompt refusal opens the same panel as a blocked result.
const REVISION_REQUIRED_CODE = "MODERATION_REVISION_REQUIRED";

const moderationCategoryOf = (
  result: PublicGenerationResult
): ModerationCategory | null => {
  return (
    result.diagnostics.find((diagnostic) => diagnostic.moderationCategory)
      ?.moderationCategory ?? null
  );
};

/** The heading of a result that has no variants to show. */
const getResultTitle = (state: PublicGenerationResult["state"]): string => {
  switch (state) {
    case "generating": {
      return "This draft is still being written.";
    }
    case "blocked-by-validation": {
      return "This draft can’t go to students yet.";
    }
    case "blocked-by-moderation": {
      return "This objective can’t be drafted for students.";
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

/** The short line above a result heading: what kind of state this is. */
const getResultMeta = (state: PublicGenerationResult["state"]): string => {
  switch (state) {
    case "generating": {
      return "In progress";
    }
    case "blocked-by-validation": {
      return "Blocked by validation · not shown to students";
    }
    default: {
      return "Draft not finished · nothing was shared";
    }
  }
};

const STATUS_ANNOUNCEMENTS: Partial<
  Record<PublicGenerationResult["state"], string>
> = {
  [READY_FOR_REVIEW_STATE]: "Lesson variants are ready for teacher review.",
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

const getResultDescription = (
  result: PublicGenerationResult,
  requiresTeacherReview: boolean
): string => {
  if (requiresTeacherReview) {
    return "The approved prerequisite context is unavailable, so nothing has been prepared for students.";
  }
  if (result.state === BLOCKED_BY_VALIDATION_STATE) {
    return "The server checks found problems in the draft. Nothing was shown to students. Fix each one below, or draft again.";
  }
  return "The draft stays private. Nothing was shown to students.";
};

const getVariantNoteName = (variant: {
  readonly kind: keyof typeof variantLabels;
  readonly title: string;
}): string => `${variant.title} (${variantLabels[variant.kind]})`;

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
  | GenerationFailure
  | { readonly kind: "result"; readonly result: PublicGenerationResult };

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
    return {
      kind: "error",
      message: GENERIC_GENERATION_FAILURE_MESSAGE,
      code: null,
    };
  }

  const payload = await readResponseJson(response);

  if (!response.ok) {
    return resolveFailure(response.status, payload);
  }

  const parsed = publicGenerationResultSchema.safeParse(payload);
  return parsed.success
    ? { kind: "result", result: parsed.data }
    : {
        kind: "error",
        message: GENERIC_GENERATION_FAILURE_MESSAGE,
        code: null,
      };
};

/** The page header: where the teacher is in the flow, and what the page is. */
const StudioHeader = ({ standardId }: { readonly standardId: string }) => {
  return (
    <header className="studio-head">
      <Steps
        label="Lesson steps"
        items={[
          { label: "Draft", state: "current" },
          { label: "Review", state: "upcoming" },
          { label: "Publish", state: "upcoming" },
        ]}
      />
      <h1 id="generation-heading">{topicFor(standardId)}</h1>
      <p className="studio-lede">
        One learning objective in, several ways to teach it out. Nothing reaches
        a student until you approve it.
      </p>
    </header>
  );
};

const StandardCode = ({ standardId }: { readonly standardId: string }) => (
  <span className="studio-code">{displayStandardCode(standardId)}</span>
);

/**
 * Once a draft exists the composer collapses to one line: the objective as
 * sent, what it was matched to, and the two ways to change it.
 */
const ObjectiveSummary = ({
  prompt,
  context,
  standardId,
  isBusy,
  status,
  onEdit,
  onDraftAgain,
}: {
  readonly prompt: string;
  readonly context: PromptContext;
  readonly standardId: string;
  readonly isBusy: boolean;
  readonly status: ReactNode;
  readonly onEdit: () => void;
  readonly onDraftAgain: () => void;
}) => {
  return (
    <>
      <Card
        as="section"
        className="objective-summary"
        aria-label="Lesson objective"
      >
        <div>
          <p className="objective-summary__text">{prompt}</p>
          <p className="objective-summary__meta">
            <StandardCode standardId={standardId} />
            <span>
              Grade {context.grade} · {languageNames[context.language]}
            </span>
          </p>
        </div>
        <div className="objective-summary__actions">
          <Button type="button" variant="secondary" onClick={onEdit}>
            Edit objective
          </Button>
          <Button
            type="button"
            variant="secondary"
            busy={isBusy}
            onClick={onDraftAgain}
            aria-describedby="draft-again-hint"
          >
            Draft again
          </Button>
        </div>
      </Card>
      {status}
      <p className="studio-hint" id="draft-again-hint">
        “Draft again” writes a new draft from the same objective. Nothing is
        shared until you approve it.
      </p>
    </>
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

const VariantCard = ({
  variant,
  index,
  isChosen,
  status,
  onChoose,
}: {
  readonly variant: DraftVariant;
  readonly index: number;
  readonly isChosen: boolean;
  readonly status: VariantStatus;
  readonly onChoose: (variantId: string) => void;
}) => {
  const tag = `${variantLetter(index)} · ${variantLabels[variant.kind]}`;
  const radioId = `variant-choice-${variant.id}`;
  const detailsId = `variant-details-${variant.id}`;
  // A label holds phrasing content only, so it wraps the title alone and
  // stretches over the card (studio.css) to keep the whole card clickable.
  return (
    <div className={cn("variant-card", isChosen && "variant-card--chosen")}>
      <span className="variant-card__tag">{tag}</span>
      <h3>
        <input
          type="radio"
          id={radioId}
          name="chosen-variant"
          className="variant-card__radio"
          value={variant.id}
          aria-describedby={detailsId}
          checked={isChosen}
          onChange={() => {
            onChoose(variant.id);
          }}
          onKeyDown={(event) => {
            // Keyboard selection is set explicitly: the hidden radio's change
            // event alone does not reach React state reliably (the membership
            // screen ships the same explicit pattern).
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
        <label htmlFor={radioId} className="variant-card__label">
          <span className="sr-only">{tag}: </span>
          {variant.title}
        </label>
      </h3>
      <div id={detailsId} className="variant-card__details">
        <p>{variant.instructions}</p>
        <p className="variant-card__gets">
          Students get: matching, {variant.sourceItems.length}{" "}
          {variant.accessibilityMetadata.sourceGroupLabel.toLowerCase()} to{" "}
          {variant.targetItems.length}{" "}
          {variant.accessibilityMetadata.targetGroupLabel.toLowerCase()}
        </p>
      </div>
      <span className="variant-card__foot">
        <Badge tone={status.tone}>{status.label}</Badge>
        {isChosen ? (
          <span className="variant-card__chosen">Selected</span>
        ) : null}
      </span>
    </div>
  );
};

/**
 * The variant cards are the chooser (#168 P0-1): a native radio group whose
 * keyboard story follows the membership screen's explicit-key pattern, and
 * one action that opens the chosen card in the preview.
 */
const VariantChooser = ({
  variants,
  diagnostics,
  chosenVariantId,
  onChoose,
  onPreview,
}: {
  readonly variants: readonly DraftVariant[];
  readonly diagnostics: PublicGenerationResult["diagnostics"];
  readonly chosenVariantId: string | null;
  readonly onChoose: (variantId: string) => void;
  readonly onPreview: (variantId: string) => void;
}) => {
  return (
    <div className="variant-stack">
      <fieldset className="variant-picker">
        <legend className="sr-only">
          Choose the variant to open in the preview
        </legend>
        <div className="variant-board">
          {variants.map((variant, index) => {
            return (
              <VariantCard
                key={variant.id}
                variant={variant}
                index={index}
                isChosen={chosenVariantId === variant.id}
                status={variantStatus(variant.id, diagnostics)}
                onChoose={onChoose}
              />
            );
          })}
        </div>
      </fieldset>
      {chosenVariantId ? (
        <div className="variant-picker__action">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onPreview(chosenVariantId);
            }}
          >
            Open the preview for this variant
            <ArrowRight aria-hidden="true" className="studio-flip" />
          </Button>
          <span>Nothing is shared yet.</span>
        </div>
      ) : null}
    </div>
  );
};

const DraftNotes = ({
  groups,
}: {
  readonly groups: readonly GroupedDiagnostic[];
}) => {
  return (
    <Notice tone="warn" title="Notes from the checks">
      <ul className="draft-notes" aria-label="Draft notes">
        {groups.map((group) => {
          return (
            <li key={group.key}>
              <strong>
                {group.label}
                {group.variantNames.length > 0
                  ? ` · ${group.variantNames.join(", ")}`
                  : ""}
              </strong>{" "}
              <span>{group.message}</span>
            </li>
          );
        })}
      </ul>
    </Notice>
  );
};

interface GenerationResultProperties {
  readonly result: PublicGenerationResult;
  readonly onRetry: (event: SyntheticEvent<HTMLFormElement>) => void;
  readonly onRecover: (action: RecoveryAction, variantId?: string) => void;
  readonly onOpenReview: (requestId: string) => void;
}

/** The ready board: heading, count, notes, the cards, and the preview. */
const VariantBoard = ({
  result,
  draft,
  diagnosticGroups,
  onOpenReview,
}: {
  readonly result: PublicGenerationResult;
  readonly draft: NonNullable<PublicGenerationResult["draft"]>;
  readonly diagnosticGroups: readonly GroupedDiagnostic[];
  readonly onOpenReview: (requestId: string) => void;
}) => {
  // #168 P0-1: the variant cards are the chooser. Selection is in-page state
  // for now; the decision endpoint belongs to the teacher-decisions seam (#8).
  const [chosenVariantId, setChosenVariantId] = useState<string | null>(null);
  const [previewVariantId, setPreviewVariantId] = useState<string | null>(null);
  const { variants } = draft;
  const isReady = result.state === READY_FOR_REVIEW_STATE;

  return (
    <section
      className="variant-section"
      aria-labelledby="variant-board-heading"
    >
      <div className="board-head">
        <h2 id="variant-board-heading">{boardHeading(variants.length)}</h2>
        <p className="board-head__count">
          {isReady
            ? readyCountLine(variants, result.diagnostics)
            : "Not ready yet"}{" "}
          · Grade {draft.grade}
        </p>
        {isReady ? (
          <Button type="button" onClick={() => onOpenReview(result.requestId)}>
            Review variants
            <ArrowRight aria-hidden="true" className="studio-flip" />
          </Button>
        ) : null}
      </div>
      <p className="board-why">
        Different ways into the same objective. Approve only the ones you’d use;
        when you publish, each learner gets one.
      </p>
      {diagnosticGroups.length > 0 ? (
        <DraftNotes groups={diagnosticGroups} />
      ) : null}
      <VariantChooser
        variants={variants}
        diagnostics={result.diagnostics}
        chosenVariantId={chosenVariantId}
        onChoose={setChosenVariantId}
        onPreview={setPreviewVariantId}
      />
      {isReady ? (
        <LessonPreview
          key={result.requestId}
          requestId={result.requestId}
          catalogVersion={result.provenance?.catalogVersion}
          focusVariantId={previewVariantId}
        />
      ) : null}
    </section>
  );
};

/**
 * A result with nothing to choose: blocked, failed, still generating, or
 * waiting on teacher review. It renders as one state card in the 6-errors
 * shape: what happened, what is safe, and the one thing to do next.
 */
const ResultStateCard = ({
  result,
  requiresTeacherReview,
  diagnosticGroups,
  onRetry,
  onRecover,
}: {
  readonly result: PublicGenerationResult;
  readonly requiresTeacherReview: boolean;
  readonly diagnosticGroups: readonly GroupedDiagnostic[];
  readonly onRetry: (event: SyntheticEvent<HTMLFormElement>) => void;
  readonly onRecover: (action: RecoveryAction, variantId?: string) => void;
}) => {
  const direction = directionForLanguage(result.language);
  const isBlockedByValidation = result.state === BLOCKED_BY_VALIDATION_STATE;
  const hasValidationFindings =
    result.diagnosticsRollup.screens.length > 0 ||
    result.diagnosticsRollup.flow.length > 0;
  const hasValidationPanel = isBlockedByValidation && hasValidationFindings;
  const MetaIcon = isBlockedByValidation ? CircleX : CircleAlert;

  return (
    <Card
      as="section"
      className="result-card"
      data-state={result.state}
      aria-labelledby="result-card-heading"
    >
      <p className="result-card__meta">
        <MetaIcon aria-hidden="true" />
        {getResultMeta(result.state)}
      </p>
      <h2 id="result-card-heading">{getResultTitle(result.state)}</h2>
      <p className="result-card__body">
        {getResultDescription(result, requiresTeacherReview)}
      </p>

      {hasValidationPanel ? (
        <ValidationDiagnostics
          rollup={result.diagnosticsRollup}
          requestId={result.requestId}
          direction={direction}
          language={result.language}
          onRecover={onRecover}
        />
      ) : null}

      {!hasValidationPanel && diagnosticGroups.length > 0 ? (
        <DraftNotes groups={diagnosticGroups} />
      ) : null}

      {requiresTeacherReview ? (
        <Notice tone="stop" title="Teacher review required before continuing">
          <p>
            Check that the approved prerequisite pack is available, then try the
            draft again. No unreviewed student content was created.
          </p>
        </Notice>
      ) : null}

      {result.retry.available ? (
        <form onSubmit={onRetry} className="result-card__actions">
          <Button type="submit" className="retry-button">
            Try that again
            <ArrowRight aria-hidden="true" className="studio-flip" />
          </Button>
        </form>
      ) : null}
    </Card>
  );
};

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
  const variants = result.draft?.variants ?? [];
  const variantNameById = new Map(
    variants.map((variant) => [variant.id, getVariantNoteName(variant)])
  );
  const diagnosticGroups = groupDiagnostics(
    result.diagnostics,
    variantNameById
  );
  const showsBoard = result.draft !== null && !requiresTeacherReview;

  return (
    <div className="generation-result" dir={direction} lang={result.language}>
      {isBlockedByValidation ? null : (
        <output className="sr-only">
          {getStatusAnnouncement(result.state)}
        </output>
      )}
      {showsBoard && result.draft ? (
        <VariantBoard
          result={result}
          draft={result.draft}
          diagnosticGroups={diagnosticGroups}
          onOpenReview={onOpenReview}
        />
      ) : (
        <ResultStateCard
          result={result}
          requiresTeacherReview={requiresTeacherReview}
          diagnosticGroups={diagnosticGroups}
          onRetry={onRetry}
          onRecover={onRecover}
        />
      )}
    </div>
  );
};

interface TeacherLessonComposerProperties {
  readonly csrf: string;
  readonly generation: string;
  readonly draftRequestId?: string;
  readonly onOpenReview: (requestId: string) => void;
  readonly onUnauthorized: () => void;
  readonly standardId: string;
}

interface TeacherComposerOutcomeProperties {
  readonly prompt: string;
  readonly visibleResult: PublicGenerationResult | null;
  readonly blockedResult: PublicGenerationResult | null;
  readonly hasModerationPanel: boolean;
  readonly hasEarlierDraft: boolean;
  readonly onOpenReview: (requestId: string) => void;
  readonly onRetry: (
    event: SyntheticEvent<HTMLFormElement>,
    requestId: string
  ) => void;
  readonly onRecover: (action: RecoveryAction, requestId: string) => void;
  readonly onRevise: (requestId: string | null) => void;
}

/**
The composer's result area. A moderation block replaces the result with the
recovery panel; an earlier ready draft stays mounted below it, unchanged (#119
variant B). The panel's focus and live region live in the panel itself.
*/
const TeacherComposerOutcome = ({
  prompt,
  visibleResult,
  blockedResult,
  hasModerationPanel,
  hasEarlierDraft,
  onOpenReview,
  onRetry,
  onRecover,
  onRevise,
}: TeacherComposerOutcomeProperties) => {
  const blockedRequestId = blockedResult?.requestId ?? null;
  const blockedCategory = blockedResult
    ? moderationCategoryOf(blockedResult)
    : null;

  return (
    <>
      {hasModerationPanel ? (
        <ModerationRecoveryPanel
          objective={prompt}
          requestId={blockedRequestId}
          category={blockedCategory}
          hasEarlierDraft={hasEarlierDraft}
          onRevise={() => onRevise(blockedRequestId)}
        />
      ) : null}

      {visibleResult ? (
        <GenerationResult
          key={visibleResult.requestId}
          result={visibleResult}
          onOpenReview={onOpenReview}
          onRetry={(event) => onRetry(event, visibleResult.requestId)}
          onRecover={(action) => onRecover(action, visibleResult.requestId)}
        />
      ) : null}
    </>
  );
};

const composerBusyMessage = (
  isOpeningDraft: boolean,
  isGenerating: boolean
): string | null => {
  if (isOpeningDraft) {
    return "Opening the saved draft…";
  }
  if (isGenerating) {
    return "Drafting the variants and checking them on the server…";
  }
  return null;
};

/**
The status line beside Create lesson: opening a saved draft, generating, or
the failure the teacher can fix. Both tones come from the shared Notice, so
they look and announce like every other in-page message. The wrapper receives
focus on failure (#168 P0-2) so the cause lands in view.
*/
const ComposerStatus = ({
  statusRef,
  isOpeningDraft,
  isGenerating,
  requestError,
}: {
  readonly statusRef: RefObject<HTMLDivElement | null>;
  readonly isOpeningDraft: boolean;
  readonly isGenerating: boolean;
  readonly requestError: string | null;
}) => {
  const busyMessage = composerBusyMessage(isOpeningDraft, isGenerating);

  return (
    <div className="composer-status" tabIndex={-1} ref={statusRef}>
      {busyMessage ? (
        <Notice tone="info">
          <p className="status-pulse">
            <span aria-hidden="true" /> {busyMessage}
          </p>
        </Notice>
      ) : null}
      {requestError ? (
        <Notice tone="stop">
          <p>{requestError}</p>
          <p className="generation-error__hint">
            Fix the objective or the source, then press Create lesson again.
          </p>
        </Notice>
      ) : null}
    </div>
  );
};

/**
The facts the next draft is built on. They are read from the objective, not
chosen, so they render as a description list and change as the teacher types.
*/
const ComposerFacts = ({
  context,
  standardId,
}: {
  readonly context: PromptContext;
  readonly standardId: string;
}) => {
  return (
    <div className="composer__facts">
      <dl>
        <div>
          <dt>Grade</dt>
          <dd>Grade {context.grade}</dd>
        </div>
        <div>
          <dt>Language</dt>
          <dd>{languageNames[context.language]}</dd>
        </div>
        <div className="composer__fact--wide">
          <dt>Matched standard</dt>
          <dd className="composer__standard">
            <StandardCode standardId={standardId} />
            <span>{topicFor(standardId)}</span>
          </dd>
        </div>
      </dl>
      <p className="studio-hint">
        Read from your objective. Name a grade or write in Arabic to change
        them.
      </p>
    </div>
  );
};

/**
The open composer card (1-studio mock): the objective form, the source attach
row, the facts the draft reads, and a footer where Create lesson and its status
sit together. Create lesson submits the form through its `form` attribute, so
the source panel's own forms never nest inside it.
*/
const OpenComposer = ({
  csrf,
  prompt,
  context,
  standardId,
  boundSource,
  isBusy,
  status,
  onPromptChange,
  onSubmit,
  onBoundSourceChange,
  onUnauthorized,
}: {
  readonly csrf: string;
  readonly prompt: string;
  readonly context: PromptContext;
  readonly standardId: string;
  readonly boundSource: BoundSource | null;
  readonly isBusy: boolean;
  readonly status: ReactNode;
  readonly onPromptChange: (value: string) => void;
  readonly onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  readonly onBoundSourceChange: (source: BoundSource | null) => void;
  readonly onUnauthorized: () => void;
}) => {
  return (
    <Card
      as="section"
      variant="lift"
      className="composer"
      aria-label="New lesson"
    >
      <form
        id="lesson-composer"
        className="prompt-composer"
        onSubmit={onSubmit}
      >
        <label htmlFor="lesson-prompt" id="lesson-prompt-label">
          What should students practice?
        </label>
        <textarea
          id="lesson-prompt"
          name="prompt"
          aria-labelledby="lesson-prompt-label"
          aria-describedby="lesson-prompt-count"
          required
          maxLength={PROMPT_MAX_LENGTH}
          rows={2}
          value={prompt}
          placeholder="e.g. equivalent fractions for grade 4"
          onChange={(event) => {
            onPromptChange(event.target.value);
          }}
        />
        <p className="prompt-composer__count" id="lesson-prompt-count">
          {prompt.length} of {PROMPT_MAX_LENGTH} characters
        </p>
      </form>

      <SourcePanel
        csrf={csrf}
        onUnauthorized={onUnauthorized}
        boundSource={boundSource}
        onBoundSnapshotChange={onBoundSourceChange}
      />

      <ComposerFacts context={context} standardId={standardId} />

      <div className="composer__foot">
        {/* #168 P0-2: progress and failure feedback sit with the submit
            button, where a teacher looks for it. */}
        {status}
        <div className="composer__submit-row">
          <span className="composer__private">
            <Lock aria-hidden="true" />
            Drafts stay private until you approve them
          </span>
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
            form="lesson-composer"
            size="lg"
            className="prompt-composer__submit"
            busy={isBusy}
          >
            Create lesson
            <ArrowRight aria-hidden="true" className="studio-flip" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

interface ReopenedDraftTargets {
  readonly setPrompt: (prompt: string) => void;
  readonly setResult: (result: PublicGenerationResult | null) => void;
  readonly setPriorDraft: (result: PublicGenerationResult | null) => void;
  readonly setFailure: (failure: GenerationFailure | null) => void;
  /** The reopened request is not the composer's last submission. */
  readonly forgetLastSubmission: () => void;
  readonly onUnauthorized: () => void;
}

/**
Wires a draft link (`/workspace?draft=<id>`) into the composer's state. A new
link clears what the composer showed; a loaded draft fills the objective and
the result. A draft still `generating` has no result yet, so it surfaces as a
pending id the composer explains once (no polling).
*/
const useReopenedDraft = (
  draftRequestId: string | undefined,
  targets: ReopenedDraftTargets
) => {
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);
  const storedDraft = useStoredDraft(draftRequestId, {
    onReset: () => {
      targets.setResult(null);
      targets.setPriorDraft(null);
      targets.setFailure(null);
      setPendingDraftId(null);
    },
    onDraft: (stored) => {
      targets.forgetLastSubmission();
      targets.setPrompt(stored.prompt);
      if (stored.result.state === GENERATING_STATE) {
        setPendingDraftId(stored.result.requestId);
        return;
      }
      if (stored.result.state === READY_FOR_REVIEW_STATE) {
        targets.setPriorDraft(stored.result);
      }
      targets.setResult(stored.result);
    },
    onUnauthorized: targets.onUnauthorized,
    onUnavailable: (message) => {
      targets.setFailure({ kind: "error", message, code: null });
    },
  });
  return {
    isOpening: storedDraft.isOpening,
    reload: storedDraft.reload,
    pendingDraftId,
  };
};

/**
A reopened draft that was still generating. It is a terminal notice: nothing
refreshes on its own, and "Check again" reads the same link once more.
*/
const StoredDraftPending = ({
  requestId,
  onCheckAgain,
}: {
  readonly requestId: string;
  readonly onCheckAgain: () => void;
}) => {
  return (
    <Notice
      tone="info"
      title="This draft is still in progress"
      action={
        <Button type="button" variant="secondary" onClick={onCheckAgain}>
          Check again
        </Button>
      }
    >
      <p>
        Request {requestId} was still being generated when this link opened.
        Check again in a moment to see the finished draft.
      </p>
    </Notice>
  );
};

const TeacherLessonComposer = ({
  csrf,
  generation,
  draftRequestId,
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
  // #119 variant B: a ready draft survives a later moderation block, so the
  // teacher keeps the approved work while revising the blocked request.
  const [priorDraft, setPriorDraft] = useState<PublicGenerationResult | null>(
    null
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [failure, setFailure] = useState<GenerationFailure | null>(null);
  // The composer collapses to its summary once a draft has variants; Edit
  // objective (or any recovery that needs the field) opens it again.
  const [isEditing, setIsEditing] = useState(false);
  const requestError = failure?.kind === "error" ? failure.message : null;
  const hasModerationFailure =
    failure?.kind === "error" && failure.code === REVISION_REQUIRED_CODE;
  // #168 P0-2: on failure the inline status next to Create lesson receives
  // focus, so the cause lands in view and in the screen reader's mouth. The
  // moderation panel owns focus for its own path.
  const statusReference = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (requestError && !hasModerationFailure) {
      statusReference.current?.focus();
    }
  }, [hasModerationFailure, requestError]);
  // The reviewed source snapshot the next draft is grounded in (#114). Null
  // keeps the prompt-only path the focused event composer relies on.
  const [boundSource, setBoundSource] = useState<BoundSource | null>(null);
  // #119/#148: "Revise request" arms the link. The next submission carries it
  // with a fresh operation key, so the revised prompt is a new request that
  // names the blocked one. A ref keeps the composer from re-rendering on arm.
  const revisionTargetReference = useRef<string | null>(null);
  const context = getPromptContext(prompt);

  useEffect(() => {
    generationReference.current = generation;
  }, [generation]);

  const reopened = useReopenedDraft(draftRequestId, {
    setPrompt,
    setResult,
    setPriorDraft,
    setFailure,
    forgetLastSubmission: () => {
      // The next Create starts a fresh operation key and arms no revision.
      requestKeyReference.current = "";
      revisionTargetReference.current = null;
    },
    onUnauthorized,
  });
  const { isOpening: isOpeningDraft, pendingDraftId } = reopened;
  const handleCheckDraftAgain = reopened.reload;

  const isModerationBlocked =
    result !== null && result.state === BLOCKED_BY_MODERATION_STATE;
  const hasModerationPanel = isModerationBlocked || hasModerationFailure;
  const visibleResult = isModerationBlocked ? priorDraft : result;
  const isCollapsed =
    !isEditing &&
    visibleResult?.state === READY_FOR_REVIEW_STATE &&
    visibleResult.draft !== null;

  const openComposer = (): void => {
    // The field must exist before it can take focus, so the open commits now.
    flushSync(() => {
      setIsEditing(true);
    });
    focusLessonPrompt();
  };

  const updateRequestKey = () => {
    requestKeyReference.current = "";
    setResult(null);
    setFailure(null);
  };

  const submitGeneration = async (
    event: SyntheticEvent<HTMLFormElement> | undefined,
    retryOfRequestId?: string
  ): Promise<void> => {
    event?.preventDefault();
    // No submission may race the stored-draft read: it would overwrite the
    // composer the read is about to fill.
    if (submittingReference.current || isOpeningDraft) {
      return;
    }
    submittingReference.current = true;
    setIsGenerating(true);
    setFailure(null);

    const startedGeneration = generationReference.current;
    const revisesRequestId =
      retryOfRequestId === undefined
        ? (revisionTargetReference.current ?? undefined)
        : undefined;
    // The armed link belongs to this submission only.
    revisionTargetReference.current = null;

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
      ...(revisesRequestId && { revisesRequestId }),
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
        if (attempt.result.state === READY_FOR_REVIEW_STATE) {
          setPriorDraft(attempt.result);
          setIsEditing(false);
        }
        setResult(attempt.result);
        break;
      }
      case "unauthorized": {
        setResult(null);
        onUnauthorized();
        break;
      }
      default: {
        // A failed "Draft again" keeps the ready board on screen; the failure
        // renders under the objective summary that started it.
        setResult((current) =>
          current?.state === READY_FOR_REVIEW_STATE ? current : null
        );
        setFailure(attempt);
      }
    }
  };

  const draftAgain = (): void => {
    // A fresh operation key makes this a new request, not a replay of the
    // one already shown.
    requestKeyReference.current = "";
    void submitGeneration(undefined);
  };

  const isBusy = isGenerating || isOpeningDraft;
  const composerStatus = (
    <ComposerStatus
      statusRef={statusReference}
      isOpeningDraft={isOpeningDraft}
      isGenerating={isGenerating}
      requestError={hasModerationFailure ? null : requestError}
    />
  );

  return (
    <section className="teacher-studio" aria-labelledby="generation-heading">
      <StudioHeader standardId={standardId} />

      {isCollapsed ? (
        <ObjectiveSummary
          prompt={prompt}
          context={context}
          standardId={standardId}
          isBusy={isBusy}
          status={composerStatus}
          onEdit={openComposer}
          onDraftAgain={draftAgain}
        />
      ) : (
        <OpenComposer
          csrf={csrf}
          prompt={prompt}
          context={context}
          standardId={standardId}
          boundSource={boundSource}
          isBusy={isBusy}
          status={composerStatus}
          onPromptChange={(value) => {
            setPrompt(value);
            updateRequestKey();
          }}
          onSubmit={submitGeneration}
          onBoundSourceChange={setBoundSource}
          onUnauthorized={onUnauthorized}
        />
      )}

      {pendingDraftId ? (
        <StoredDraftPending
          requestId={pendingDraftId}
          onCheckAgain={handleCheckDraftAgain}
        />
      ) : null}

      <TeacherComposerOutcome
        prompt={prompt}
        visibleResult={visibleResult}
        blockedResult={isModerationBlocked ? result : null}
        hasModerationPanel={hasModerationPanel}
        hasEarlierDraft={priorDraft !== null}
        onOpenReview={onOpenReview}
        onRetry={(event, requestId) => {
          void submitGeneration(event, requestId);
        }}
        onRecover={(action, requestId) => {
          if (recoveryEffect(action) === "focus-objective") {
            openComposer();
            return;
          }
          void submitGeneration(undefined, requestId);
        }}
        onRevise={(requestId) => {
          if (requestId) {
            revisionTargetReference.current = requestId;
          }
          openComposer();
        }}
      />
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
  draftRequestId,
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
      draftRequestId={draftRequestId}
      onOpenReview={onOpenReview}
      onUnauthorized={onUnauthorized}
      standardId={DEFAULT_STANDARD_ID}
    />
  );
};
