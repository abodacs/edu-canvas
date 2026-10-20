import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  A2UI_CATALOG_VERSION,
  A2UI_PROTOCOL_VERSION,
} from "@/shared/a2ui-contract";
import { applyA2UIMessage, createA2UIRenderState } from "./renderer";
import {
  consumeA2UIPreviewStream,
  PreviewStreamMessageError,
} from "./preview-stream";
import type { A2UIComponent } from "@/shared/a2ui-contract";
import type { A2UIRenderState, A2UIRenderSurface } from "./renderer";
import type { ElementType, ReactNode } from "react";

const PREVIEW_STREAM_TIMEOUT_MS = 8000;
const PREVIEW_LOADING_MESSAGE = "Opening the safe lesson preview…";

const recoveryTitles: Record<string, string> = {
  blocked: "Preview stopped safely",
  "timed-out": "Preview timed out",
};

const recoveryStatuses = new Set<PreviewStatus>([
  "disconnected",
  "timed-out",
  "blocked",
]);

type PreviewStatus =
  "loading" | "ready" | "disconnected" | "timed-out" | "blocked";

interface LessonPreviewProperties {
  readonly requestId: string;
}

interface SelectionState {
  source?: string;
  target?: string;
}

const describeSelection = (selection: SelectionState | undefined): string => {
  switch (`${Boolean(selection?.source)}:${Boolean(selection?.target)}`) {
    case "true:true": {
      return "Preview selection captured. Clear selection to try another pair.";
    }
    case "true:false": {
      return "Source selected. Choose a candidate fraction.";
    }
    case "false:true": {
      return "Candidate selected. Choose a source fraction.";
    }
    default: {
      return "Choose a source fraction, then a candidate fraction.";
    }
  }
};

interface SurfaceEntry {
  surfaceId: string;
  variantId: string;
  purpose: string;
  scaffold: string;
  direction: "ltr" | "rtl";
  language: "en" | "ar";
}

const renderLearningPath = (
  dataModel: A2UIRenderSurface["dataModel"],
  surfaceId: string
): ReactNode => {
  if (!dataModel?.learningPath) {
    return null;
  }
  const { learningPath } = dataModel;

  const headingId = `a2ui-learning-path-heading-${surfaceId}`;
  const isArabic = dataModel.language === "ar";
  const copy = isArabic
    ? {
        eyebrow: "مسار التعلم",
        title: "لماذا يبدأ هذا الدرس من هنا؟",
        direction: "ترتيب المتطلبات",
        prerequisite: "متطلب سابق",
        target: "المفهوم المستهدف",
        rationale: "سبب هذا المسار",
        nextScreen: "سبب الشاشة التالية",
        draft: "المسودة",
        graph: "الرسم البياني",
        model: "النموذج",
        catalog: "الفهرس",
      }
    : {
        eyebrow: "Learning path",
        title: "Why this lesson starts here",
        direction: "Prerequisite order",
        prerequisite: "Prerequisite",
        target: "Target concept",
        rationale: "Why this path",
        nextScreen: "Next-screen rationale",
        draft: "Draft",
        graph: "Graph",
        model: "Model",
        catalog: "Catalog",
      };

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
        {learningPath.steps.map((step, index) => {
          return (
            <li
              className={`a2ui-learning-path__step a2ui-learning-path__step--${step.role}`}
              key={step.nodeId}
            >
              <span className="a2ui-learning-path__number" aria-hidden="true">
                {index + 1}
              </span>
              <div className="a2ui-learning-path__step-copy">
                <span className="a2ui-learning-path__role">
                  {step.role === "prerequisite"
                    ? copy.prerequisite
                    : copy.target}
                </span>
                <strong>{step.label}</strong>
                <span>{step.screenPurpose}</span>
              </div>
            </li>
          );
        })}
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
  );
};

