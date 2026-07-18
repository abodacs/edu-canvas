import {
  ArrowLeft,
  Database,
  LockKeyhole,
  Network,
  ShieldCheck,
} from 'lucide-react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'

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

  return (
    <main className="app-shell" aria-labelledby="demo-title">
      <div className="page-frame">
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
              You are viewing the isolated <strong>{session.tenantName}</strong>{' '}
              tenant. This foundation exposes only the capabilities intended for
              this seeded role.
            </p>
          </div>
          <div className="session-stamp" aria-label="Current demo session">
            <span>Environment</span>
            <strong>{environment.appEnv}</strong>
            <span>Persistence</span>
            <strong>{environment.persistence}</strong>
          </div>
        </section>

        {session.role === 'teacher' ? (
          <TeacherLessonComposer standardId={curriculum.id} />
        ) : null}

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
                <LockKeyhole aria-hidden="true" /> The private answer key is not
                part of this response or the client bundle.
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

        <section className="fixture-section" aria-labelledby="fixture-heading">
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
            <Network aria-hidden="true" /> This seeded view stays tenant-scoped;
            generated content remains a reviewable draft until a teacher acts.
          </p>
        </section>
      </div>
    </main>
  )
}

interface LessonComposerProps {
  standardId: string
}

function TeacherLessonComposer({ standardId }: LessonComposerProps) {
  const [prompt, setPrompt] = useState('equivalent fractions for grade 4')
  const [grade, setGrade] = useState('4')
  const [language, setLanguage] = useState<'en' | 'ar'>('en')
  const [difficulty, setDifficulty] = useState<
    'support' | 'on-level' | 'stretch'
  >('on-level')
  const [requestKey, setRequestKey] = useState('')
  const [result, setResult] = useState<PublicGenerationResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

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
            grade,
            standardId,
            language,
            difficulty,
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
      className="generation-section"
      aria-labelledby="generation-heading"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Teacher authoring · issue #3</p>
          <h2 id="generation-heading">
            Turn a request into a reviewable draft.
          </h2>
          <p className="section-description">
            The server validates every variant before anything can move toward
            students. AI never publishes this draft.
          </p>
        </div>
        <Badge variant="secondary">Server validated</Badge>
      </div>

      <form
        className="generation-form"
        onSubmit={(event) => void submitGeneration(event)}
      >
        <div className="generation-form__prompt">
          <label htmlFor="lesson-prompt">What should students practise?</label>
          <textarea
            id="lesson-prompt"
            name="prompt"
            required
            maxLength={500}
            rows={3}
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value)
              updateRequestKey()
            }}
          />
          <span className="field-hint">Up to 500 characters.</span>
        </div>

        <div className="generation-form__fields">
          <div className="field-group">
            <label htmlFor="lesson-grade">Grade</label>
            <select
              id="lesson-grade"
              name="grade"
              required
              value={grade}
              onChange={(event) => {
                setGrade(event.target.value)
                updateRequestKey()
              }}
            >
              <option value="3">Grade 3</option>
              <option value="4">Grade 4</option>
              <option value="5">Grade 5</option>
              <option value="6">Grade 6</option>
            </select>
          </div>

          <div className="field-group">
            <label htmlFor="lesson-standard">Primary standard</label>
            <select
              id="lesson-standard"
              name="standardId"
              defaultValue={standardId}
            >
              <option value={standardId}>
                4.NF.A.1 · Explain equivalent fractions
              </option>
            </select>
          </div>

          <div className="field-group">
            <label htmlFor="lesson-language">Lesson language</label>
            <select
              id="lesson-language"
              name="language"
              required
              value={language}
              onChange={(event) => {
                setLanguage(event.target.value as 'en' | 'ar')
                updateRequestKey()
              }}
            >
              <option value="en">English · LTR</option>
              <option value="ar">العربية · RTL</option>
            </select>
          </div>

          <div className="field-group">
            <label htmlFor="lesson-difficulty">Difficulty</label>
            <select
              id="lesson-difficulty"
              name="difficulty"
              value={difficulty}
              onChange={(event) => {
                setDifficulty(
                  event.target.value as 'support' | 'on-level' | 'stretch',
                )
                updateRequestKey()
              }}
            >
              <option value="support">Support</option>
              <option value="on-level">On level</option>
              <option value="stretch">Stretch</option>
            </select>
          </div>
        </div>

        <div className="generation-form__actions">
          <Button
            type="submit"
            size="lg"
            className="min-h-12"
            disabled={isGenerating}
          >
            {isGenerating ? 'Building draft…' : 'Generate four variants'}
          </Button>
          <span className="field-hint">
            One standard, one scaffold, and one challenge path are included.
          </span>
        </div>
      </form>

      <div className="generation-status" aria-live="polite" role="status">
        {isGenerating ? (
          <p>Request received. Validating the lesson draft…</p>
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
      ) : null}
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

  return (
    <div
      className="generation-result"
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
      <div className="generation-result__header">
        <div>
          <p className="eyebrow">Generation state</p>
          <h3>
            {result.state === 'ready-for-review'
              ? 'Four variants are ready for teacher review.'
              : result.state === 'generating'
                ? 'Generation is still in progress.'
                : result.state.replaceAll('-', ' ')}
          </h3>
        </div>
        <Badge
          variant={
            result.state === 'ready-for-review'
              ? 'default'
              : result.state === 'generating'
                ? 'secondary'
                : 'destructive'
          }
        >
          Attempt {result.attempt}
        </Badge>
      </div>

      {result.diagnostics.length > 0 ? (
        <ul className="diagnostic-list" aria-label="Draft diagnostics">
          {result.diagnostics.map((item, index) => (
            <li key={`${item.code}-${item.variantId ?? 'draft'}-${index}`}>
              <strong>
                {item.severity === 'error' ? 'Needs attention' : 'Note'}
              </strong>
              <span>{item.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {result.draft ? (
        <div className="variant-list" aria-label="Generated lesson variants">
          {result.draft.variants.map((variant) => (
            <article className="variant-preview" key={variant.id}>
              <div className="variant-preview__heading">
                <div>
                  <p className="eyebrow">{variant.kind}</p>
                  <h4>{variant.title}</h4>
                </div>
                <span>{variant.sourceItems.length} sources</span>
              </div>
              <p>{variant.instructions}</p>
              <div className="variant-preview__items">
                <div>
                  <strong>
                    {variant.accessibilityMetadata.sourceGroupLabel}
                  </strong>
                  <ul>
                    {variant.sourceItems.map((item) => (
                      <li key={item.id}>{item.label}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>
                    {variant.accessibilityMetadata.targetGroupLabel}
                  </strong>
                  <ul>
                    {variant.targetItems.map((item) => (
                      <li key={item.id}>{item.label}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {result.retry.available ? (
        <form onSubmit={onRetry}>
          <Button type="submit" variant="outline">
            Try this draft again
          </Button>
        </form>
      ) : null}
    </div>
  )
}
