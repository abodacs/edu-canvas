import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import {
  A2UI_CATALOG_VERSION,
  A2UI_PROTOCOL_VERSION,
} from '@/shared/a2ui-contract'
import { applyA2UIMessage, createA2UIRenderState } from './renderer'
import type { A2UIRenderState, A2UIRenderSurface } from './renderer'
import {
  consumeA2UIPreviewStream,
  PreviewStreamMessageError,
} from './preview-stream'

const PREVIEW_STREAM_TIMEOUT_MS = 8_000

type PreviewStatus =
  'loading' | 'ready' | 'disconnected' | 'timed-out' | 'blocked'

interface LessonPreviewProps {
  requestId: string
}

interface SelectionState {
  source?: string
  target?: string
}

interface SurfaceEntry {
  surfaceId: string
  variantId: string
  purpose: string
  scaffold: string
  direction: 'ltr' | 'rtl'
  language: 'en' | 'ar'
}

export function LessonPreview({ requestId }: LessonPreviewProps) {
  const [renderState, setRenderState] = useState<A2UIRenderState>(() =>
    createA2UIRenderState(),
  )
  const renderStateRef = useRef(renderState)
  const [status, setStatus] = useState<PreviewStatus>('loading')
  const [statusMessage, setStatusMessage] = useState(
    'Opening the safe lesson preview…',
  )
  const [retryToken, setRetryToken] = useState(0)
  const [activeSurfaceId, setActiveSurfaceId] = useState<string | null>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [selections, setSelections] = useState<Record<string, SelectionState>>(
    {},
  )

  useEffect(() => {
    const controller = new AbortController()

    setStatus('loading')
    setStatusMessage('Opening the safe lesson preview…')

    const timeoutId = setTimeout(() => {
      if (!controller.signal.aborted) {
        setStatus('timed-out')
        setStatusMessage(
          'The preview took too long to arrive. Your draft is still safe; try opening the preview again.',
        )
        controller.abort()
      }
    }, PREVIEW_STREAM_TIMEOUT_MS)

    const url = new URL('/api/a2ui/preview', window.location.origin)
    url.searchParams.set('role', 'teacher')
    url.searchParams.set('requestId', requestId)
    url.searchParams.set('catalogVersion', A2UI_CATALOG_VERSION)

    void (async () => {
      try {
        const response = await fetch(url, {
          headers: {
            Accept: 'text/event-stream',
            'x-edu-canvas-a2ui-version': A2UI_PROTOCOL_VERSION,
          },
          signal: controller.signal,
        })
        const outcome = await consumeA2UIPreviewStream(response, (message) => {
          const applied = applyA2UIMessage(renderStateRef.current, message)
          if (!applied.ok) {
            throw new PreviewStreamMessageError(applied.code, applied.message)
          }

          renderStateRef.current = applied.state
          setRenderState(applied.state)
        })

        if (controller.signal.aborted) return

        if (outcome.status === 'complete') {
          const surfaceCount = Object.keys(
            renderStateRef.current.surfaces,
          ).length
          if (outcome.surfaceCount !== 4 || surfaceCount !== 4) {
            setStatus('blocked')
            setStatusMessage(
              'The preview was incomplete, so it was stopped safely. Try opening it again.',
            )
            return
          }

          setStatus('ready')
          setStatusMessage('Four lesson variants are ready to explore.')
          return
        }

        if (
          outcome.code === 'UNKNOWN_COMPONENT' ||
          outcome.code === 'UNKNOWN_ACTION' ||
          outcome.code === 'UNSAFE_PAYLOAD' ||
          outcome.code === 'UNSUPPORTED_PROPERTY'
        ) {
          setStatus('blocked')
          setStatusMessage(outcome.message)
          return
        }

        setStatus('disconnected')
        setStatusMessage(outcome.message)
      } catch {
        if (controller.signal.aborted) return
        setStatus('disconnected')
        setStatusMessage(
          'The preview connection was interrupted. Check your connection and try again.',
        )
      } finally {
        clearTimeout(timeoutId)
      }
    })()

    return () => {
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [requestId, retryToken])

  const surfaces = useMemo<SurfaceEntry[]>(() => {
    return Object.entries(renderState.surfaces).flatMap(
      ([surfaceId, surface]) => {
        if (!surface) return []
        const model = surface.dataModel
        if (!model) return []

        return [
          {
            surfaceId,
            variantId: model.variantId,
            purpose: model.purpose,
            scaffold: model.scaffold,
            direction: model.direction,
            language: model.language,
          },
        ]
      },
    )
  }, [renderState.surfaces])

  useEffect(() => {
    if (surfaces.length === 0) return
    if (
      !activeSurfaceId ||
      !surfaces.some((surface) => surface.surfaceId === activeSurfaceId)
    ) {
      setActiveSurfaceId(surfaces[0]?.surfaceId ?? null)
    }
  }, [activeSurfaceId, surfaces])

  function handleAction(surfaceId: string, action: string, itemId?: string) {
    setSelections((current) => {
      const previous = current[surfaceId] ?? {}

      if (action === 'selectSource' && itemId) {
        return { ...current, [surfaceId]: { ...previous, source: itemId } }
      }
      if (action === 'selectTarget' && itemId) {
        return { ...current, [surfaceId]: { ...previous, target: itemId } }
      }
      if (action === 'clearSelection') {
        return { ...current, [surfaceId]: {} }
      }

      return current
    })
  }

  function retryPreview() {
    setRetryToken((token) => token + 1)
  }

  const activeSurface = activeSurfaceId
    ? renderState.surfaces[activeSurfaceId]
    : undefined
  const activeEntry = surfaces.find(
    (surface) => surface.surfaceId === activeSurfaceId,
  )
  const activeSelection = activeSurfaceId
    ? selections[activeSurfaceId]
    : undefined

  return (
    <section className="a2ui-preview" aria-labelledby="a2ui-preview-heading">
      <div className="a2ui-preview__header">
        <div>
          <p className="eyebrow">
            Safe A2UI preview · catalog {A2UI_CATALOG_VERSION}
          </p>
          <h3 id="a2ui-preview-heading">
            Explore the lesson, one learning move at a time.
          </h3>
          <p className="section-description">
            These controls are a semantic teacher preview. Nothing here
            publishes, grades, or reveals the answer key.
          </p>
        </div>
        <span
          className={`a2ui-preview__status a2ui-preview__status--${status}`}
          role="status"
          aria-live="polite"
        >
          {statusMessage}
        </span>
      </div>

      {status === 'loading' && surfaces.length === 0 ? (
        <PreviewLoading />
      ) : null}

      {surfaces.length > 0 ? (
        <>
          <div
            className="a2ui-tabs"
            role="tablist"
            aria-label="Lesson variant previews"
          >
            {surfaces.map((surface, index) => {
              const selected = surface.surfaceId === activeSurfaceId
              return (
                <button
                  className={`a2ui-tab${selected ? ' is-active' : ''}`}
                  id={`a2ui-tab-${surface.variantId}`}
                  key={surface.surfaceId}
                  role="tab"
                  aria-controls={`a2ui-panel-${surface.variantId}`}
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  ref={(element) => {
                    tabRefs.current[surface.surfaceId] = element
                  }}
                  type="button"
                  onClick={() => setActiveSurfaceId(surface.surfaceId)}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')
                      return
                    event.preventDefault()
                    const nextIndex =
                      event.key === 'ArrowRight' ? index + 1 : index - 1
                    const next =
                      surfaces[(nextIndex + surfaces.length) % surfaces.length]
                    setActiveSurfaceId(next.surfaceId)
                    tabRefs.current[next.surfaceId]?.focus()
                  }}
                >
                  <span>{surface.purpose}</span>
                  <small>{surface.scaffold}</small>
                </button>
              )
            })}
          </div>

          {activeSurface && activeEntry ? (
            <div
              className="a2ui-surface-panel"
              id={`a2ui-panel-${activeEntry.variantId}`}
              role="tabpanel"
              aria-labelledby={`a2ui-tab-${activeEntry.variantId}`}
              tabIndex={0}
            >
              <div
                className="a2ui-surface"
                dir={activeEntry.direction}
                lang={activeEntry.language}
                aria-label={activeSurface.dataModel?.accessibilityDescription}
              >
                <A2UIComponentRenderer
                  surface={activeSurface}
                  componentId="root"
                  surfaceId={activeSurfaceId ?? ''}
                  onAction={handleAction}
                  selection={activeSelection}
                />
                <p className="a2ui-selection-feedback" aria-live="polite">
                  {activeSelection?.source && activeSelection.target
                    ? 'Preview selection captured. Clear selection to try another pair.'
                    : activeSelection?.source
                      ? 'Source selected. Choose a candidate fraction.'
                      : activeSelection?.target
                        ? 'Candidate selected. Choose a source fraction.'
                        : 'Choose a source fraction, then a candidate fraction.'}
                </p>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {status === 'disconnected' ||
      status === 'timed-out' ||
      status === 'blocked' ? (
        <div
          className={`a2ui-preview__recovery a2ui-preview__recovery--${status}`}
          role="alert"
        >
          <strong>
            {status === 'blocked'
              ? 'Preview stopped safely'
              : status === 'timed-out'
                ? 'Preview timed out'
                : 'Preview connection paused'}
          </strong>
          <span>{statusMessage}</span>
          <button className="a2ui-retry" type="button" onClick={retryPreview}>
            Retry preview
          </button>
        </div>
      ) : null}
    </section>
  )
}

function PreviewLoading() {
  return (
    <div className="a2ui-loading" role="status" aria-live="polite">
      <div className="a2ui-loading__line a2ui-loading__line--wide" />
      <div className="a2ui-loading__line" />
      <div className="a2ui-loading__grid" aria-hidden="true">
        <div />
        <div />
        <div />
        <div />
      </div>
      <span>Receiving the four semantic lesson surfaces…</span>
    </div>
  )
}

interface A2UIComponentRendererProps {
  surface: A2UIRenderSurface
  componentId: string
  surfaceId: string
  onAction: (surfaceId: string, action: string, itemId?: string) => void
  selection?: SelectionState
  visited?: ReadonlySet<string>
}

export function A2UIComponentRenderer({
  surface,
  componentId,
  surfaceId,
  onAction,
  selection,
  visited = new Set<string>(),
}: A2UIComponentRendererProps): ReactNode {
  if (visited.has(componentId)) return null
  const component = surface.components[componentId]
  if (!component) return null
  const nextVisited = new Set(visited).add(componentId)

  if (component.component === 'Column' || component.component === 'Row') {
    const className =
      component.component === 'Column' ? 'a2ui-column' : 'a2ui-row'
    return (
      <div className={className}>
        {component.children.map((childId) => (
          <A2UIComponentRenderer
            key={childId}
            surface={surface}
            componentId={childId}
            surfaceId={surfaceId}
            onAction={onAction}
            selection={selection}
            visited={nextVisited}
          />
        ))}
      </div>
    )
  }

  if (component.component === 'Card') {
    return (
      <section
        className={`a2ui-card a2ui-card--${component.tone ?? 'surface'}`}
      >
        <A2UIComponentRenderer
          surface={surface}
          componentId={component.child}
          surfaceId={surfaceId}
          onAction={onAction}
          selection={selection}
          visited={nextVisited}
        />
      </section>
    )
  }

  if (component.component === 'Text') {
    if (component.variant === 'heading') {
      return <h4 className="a2ui-text a2ui-text--heading">{component.text}</h4>
    }
    if (component.variant === 'subheading') {
      return (
        <h5 className="a2ui-text a2ui-text--subheading">{component.text}</h5>
      )
    }
    if (component.variant === 'label') {
      return <p className="a2ui-text a2ui-text--label">{component.text}</p>
    }
    if (component.variant === 'caption') {
      return (
        <span className="a2ui-text a2ui-text--caption">{component.text}</span>
      )
    }
    return <p className="a2ui-text">{component.text}</p>
  }

  if (component.component === 'MatchCard') {
    const selected =
      component.group === 'source'
        ? selection?.source === component.itemId
        : selection?.target === component.itemId

    return (
      <button
        className={`a2ui-match-card a2ui-match-card--${component.group}${selected ? ' is-selected' : ''}`}
        type="button"
        aria-pressed={selected}
        aria-label={`${component.label}. ${component.description ?? ''}`.trim()}
        onClick={() =>
          onAction(surfaceId, component.action.event.name, component.itemId)
        }
      >
        <span>{component.label}</span>
        <small>{component.group === 'source' ? 'Source' : 'Candidate'}</small>
      </button>
    )
  }

  if (component.component === 'Button') {
    return (
      <button
        className={`a2ui-action a2ui-action--${component.variant}`}
        type="button"
        onClick={() => onAction(surfaceId, component.action.event.name)}
      >
        {component.label}
      </button>
    )
  }

  if (component.component === 'LearningPath') {
    return renderLearningPath(surface.dataModel, surfaceId)
  }

  return (
    <p className={`a2ui-status a2ui-status--${component.kind}`} role="status">
      {component.text}
    </p>
  )
}

function renderLearningPath(
  dataModel: A2UIRenderSurface['dataModel'],
  surfaceId: string,
): ReactNode {
  if (!dataModel?.learningPath) return null
  const { learningPath } = dataModel

  const headingId = `a2ui-learning-path-heading-${surfaceId}`
  const isArabic = dataModel.language === 'ar'
  const copy = isArabic
    ? {
        eyebrow: 'مسار التعلم',
        title: 'لماذا يبدأ هذا الدرس من هنا؟',
        direction: 'ترتيب المتطلبات',
        prerequisite: 'متطلب سابق',
        target: 'المفهوم المستهدف',
        rationale: 'سبب هذا المسار',
        nextScreen: 'سبب الشاشة التالية',
        draft: 'المسودة',
        graph: 'الرسم البياني',
        model: 'النموذج',
        catalog: 'الفهرس',
      }
    : {
        eyebrow: 'Learning path',
        title: 'Why this lesson starts here',
        direction: 'Prerequisite order',
        prerequisite: 'Prerequisite',
        target: 'Target concept',
        rationale: 'Why this path',
        nextScreen: 'Next-screen rationale',
        draft: 'Draft',
        graph: 'Graph',
        model: 'Model',
        catalog: 'Catalog',
      }

  return (
    <section className="a2ui-learning-path" aria-labelledby={headingId}>
      <div className="a2ui-learning-path__header">
        <div>
          <p className="a2ui-text a2ui-text--label">{copy.eyebrow}</p>
          <h4 id={headingId} className="a2ui-learning-path__title">
            {copy.title}
          </h4>
        </div>
        <span className="a2ui-learning-path__direction">{copy.direction}</span>
      </div>

      <ol className="a2ui-learning-path__steps">
        {learningPath.steps.map((step, index) => (
          <li
            className={`a2ui-learning-path__step a2ui-learning-path__step--${step.role}`}
            key={step.nodeId}
          >
            <span className="a2ui-learning-path__number" aria-hidden="true">
              {index + 1}
            </span>
            <div className="a2ui-learning-path__step-copy">
              <span className="a2ui-learning-path__role">
                {step.role === 'prerequisite' ? copy.prerequisite : copy.target}
              </span>
              <strong>{step.label}</strong>
              <span>{step.screenPurpose}</span>
            </div>
          </li>
        ))}
      </ol>

      <div className="a2ui-learning-path__notes">
        <div>
          <strong>{copy.rationale}</strong>
          <p>{learningPath.rationale}</p>
        </div>
        <div>
          <strong>{copy.nextScreen}</strong>
          <p>{learningPath.nextScreenRationale}</p>
        </div>
      </div>

      <dl className="a2ui-learning-path__pins">
        <div>
          <dt>{copy.draft}</dt>
          <dd>{learningPath.versionPins.draftId}</dd>
        </div>
        <div>
          <dt>{copy.graph}</dt>
          <dd>{learningPath.versionPins.graphVersion}</dd>
        </div>
        <div>
          <dt>{copy.model}</dt>
          <dd>{learningPath.versionPins.modelVersion}</dd>
        </div>
        <div>
          <dt>{copy.catalog}</dt>
          <dd>{learningPath.versionPins.catalogVersion}</dd>
        </div>
      </dl>
    </section>
  )
}