const PreviewLoading = () => {
  return (
    <div className="a2ui-loading" aria-live="polite">
      <div className="a2ui-loading__line a2ui-loading__line--wide" />
      <div className="a2ui-loading__line" />
      <div className="a2ui-loading__grid" aria-hidden="true">
        <div />
        <div />
        <div />
        <div />
      </div>
      <output>Receiving the four semantic lesson surfaces…</output>
    </div>
  );
};

interface ComponentRenderContext {
  readonly surface: A2UIRenderSurface;
  readonly surfaceId: string;
  readonly onAction: (
    surfaceId: string,
    action: string,
    itemId?: string
  ) => void;
  readonly selection?: SelectionState;
  readonly renderChild: (componentId: string) => ReactNode;
}

const renderContainer = (
  component: A2UIComponent,
  context: ComponentRenderContext
): ReactNode => {
  if (component.component !== "Column" && component.component !== "Row") {
    return null;
  }
  const className =
    component.component === "Column" ? "a2ui-column" : "a2ui-row";

  return (
    <div className={className}>
      {component.children.map((childId) => {
        return (
          <Fragment key={childId}>{context.renderChild(childId)}</Fragment>
        );
      })}
    </div>
  );
};

const renderCard = (
  component: A2UIComponent,
  context: ComponentRenderContext
): ReactNode => {
  if (component.component !== "Card") {
    return null;
  }

  return (
    <section className={`a2ui-card a2ui-card--${component.tone ?? "surface"}`}>
      {context.renderChild(component.child)}
    </section>
  );
};

interface TextVariantSpec {
  readonly element: ElementType;
  readonly className: string;
}

const defaultTextVariant: TextVariantSpec = {
  element: "p",
  className: "a2ui-text",
};

const textVariants: Record<string, TextVariantSpec> = {
  heading: { element: "h4", className: "a2ui-text a2ui-text--heading" },
  subheading: { element: "h5", className: "a2ui-text a2ui-text--subheading" },
  label: { element: "p", className: "a2ui-text a2ui-text--label" },
  caption: { element: "span", className: "a2ui-text a2ui-text--caption" },
};

const renderText = (component: A2UIComponent): ReactNode => {
  if (component.component !== "Text") {
    return null;
  }
  const variant = component.variant
    ? (textVariants[component.variant] ?? defaultTextVariant)
    : defaultTextVariant;
  const Element = variant.element;

  return <Element className={variant.className}>{component.text}</Element>;
};

const renderMatchCard = (
  component: A2UIComponent,
  context: ComponentRenderContext
): ReactNode => {
  if (component.component !== "MatchCard") {
    return null;
  }
  const selectedItemId =
    component.group === "source"
      ? context.selection?.source
      : context.selection?.target;
  const isSelected = selectedItemId === component.itemId;

  return (
    <button
      className={`a2ui-match-card a2ui-match-card--${component.group}${isSelected ? "is-selected" : ""}`}
      type="button"
      aria-pressed={isSelected}
      aria-label={`${component.label}. ${component.description ?? ""}`.trim()}
      onClick={() => {
        return context.onAction(
          context.surfaceId,
          component.action.event.name,
          component.itemId
        );
      }}
    >
      <span>{component.label}</span>
      <small>{component.group === "source" ? "Source" : "Candidate"}</small>
    </button>
  );
};

const renderButton = (
  component: A2UIComponent,
  context: ComponentRenderContext
): ReactNode => {
  if (component.component !== "Button") {
    return null;
  }

  return (
    <button
      className={`a2ui-action a2ui-action--${component.variant}`}
      type="button"
      onClick={() =>
        context.onAction(context.surfaceId, component.action.event.name)
      }
    >
      {component.label}
    </button>
  );
};

const renderLearningPathComponent = (
  component: A2UIComponent,
  context: ComponentRenderContext
): ReactNode => {
  return component.component === "LearningPath"
    ? renderLearningPath(context.surface.dataModel, context.surfaceId)
    : null;
};

const renderStatus = (component: A2UIComponent): ReactNode => {
  if (component.component !== "Status") {
    return null;
  }

  return (
    <output className={`a2ui-status a2ui-status--${component.kind}`}>
      {component.text}
    </output>
  );
};

