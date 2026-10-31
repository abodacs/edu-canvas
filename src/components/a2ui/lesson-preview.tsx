import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utilities";
import {
  A2UI_CATALOG_VERSION,
  A2UI_PROTOCOL_VERSION,
} from "@/shared/a2ui-contract";
import { applyA2UIMessage, createA2UIRenderState } from "./renderer";
import {
  consumeA2UIPreviewStream,
  PreviewStreamMessageError,
} from "./preview-stream";
import { A2UIComponentRenderer } from "./component-renderer";
import type { SelectionState } from "./component-renderer";
import type { A2UIRenderState, A2UIRenderSurface } from "./renderer";

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
  // The record's pinned catalog (from generation provenance). matching-v1
  // stays the default for records that predate catalog pinning.
  readonly catalogVersion?: string;
  // #5: render a persisted review revision instead of the generation record.
  readonly previewVersionId?: string;
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
  tabId: string;
  label: string;
  sublabel: string;
  description: string;
  direction: "ltr" | "rtl";
  language: "en" | "ar";
}

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
      <output>Receiving the semantic lesson surfaces…</output>
    </div>
  );
};

const usePreviewStream = (
  requestId: string,
  retryToken: number,
  catalogVersion: string,
  previewVersionId?: string
) => {
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

    const previewPath = previewVersionId
      ? `/api/publications/versions/${encodeURIComponent(previewVersionId)}/preview`
      : "/api/a2ui/preview";
    const url = new URL(previewPath, window.location.origin);
    if (!previewVersionId) {
      url.searchParams.set("requestId", requestId);
      url.searchParams.set("catalogVersion", catalogVersion);
    }

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
        // The stream declares how many surfaces the record compiles to; the
        // count differs per catalog (four matching variants, one surface per
        // fraction section), so the client checks integrity, not a fixed 4.
        if (outcome.surfaceCount < 1 || surfaceCount !== outcome.surfaceCount) {
          setStatus("blocked");
          setStatusMessage(
            "The preview was incomplete, so it was stopped safely. Try opening it again."
          );
          return;
        }

        setStatus("ready");
        setStatusMessage("The lesson surfaces are ready to explore.");
        return;
      }

      if (
        [
          "UNKNOWN_COMPONENT",
          "UNKNOWN_ACTION",
          "UNSAFE_PAYLOAD",
          "UNSUPPORTED_PROPERTY",
          "UNSUPPORTED_CATALOG",
          "INVALID_MATH",
          "INVALID_FRACTION_VALUE",
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
  }, [requestId, retryToken, catalogVersion, previewVersionId]);

  return { renderState, status, statusMessage };
};

interface PreviewHeaderProperties {
  readonly status: PreviewStatus;
  readonly statusMessage: string;
}

const PreviewHeader = ({
  status,
  statusMessage,
  catalogVersion,
}: PreviewHeaderProperties & { readonly catalogVersion: string }) => {
  return (
    <div className="a2ui-preview__header">
      <div>
        <p className="eyebrow">Safe A2UI preview · catalog {catalogVersion}</p>
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
            className={cn("a2ui-tab", { "is-active": isSelected })}
            id={`a2ui-tab-${surface.tabId}`}
            key={surface.surfaceId}
            role="tab"
            aria-controls={`a2ui-panel-${surface.tabId}`}
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
            <span>{surface.label}</span>
            {surface.sublabel ? <small>{surface.sublabel}</small> : null}
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
      id={`a2ui-panel-${entry.tabId}`}
      role="tabpanel"
      aria-labelledby={`a2ui-tab-${entry.tabId}`}
      // WAI-ARIA APG: a panel with no focusable control must itself be
      // reachable by keyboard so screen-reader users can read its content.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- tabpanel is a valid tab stop.
      tabIndex={0}
    >
      <section
        className="a2ui-surface"
        dir={entry.direction}
        lang={entry.language}
        aria-label={entry.description}
      >
        <A2UIComponentRenderer
          surface={surface}
          componentId="root"
          surfaceId={entry.surfaceId}
          onAction={onAction}
          selection={selection}
        />
        {surface.catalogVersion === A2UI_CATALOG_VERSION && (
          <p className="a2ui-selection-feedback" aria-live="polite">
            {describeSelection(selection)}
          </p>
        )}
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

export const LessonPreview = ({
  requestId,
  catalogVersion,
  previewVersionId,
}: LessonPreviewProperties) => {
  const [retryToken, setRetryToken] = useState(0);
  const pinnedCatalogVersion = catalogVersion ?? A2UI_CATALOG_VERSION;
  const { renderState, status, statusMessage } = usePreviewStream(
    requestId,
    retryToken,
    pinnedCatalogVersion,
    previewVersionId
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
      if (!model) {
        continue;
      }
      if ("variantId" in model) {
        entries.push({
          surfaceId,
          tabId: model.variantId,
          label: model.purpose,
          sublabel: model.scaffold,
          description: model.accessibilityDescription,
          direction: model.direction,
          language: model.language,
        });
      } else {
        entries.push({
          surfaceId,
          tabId: model.sectionId,
          label: model.purpose,
          sublabel: "",
          description: model.purpose,
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
    // #116: in the teacher preview, advanceStage moves the previewed stage
    // forward; the server-authorized learner transition lands with learner
    // delivery and never persists anything from this preview.
    if (action !== "advanceStage") {
      return;
    }
    const currentIndex = surfaces.findIndex(
      (surface) => surface.surfaceId === surfaceId
    );
    const next = surfaces[currentIndex + 1];
    if (next) {
      setRequestedSurfaceId(next.surfaceId);
    }
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
      <PreviewHeader
        status={status}
        statusMessage={statusMessage}
        catalogVersion={pinnedCatalogVersion}
      />

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
