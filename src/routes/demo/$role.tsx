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
} from 'lucide-react'
import { createFileRoute, Link } from '@tanstack/react-router'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { LessonPreview } from '@/components/a2ui/lesson-preview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { isDemoRole } from '@/shared/demo-contract'
import type { PublicGenerationResult } from '@/shared/generation-contract'
import {
  generateLessonDraft,
  getDemoSnapshot,
} from '@/server/demo/server-function'

export const Route = createFileRoute('/demo/$role')({
  loader: ({ params }) => {
    if (!isDemoRole(params.role)) {
      throw new Error('Unknown seeded demo role.')
    }

    return getDemoSnapshot({ data: { role: params.role } })
  },
  component: DemoPerspective,
})

function DemoPerspective() {
  const snapshot = Route.useLoaderData()
  const { session, environment, curriculum, seededCounts } = snapshot
  const isTeacher = session.role === 'teacher'

  return (
    <main
      className={isTeacher ? 'app-shell app-shell--teacher' : 'app-shell'}
      aria-labelledby={isTeacher ? 'generation-heading' : 'demo-title'}
    >
      <div
        className={isTeacher ? 'page-frame page-frame--teacher' : 'page-frame'}
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
                  You are viewing the isolated{' '}
                  <strong>{session.tenantName}</strong> tenant. This foundation
                  exposes only the capabilities intended for this seeded role.
                </p>
              </div>
              <div className="session-stamp" aria-label="Current demo session">
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
                    {session.capabilities.map((capability) => (
                      <li key={capability}>
                        <ShieldCheck aria-hidden="true" />
                        {capability.replaceAll('_', ' ')}
                      </li>
                    ))}
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
                {Object.entries(seededCounts).map(([label, count]) => (
                  <div className="fixture-stat" key={label}>
                    <strong>{String(count)}</strong>
                    <span>
                      {label.replace(
                        /[A-Z]/g,
                        (letter) => ` ${letter.toLowerCase()}`,
                      )}
                    </span>
                  </div>
                ))}
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
  )
}

function TeacherStudioHeader() {
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
  )
}

interface LessonComposerProps {
  standardId: string
}

type PromptContext = {
  grade: '3' | '4' | '5' | '6'
  language: 'en' | 'ar'
  difficulty: 'support' | 'on-level' | 'stretch'
}

const variantLabels = {
  standard: 'Core idea',
  scaffold: 'Extra support',
  challenge: 'Stretch it',
} as const

const guidancePanels = [
  {
    key: 'target',
    title: 'Target',
    short: 'Keep the goal precise',
    detail: 'We will start with the clearest learning target we can find.',
    Icon: BookOpen,
  },
  {
    key: 'support',
    title: 'Support',
    short: 'Make room for every learner',
    detail: 'The draft includes a gentler path and a way to stretch the idea.',
    Icon: Layers3,
  },
  {
    key: 'review',
    title: 'Review',
    short: 'You decide what goes live',
    detail: 'Every version stays private until you approve it for students.',
    Icon: ShieldCheck,
  },
] as const

function getPromptContext(prompt: string): PromptContext {
  const gradeMatch = prompt.match(/\b(?:grade|year|class)\s*([3-6])\b/i)
  const lowerPrompt = prompt.toLowerCase()

  return {
    grade: (gradeMatch?.[1] ?? '4') as PromptContext['grade'],
    language: /[\u0600-\u06ff]/.test(prompt) ? 'ar' : 'en',
    difficulty: lowerPrompt.includes('challenge')
      ? 'stretch'
      : lowerPrompt.includes('support') || lowerPrompt.includes('scaffold')
        ? 'support'
        : 'on-level',
  }
}

function getDisplayStandardId(standardId: string) {
  return standardId === 'standard_ccss_4_nf_a_01' ? '4.NF.A.1' : standardId
}

function getResultTitle(state: PublicGenerationResult['state']) {
  switch (state) {
    case 'ready-for-review':
      return 'Choose the version that fits the room.'
    case 'generating':
      return 'Your idea is taking shape.'
    case 'blocked-by-validation':
      return 'This draft needs a little more care.'
    case 'blocked-by-moderation':
      return 'Let’s reshape that request.'
    case 'failed-retryable':
      return 'The first pass missed a beat.'
    case 'failed-terminal':
      return 'That draft could not be finished.'
    default:
      return 'Your lesson is taking shape.'
  }
}

