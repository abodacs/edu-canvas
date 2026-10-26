import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Database,
  Globe2,
  Layers3,
  LockKeyhole,
  Network,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utilities";
import { LessonPreview } from "@/components/a2ui/lesson-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isDemoRole } from "@/shared/demo-contract";
import {
  generateLessonDraft,
  getDemoSnapshot,
} from "@/server/demo/server-function";
import type { PublicGenerationResult } from "@/shared/generation-contract";
import type { SyntheticEvent } from "react";

const DemoPerspective = () => {
  const { session, environment, curriculum, seededCounts } =
    Route.useLoaderData();
  const isTeacher = session.role === "teacher";

  return (
    <main
      className={isTeacher ? "app-shell app-shell--teacher" : "app-shell"}
      aria-labelledby={isTeacher ? "generation-heading" : "demo-title"}
    >
      <div
        className={isTeacher ? "page-frame page-frame--teacher" : "page-frame"}
      >
        {isTeacher ? (
          <>
            <TeacherStudioHeader />
            <TeacherLessonComposer standardId={curriculum.id} />
          </>
        ) : (
          <>
            <header className="site-header">
              <Link className="text-link" to="/">
                <ArrowLeft aria-hidden="true" /> Back to foundation
              </Link>
              <Badge variant="secondary">Synthetic demo</Badge>
            </header>

            <section className="demo-intro">
              <div>
                <p className="eyebrow">{session.role} perspective</p>
                <h1 id="demo-title">Welcome, {session.displayName}.</h1>
                <p className="hero-description">
                  You are viewing the isolated{" "}
                  <strong>{session.tenantName}</strong> tenant. This foundation
                  exposes only the capabilities intended for this seeded role.
                </p>
              </div>
              <div className="session-stamp">
                <span>Environment</span>
                <strong>{environment.appEnv}</strong>
                <span>Persistence</span>
                <strong>{environment.persistence}</strong>
              </div>
            </section>

            <section className="page-grid page-grid--details">
              <Card>
                <CardHeader>
                  <CardTitle>What this identity can see</CardTitle>
                  <CardDescription>
                    Capabilities are resolved on the server.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="capability-list">
                    {session.capabilities.map((capability) => {
                      return (
                        <li key={capability}>
                          <ShieldCheck aria-hidden="true" />
                          {capability.replaceAll("_", " ")}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="security-note">
                    <LockKeyhole aria-hidden="true" /> The private answer key is
                    not part of this response or the client bundle.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Seeded classroom</CardTitle>
                  <CardDescription>{curriculum.name}</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="data-list">
                    <div>
                      <dt>Standard</dt>
                      <dd>{curriculum.id}</dd>
                    </div>
                    <div>
                      <dt>Graph version</dt>
                      <dd>{curriculum.graphVersion}</dd>
                    </div>
                    <div>
                      <dt>Tenant</dt>
                      <dd>{session.tenantId}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </section>

            <section
              className="fixture-section"
              aria-labelledby="fixture-heading"
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Persistence proof</p>
                  <h2 id="fixture-heading">
                    The next slices have somewhere stable to land.
                  </h2>
                </div>
                <Database aria-hidden="true" />
              </div>
              <div className="fixture-grid">
                {Object.entries(seededCounts).map(([label, count]) => {
                  return (
                    <div className="fixture-stat" key={label}>
                      <strong>{String(count)}</strong>
                      <span>
                        {label.replaceAll(
                          /[A-Z]/gu,
                          (letter) => ` ${letter.toLowerCase()}`
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="supporting-note">
                <Network aria-hidden="true" /> This seeded view stays
                tenant-scoped; generated content remains a reviewable draft
                until a teacher acts.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
};

const TeacherStudioHeader = () => {
  return (
    <header className="studio-nav">
      <Link
        className="studio-brand"
        to="/"
        aria-label="Back to Edu-Canvas home"
      >
        <span className="studio-brand__mark" aria-hidden="true">
          EC
        </span>
        <span className="studio-brand__name">Edu-Canvas</span>
      </Link>
      <div className="studio-nav__actions">
        <span className="studio-nav__state">
          <span className="studio-nav__dot" aria-hidden="true" />
          Teacher studio
        </span>
        <Link className="studio-nav__exit" to="/">
          Exit <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
};

interface LessonComposerProperties {
  readonly standardId: string;
}

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

const READY_FOR_REVIEW_STATE = "ready-for-review";

const getDisplayStandardId = (standardId: string) =>
  standardId === "standard_ccss_4_nf_a_01" ? "4.NF.A.1" : standardId;

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

const isTeacherReviewDiagnostic = (code: string): boolean =>
  TEACHER_REVIEW_DIAGNOSTIC_CODES.has(code);

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
        {getDisplayStandardId(standardId)}
      </span>
      <span className="prompt-signal">
        <Globe2 aria-hidden="true" />
        {context.language === "ar" ? "Arabic / RTL" : "English / LTR"}
      </span>
    </div>
  );
};

const TeacherLessonComposer = ({ standardId }: LessonComposerProperties) => {
  const [prompt, setPrompt] = useState("equivalent fractions for grade 4");
  const requestKeyReference = useRef("");
  const [result, setResult] = useState<PublicGenerationResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const studioReference = useRef<HTMLElement>(null);
  const context = getPromptContext(prompt);

  useEffect(() => {
    const root = studioReference.current;
    if (!root || typeof window === "undefined") {
      return () => {
        // Nothing was animated, so there is nothing to clean up.
      };
    }

    gsap.registerPlugin(ScrollTrigger);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return () => {
        // Nothing was animated, so there is nothing to clean up.
      };
    }

    const animationContext = gsap.context(() => {
      gsap.from(".insight-card", {
        opacity: 0,
        transform: "translate3d(0, 18px, 0)",
        duration: 0.62,
        ease: "expo.out",
        stagger: 0.06,
        scrollTrigger: {
          trigger: ".insight-grid",
          start: "top 80%",
          once: true,
        },
      });

      const guidance = root.querySelector<HTMLElement>(".teacher-guidance");
      const rail = root.querySelector<HTMLElement>(".teacher-guidance__rail");

      if (guidance && rail && window.matchMedia("(min-width: 60rem)").matches) {
        ScrollTrigger.create({
          trigger: guidance,
          start: "top top+=96",
          end: "bottom bottom-=64",
          pin: rail,
          pinSpacing: false,
        });
      }
    }, root);

    return () => animationContext.revert();
  }, []);

  const updateRequestKey = () => {
    requestKeyReference.current = "";
    setResult(null);
    setRequestError(null);
  };

  const submitGeneration = async (
    event: SyntheticEvent<HTMLFormElement>,
    retryOfRequestId?: string
  ) => {
    event.preventDefault();
    setIsGenerating(true);
    setRequestError(null);

    const idempotencyKey = retryOfRequestId
      ? crypto.randomUUID()
      : requestKeyReference.current || crypto.randomUUID();
    if (!retryOfRequestId) {
      requestKeyReference.current = idempotencyKey;
    }

    const retryField = retryOfRequestId ? { retryOfRequestId } : {};

    try {
      const nextResult = await generateLessonDraft({
        data: {
          role: "teacher",
          input: {
            prompt,
            grade: context.grade,
            standardId,
            language: context.language,
            difficulty: context.difficulty,
            idempotencyKey,
            ...retryField,
          },
        },
      });
      setResult(nextResult);
    } catch {
      setRequestError(
        "The draft could not be generated. Check the request and try again."
      );
    }
    setIsGenerating(false);
  };

  return (
    <section
      ref={studioReference}
      className="teacher-studio"
      aria-labelledby="generation-heading"
    >
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
          <label htmlFor="lesson-prompt">What should students practice?</label>
          <span>{prompt.length}/500</span>
        </div>
        <textarea
          id="lesson-prompt"
          name="prompt"
          aria-label="What should students practice?"
          required
          maxLength={500}
          rows={3}
          value={prompt}
          placeholder="e.g. equivalent fractions for grade 4"
          onChange={(event) => {
            setPrompt(event.target.value);
            updateRequestKey();
          }}
        />
        <div className="prompt-composer__bottom">
          <PromptSignals context={context} standardId={standardId} />
          <Button
            type="submit"
            size="lg"
            className="prompt-composer__submit"
            disabled={isGenerating || !prompt.trim()}
          >
            <WandSparkles aria-hidden="true" />
            {isGenerating ? "Shaping the draft…" : "Create lesson"}
            {isGenerating ? null : <ArrowRight aria-hidden="true" />}
          </Button>
        </div>
      </form>

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

      <output
        className="generation-status teacher-generation-status"
        aria-live="polite"
      >
        {isGenerating ? (
          <p className="status-pulse">
            <span aria-hidden="true" /> Reading the idea, finding the cleanest
            path…
          </p>
        ) : null}
        {requestError ? (
          <p className="generation-error">{requestError}</p>
        ) : null}
      </output>

      {result ? (
        <GenerationResult
          result={result}
          onRetry={(event) => {
            submitGeneration(event, result.requestId);
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
            <strong>{getDisplayStandardId(standardId)}</strong>
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
                </span>
                <span className="guidance-panel__title">{panel.title}</span>
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
            {Array.from({ length: 2 }, () => {
              return [
                "clear target",
                "visible support",
                "teacher approval",
                "a reason to continue",
              ];
            })
              .flat()
              .map((item, index) => {
                return (
                  <span key={`${item}-${index}`}>
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

interface GenerationResultProperties {
  readonly result: PublicGenerationResult;
  readonly onRetry: (event: SyntheticEvent<HTMLFormElement>) => void;
}

const GenerationResult = ({ result, onRetry }: GenerationResultProperties) => {
  const direction =
    result.draft?.variants[0]?.languageMetadata.direction ?? "ltr";
  const requiresTeacherReview = result.diagnostics.some((diagnostic) =>
    isTeacherReviewDiagnostic(diagnostic.code)
  );
  const stackReference = useRef<HTMLElement>(null);

  useEffect(() => {
    const stack = stackReference.current;
    if (
      !stack ||
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return () => {
        // Nothing was animated, so there is nothing to clean up.
      };
    }

    const animationContext = gsap.context(() => {
      gsap.from(".variant-card", {
        opacity: 0,
        transform: "translate3d(0, 24px, 0) scale(0.97)",
        duration: 0.48,
        ease: "expo.out",
        stagger: 0.07,
      });
    }, stack);

    return () => animationContext.revert();
  }, [result.requestId]);

  return (
    <div
      className="generation-result teacher-result"
      dir={direction}
      lang={result.draft?.language ?? "en"}
    >
      <output className="sr-only">{getStatusAnnouncement(result.state)}</output>
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

      {result.diagnostics.length > 0 ? (
        <ul
          className="diagnostic-list teacher-diagnostics"
          aria-label="Draft notes"
        >
          {result.diagnostics.map((item) => {
            return (
              <li
                key={`${item.code}-${item.variantId ?? "draft"}-${item.message}`}
              >
                <strong>{getDiagnosticLabel(item)}</strong>
                <span>{item.message}</span>
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
              <strong>{getDisplayStandardId(result.draft.standardId)}</strong>
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

            <section
              className="variant-stack"
              ref={stackReference}
              aria-label="Generated lesson variants"
            >
              {result.draft.variants.map((variant) => {
                return (
                  <article className="variant-card" key={variant.id}>
                    <div className="variant-card__heading">
                      <span
                        className={`variant-kind variant-kind--${variant.kind}`}
                      >
                        {variantLabels[variant.kind]}
                      </span>
                      <span>{variant.sourceItems.length} matching pieces</span>
                    </div>
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
                        <strong>
                          {variant.targetItems.length} connections
                        </strong>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          </div>

          {result.state === READY_FOR_REVIEW_STATE ? (
            <LessonPreview
              key={result.requestId}
              requestId={result.requestId}
            />
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

export const Route = createFileRoute("/demo/$role")({
  loader: ({ params }) => {
    if (!isDemoRole(params.role)) {
      throw new Error("Unknown seeded demo role.");
    }

    return getDemoSnapshot({ data: { role: params.role } });
  },
  component: DemoPerspective,
});