type ComponentRenderer = (
  component: A2UIComponent,
  context: ComponentRenderContext
) => ReactNode;

const componentRenderers: Record<string, ComponentRenderer> = {
  Column: renderContainer,
  Row: renderContainer,
  Card: renderCard,
  Text: renderText,
  MatchCard: renderMatchCard,
  Button: renderButton,
  LearningPath: renderLearningPathComponent,
  Status: renderStatus,
};

interface A2UIComponentRendererProperties {
  readonly surface: A2UIRenderSurface;
  readonly componentId: string;
  readonly surfaceId: string;
  readonly onAction: (
    surfaceId: string,
    action: string,
    itemId?: string
  ) => void;
  readonly selection?: SelectionState;
  readonly visited?: ReadonlySet<string>;
}

const emptyVisited: ReadonlySet<string> = new Set<string>();

const renderA2UIComponent = ({
  surface,
  componentId,
  surfaceId,
  onAction,
  selection,
  visited = emptyVisited,
}: A2UIComponentRendererProperties): ReactNode => {
  if (visited.has(componentId)) {
    return null;
  }
  const component = surface.components[componentId];
  if (!component) {
    return null;
  }
  const nextVisited = new Set(visited);
  nextVisited.add(componentId);

  const context: ComponentRenderContext = {
    surface,
    surfaceId,
    onAction,
    selection,
    renderChild: (childId) => {
      return renderA2UIComponent({
        surface,
        componentId: childId,
        surfaceId,
        onAction,
        selection,
        visited: nextVisited,
      });
    },
  };

  const renderer = componentRenderers[component.component] ?? renderStatus;
  return renderer(component, context);
};

const A2UIComponentRenderer = renderA2UIComponent;

export { A2UIComponentRenderer };

const usePreviewStream = (requestId: string, retryToken: number) => {
  const [renderState, setRenderState] = useState<A2UIRenderState>(() =>
    createA2UIRenderState()
  );
  const renderStateReference = useRef(renderState);
  const [status, setStatus] = useState<PreviewStatus>("loading");
  const [statusMessage, setStatusMessage] = useState(PREVIEW_LOADING_MESSAGE);

  useEffect(() => {
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      if (controller.signal.aborted) {
        return;
      }

      setStatus("timed-out");
      setStatusMessage(
        "The preview took too long to arrive. Your draft is still safe; try opening the preview again."
      );
      controller.abort();
    }, PREVIEW_STREAM_TIMEOUT_MS);

    const url = new URL("/api/a2ui/preview", window.location.origin);
    url.searchParams.set("role", "teacher");
    url.searchParams.set("requestId", requestId);
    url.searchParams.set("catalogVersion", A2UI_CATALOG_VERSION);

    const streamPreview = async () => {
      setStatus("loading");
      setStatusMessage(PREVIEW_LOADING_MESSAGE);

      const response = await fetch(url, {
        headers: {
          Accept: "text/event-stream",
          "x-edu-canvas-a2ui-version": A2UI_PROTOCOL_VERSION,
        },
        signal: controller.signal,
      });
      const outcome = await consumeA2UIPreviewStream(response, (message) => {
        const applied = applyA2UIMessage(renderStateReference.current, message);
        if (!applied.ok) {
          throw new PreviewStreamMessageError(applied.code, applied.message);
        }

        renderStateReference.current = applied.state;
        setRenderState(applied.state);
      });

      if (controller.signal.aborted) {
        return;
      }

      if (outcome.status === "complete") {
        const surfaceCount = Object.keys(
          renderStateReference.current.surfaces
        ).length;
        if (surfaceCount !== 4 || outcome.surfaceCount !== 4) {
          setStatus("blocked");
          setStatusMessage(
            "The preview was incomplete, so it was stopped safely. Try opening it again."
          );
          return;
        }

        setStatus("ready");
        setStatusMessage("Four lesson variants are ready to explore.");
        return;
      }

      if (
        [
          "UNKNOWN_COMPONENT",
          "UNKNOWN_ACTION",
          "UNSAFE_PAYLOAD",
          "UNSUPPORTED_PROPERTY",
        ].includes(outcome.code)
      ) {
        setStatus("blocked");
        setStatusMessage(outcome.message);
        return;
      }

      setStatus("disconnected");
      setStatusMessage(outcome.message);
    };

    const runPreview = async (): Promise<void> => {
      try {
        await streamPreview();
      } catch {
        if (!controller.signal.aborted) {
          setStatus("disconnected");
          setStatusMessage(
            "The preview connection was interrupted. Check your connection and try again."
          );
        }
      }
      clearTimeout(timeoutId);
    };

    void runPreview();

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [requestId, retryToken]);

  return { renderState, status, statusMessage };
};