function isTeacherReviewDiagnostic(code: string): boolean {
  return (
    code === 'PREREQUISITE_PACK_MISSING' ||
    code === 'PREREQUISITE_PATH_MISSING' ||
    code === 'LEARNING_PATH_BLOCKED' ||
    code === 'CURRICULUM_TENANT_MISMATCH' ||
    code === 'CURRICULUM_CONTEXT_MISMATCH' ||
    code === 'CURRICULUM_GRAPH_VERSION_UNSUPPORTED'
  )
}

function PromptSignals({
  context,
  standardId,
}: {
  context: PromptContext
  standardId: string
}) {
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
        {context.language === 'ar' ? 'Arabic / RTL' : 'English / LTR'}
      </span>
    </div>
  )
}

function TeacherLessonComposer({ standardId }: LessonComposerProps) {
  const [prompt, setPrompt] = useState('equivalent fractions for grade 4')
  const [requestKey, setRequestKey] = useState('')
  const [result, setResult] = useState<PublicGenerationResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const studioRef = useRef<HTMLElement>(null)
  const context = getPromptContext(prompt)

  useEffect(() => {
    const root = studioRef.current
    if (!root || typeof window === 'undefined') return

    gsap.registerPlugin(ScrollTrigger)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const animationContext = gsap.context(() => {
      gsap.from('.insight-card', {
        opacity: 0,
        transform: 'translate3d(0, 18px, 0)',
        duration: 0.62,
        ease: 'expo.out',
        stagger: 0.06,
        scrollTrigger: {
          trigger: '.insight-grid',
          start: 'top 80%',
          once: true,
        },
      })

      const guidance = root.querySelector<HTMLElement>('.teacher-guidance')
      const rail = root.querySelector<HTMLElement>('.teacher-guidance__rail')

      if (guidance && rail && window.matchMedia('(min-width: 60rem)').matches) {
        ScrollTrigger.create({
          trigger: guidance,
          start: 'top top+=96',
          end: 'bottom bottom-=64',
          pin: rail,
          pinSpacing: false,
        })
      }
    }, root)

    return () => animationContext.revert()
  }, [])

  function updateRequestKey() {
    setRequestKey('')
    setResult(null)
    setRequestError(null)
  }

  async function submitGeneration(
    event: FormEvent<HTMLFormElement>,
    retryOfRequestId?: string,
  ) {
    event.preventDefault()
    setIsGenerating(true)
    setRequestError(null)

    const idempotencyKey = retryOfRequestId
      ? crypto.randomUUID()
      : requestKey || crypto.randomUUID()
    if (!retryOfRequestId) setRequestKey(idempotencyKey)

    try {
      const nextResult = await generateLessonDraft({
        data: {
          role: 'teacher',
          input: {
            prompt,
            grade: context.grade,
            standardId,
            language: context.language,
            difficulty: context.difficulty,
            idempotencyKey,
            ...(retryOfRequestId ? { retryOfRequestId } : {}),
          },
        },
      })
      setResult(nextResult)
    } catch {
      setRequestError(
        'The draft could not be generated. Check the request and try again.',
      )
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <section
      ref={studioRef}
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
            Make the idea{' '}
            <span className="inline-fraction-art" aria-hidden="true">
              <span>1</span>
              <i />
              <span>2</span>
            </span>{' '}
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

      <form
        className="prompt-composer"
        onSubmit={(event) => void submitGeneration(event)}
      >
        <div className="prompt-composer__heading">
          <label htmlFor="lesson-prompt">What should students practice?</label>
          <span>{prompt.length}/500</span>
        </div>
        <textarea
          id="lesson-prompt"
          name="prompt"
          required
          maxLength={500}
          rows={3}
          value={prompt}
          placeholder="e.g. equivalent fractions for grade 4"
          onChange={(event) => {
            setPrompt(event.target.value)
            updateRequestKey()
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
            {isGenerating ? 'Shaping the draft…' : 'Create lesson'}
            {!isGenerating ? <ArrowRight aria-hidden="true" /> : null}
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

      <div
        className="generation-status teacher-generation-status"
        aria-live="polite"
        role="status"
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
      </div>

      {result ? (
        <GenerationResult
          result={result}
          onRetry={(event) => void submitGeneration(event, result.requestId)}
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
  )
}

function TeacherGuidance({
  context,
  prompt,
  standardId,
}: {
  context: PromptContext
  prompt: string
  standardId: string
}) {
  const [activePanel, setActivePanel] = useState('target')
  const safePrompt = prompt.trim() || 'your learning idea'

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
              {context.language === 'ar' ? 'Arabic / RTL' : 'English / LTR'}
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
            <div
              className="insight-card__levels"
              aria-label="Three lesson paths"
            >
              <span>Core</span>
              <span>Support</span>
              <span>Stretch</span>
            </div>
          </article>
        </div>

        <div
          className="guidance-accordion"
          aria-label="How the draft takes shape"
        >
          {guidancePanels.map((panel) => {
            const Icon = panel.Icon
            const isActive = activePanel === panel.key

            return (
              <button
                className={`guidance-panel${isActive ? ' is-active' : ''}`}
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
            )
          })}
        </div>

        <div className="teacher-marquee" aria-label="Lesson design principles">
          <div className="teacher-marquee__track">
            {[...Array(2)]
              .flatMap(() => [
                'clear target',
                'visible support',
                'teacher approval',
                'a reason to continue',
              ])
              .map((item, index) => (
                <span key={`${item}-${index}`}>
                  {item}
                  <i aria-hidden="true" />
                </span>
              ))}
          </div>
        </div>
      </div>
    </section>
  )
}

interface GenerationResultProps {
  result: PublicGenerationResult
  onRetry: (event: FormEvent<HTMLFormElement>) => void
}

function GenerationResult({ result, onRetry }: GenerationResultProps) {
  const direction =
    result.draft?.variants[0]?.languageMetadata.direction ?? 'ltr'
  const requiresTeacherReview = result.diagnostics.some((diagnostic) =>
    isTeacherReviewDiagnostic(diagnostic.code),
  )
  const stackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stack = stackRef.current
    if (!stack || typeof window === 'undefined') return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const animationContext = gsap.context(() => {
      gsap.from('.variant-card', {
        opacity: 0,
        transform: 'translate3d(0, 24px, 0) scale(0.97)',
        duration: 0.48,
        ease: 'expo.out',
        stagger: 0.07,
      })
    }, stack)

    return () => animationContext.revert()
  }, [result.requestId])

  return (
    <div
      className="generation-result teacher-result"
      dir={direction}
      lang={result.draft?.language ?? 'en'}
    >
      <p className="sr-only" role="status">
        {result.state === 'ready-for-review'
          ? 'Four lesson variants are ready for teacher review.'
          : result.state === 'generating'
            ? 'A duplicate request is still being completed.'
            : `Generation state: ${result.state.replaceAll('-', ' ')}`}
      </p>
      <div className="generation-result__header teacher-result__header">
        <div>
          <p className="studio-kicker">Your first pass</p>
          <h2>{getResultTitle(result.state)}</h2>
          <p className="teacher-result__description">
            {requiresTeacherReview
              ? 'The approved prerequisite context is unavailable, so nothing has been prepared for students.'
              : result.state === 'ready-for-review'
                ? 'Look for the version that sounds like your classroom. You can review every one before anything moves forward.'
                : 'The draft remains private while we finish the safe, reviewable handoff.'}
          </p>
        </div>
        <span className={`result-state result-state--${result.state}`}>
          <span aria-hidden="true" />
          {result.state === 'ready-for-review'
            ? 'Ready to review'
            : result.state === 'generating'
              ? 'In progress'
              : 'Needs a look'}
        </span>
      </div>

      {result.diagnostics.length > 0 ? (
        <ul
          className="diagnostic-list teacher-diagnostics"
          aria-label="Draft notes"
        >
          {result.diagnostics.map((item, index) => (
            <li key={`${item.code}-${item.variantId ?? 'draft'}-${index}`}>
              <strong>
                {isTeacherReviewDiagnostic(item.code)
                  ? 'Teacher review'
                  : item.severity === 'error'
                    ? 'Review this'
                    : 'Worth noticing'}
              </strong>
              <span>{item.message}</span>
            </li>
          ))}
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

            <div
              className="variant-stack"
              ref={stackRef}
              aria-label="Generated lesson variants"
            >
              {result.draft.variants.map((variant) => (
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
                      <strong>{variant.targetItems.length} connections</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {result.state === 'ready-for-review' ? (
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
  )
}