interface PreviewHeaderProperties {
  readonly status: PreviewStatus;
  readonly statusMessage: string;
}

const PreviewHeader = ({ status, statusMessage }: PreviewHeaderProperties) => {
  return (
    <div className="a2ui-preview__header">
      <div>
        <p className="eyebrow">
          Safe A2UI preview · catalog {A2UI_CATALOG_VERSION}
        </p>
        <h3 id="a2ui-preview-heading">
          Explore the lesson, one learning move at a time.
        </h3>
        <p className="section-description">
          These controls are a semantic teacher preview. Nothing here publishes,
          grades, or reveals the answer key.
        </p>
      </div>
      <output
        className={`a2ui-preview__status a2ui-preview__status--${status}`}
        aria-live="polite"
      >
        {statusMessage}
      </output>
    </div>
  );
};

interface VariantTabsProperties {
  readonly surfaces: readonly SurfaceEntry[];
  readonly activeSurfaceId: string | null;
  readonly onSelect: (surfaceId: string) => void;
}

const VariantTabs = ({
  surfaces,
  activeSurfaceId,
  onSelect,
}: VariantTabsProperties) => {
  const tabReferences = useRef<Record<string, HTMLButtonElement | null>>({});

  return (
    <div
      className="a2ui-tabs"
      role="tablist"
      aria-label="Lesson variant previews"
    >
      {surfaces.map((surface, index) => {
        const isSelected = surface.surfaceId === activeSurfaceId;
        return (
          <button
            className={`a2ui-tab${isSelected ? "is-active" : ""}`}
            id={`a2ui-tab-${surface.variantId}`}
            key={surface.surfaceId}
            role="tab"
            aria-controls={`a2ui-panel-${surface.variantId}`}
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            ref={(element) => {
              tabReferences.current[surface.surfaceId] = element;
            }}
            type="button"
            onClick={() => onSelect(surface.surfaceId)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
                return;
              }
              event.preventDefault();
              const nextIndex =
                event.key === "ArrowRight" ? index + 1 : index - 1;
              const next =
                surfaces[(nextIndex + surfaces.length) % surfaces.length];
              if (!next) {
                return;
              }
              onSelect(next.surfaceId);
              tabReferences.current[next.surfaceId]?.focus();
            }}
          >
            <span>{surface.purpose}</span>
            <small>{surface.scaffold}</small>
          </button>
        );
      })}
    </div>
  );
};

interface SurfacePanelProperties {
  readonly surface: A2UIRenderSurface;
  readonly entry: SurfaceEntry;
  readonly onAction: (
    surfaceId: string,
    action: string,
    itemId?: string
  ) => void;
  readonly selection?: SelectionState;
}

const SurfacePanel = ({
  surface,
  entry,
  onAction,
  selection,
}: SurfacePanelProperties) => {
  return (
    <div
      className="a2ui-surface-panel"
      id={`a2ui-panel-${entry.variantId}`}
      role="tabpanel"
      aria-labelledby={`a2ui-tab-${entry.variantId}`}
    >
      <section
        className="a2ui-surface"
        dir={entry.direction}
        lang={entry.language}
        aria-label={surface.dataModel?.accessibilityDescription}
      >
        <A2UIComponentRenderer
          surface={surface}
          componentId="root"
          surfaceId={entry.surfaceId}
          onAction={onAction}
          selection={selection}
        />
        <p className="a2ui-selection-feedback" aria-live="polite">
          {describeSelection(selection)}
        </p>
      </section>
    </div>
  );
};

interface PreviewRecoveryProperties {
  readonly status: PreviewStatus;
  readonly statusMessage: string;
  readonly onRetry: () => void;
}

const PreviewRecovery = ({
  status,
  statusMessage,
  onRetry,
}: PreviewRecoveryProperties) => {
  if (!recoveryStatuses.has(status)) {
    return null;
  }

  return (
    <div
      className={`a2ui-preview__recovery a2ui-preview__recovery--${status}`}
      role="alert"
    >
      <strong>{recoveryTitles[status] ?? "Preview connection paused"}</strong>
      <span>{statusMessage}</span>
      <button className="a2ui-retry" type="button" onClick={onRetry}>
        Retry preview
      </button>
    </div>
  );
};

export const LessonPreview = ({ requestId }: LessonPreviewProperties) => {
  const [retryToken, setRetryToken] = useState(0);
  const { renderState, status, statusMessage } = usePreviewStream(
    requestId,
    retryToken
  );
  const [requestedSurfaceId, setRequestedSurfaceId] = useState<string | null>(
    null
  );
  const [selections, setSelections] = useState<Record<string, SelectionState>>(
    {}
  );

  const surfaces = useMemo<SurfaceEntry[]>(() => {
    const entries: SurfaceEntry[] = [];
    for (const [surfaceId, surface] of Object.entries(renderState.surfaces)) {
      const model = surface?.dataModel;
      if (model) {
        entries.push({
          surfaceId,
          variantId: model.variantId,
          purpose: model.purpose,
          scaffold: model.scaffold,
          direction: model.direction,
          language: model.language,
        });
      }
    }
    return entries;
  }, [renderState.surfaces]);

  const fallbackSurfaceId = surfaces[0]?.surfaceId ?? null;
  const activeSurfaceId =
    requestedSurfaceId &&
    surfaces.some((surface) => surface.surfaceId === requestedSurfaceId)
      ? requestedSurfaceId
      : fallbackSurfaceId;

  const handleAction = (surfaceId: string, action: string, itemId?: string) => {
    setSelections((current) => {
      const previous = current[surfaceId] ?? {};

      if (action === "selectSource" && itemId) {
        return { ...current, [surfaceId]: { ...previous, source: itemId } };
      }
      if (action === "selectTarget" && itemId) {
        return { ...current, [surfaceId]: { ...previous, target: itemId } };
      }
      return action === "clearSelection"
        ? { ...current, [surfaceId]: {} }
        : current;
    });
  };

  const retryPreview = () => {
    setRetryToken((token) => token + 1);
  };

  const activeSurface = activeSurfaceId
    ? renderState.surfaces[activeSurfaceId]
    : undefined;
  const activeEntry = surfaces.find(
    (surface) => surface.surfaceId === activeSurfaceId
  );
  const activeSelection = activeSurfaceId
    ? selections[activeSurfaceId]
    : undefined;

  return (
    <section className="a2ui-preview" aria-labelledby="a2ui-preview-heading">
      <PreviewHeader status={status} statusMessage={statusMessage} />

      {status === "loading" && surfaces.length === 0 ? (
        <PreviewLoading />
      ) : null}

      {surfaces.length > 0 ? (
        <>
          <VariantTabs
            surfaces={surfaces}
            activeSurfaceId={activeSurfaceId}
            onSelect={setRequestedSurfaceId}
          />

          {activeSurface && activeEntry ? (
            <SurfacePanel
              surface={activeSurface}
              entry={activeEntry}
              onAction={handleAction}
              selection={activeSelection}
            />
          ) : null}
        </>
      ) : null}

      <PreviewRecovery
        status={status}
        statusMessage={statusMessage}
        onRetry={retryPreview}
      />
    </section>
  );
};
