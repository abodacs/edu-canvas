import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  approvePublicationTarget,
  openPublicationReview,
  publishPublication,
  revisePublicationVersion,
} from "@/lib/publication-client";
import { reversePathTargetId } from "@/shared/publication-contract";
import { ReviewGallery } from "./review-gallery";
import { ErrorPanel } from "./review-shared";
import { VariantEditor } from "./variant-editor";
import { PublishConfirmation } from "./publish-confirmation";
import type { PublishedSummary } from "./publish-confirmation";

import type { PublicationClientError } from "@/lib/publication-client";
import type {
  PublicationEdit,
  ReviewPack,
} from "@/shared/publication-contract";

interface ReviewStudioProperties {
  readonly requestId: string;
  readonly csrf: string;
  readonly onClose: () => void;
  readonly onUnauthorized: () => void;
}

type ReviewView = "gallery" | "variant" | "confirm";

interface ReviewStudioState {
  review: ReviewPack | null;
  error: PublicationClientError | null;
  notice: string | null;
  view: ReviewView;
  activeVariantId: string | null;
  busy: boolean;
  published: PublishedSummary | null;
}

type ReviewStudioAction =
  | { type: "review"; review: ReviewPack }
  | { type: "error"; error: PublicationClientError | null }
  | { type: "notice"; notice: string | null }
  | { type: "view"; view: ReviewView }
  | { type: "openVariant"; variantId: string }
  | { type: "busy"; busy: boolean }
  | { type: "published"; published: PublishedSummary };

const initialState: ReviewStudioState = {
  review: null,
  error: null,
  notice: null,
  view: "gallery",
  activeVariantId: null,
  busy: false,
  published: null,
};

const reducer = (
  state: ReviewStudioState,
  action: ReviewStudioAction
): ReviewStudioState => {
  switch (action.type) {
    case "review": {
      return { ...state, review: action.review, error: null, busy: false };
    }
    case "error": {
      return { ...state, error: action.error, busy: false };
    }
    case "notice": {
      return { ...state, notice: action.notice };
    }
    case "view": {
      return { ...state, view: action.view };
    }
    case "openVariant": {
      return {
        ...state,
        activeVariantId: action.variantId,
        view: "variant",
      };
    }
    case "busy": {
      return { ...state, busy: action.busy };
    }
    case "published": {
      return {
        ...state,
        published: action.published,
        busy: false,
        notice: null,
      };
    }
    default: {
      return state;
    }
  }
};

const sortedCodes = (codes: readonly string[]): string[] =>
  codes.toSorted((left, right) => left.localeCompare(right));

/**
The teacher curation surface (#5): gallery → screen review → publish
confirmation. Every action goes through the publication seam; the component
never computes approval or publication state locally.
*/
export const ReviewStudio = ({
  requestId,
  csrf,
  onClose,
  onUnauthorized,
}: ReviewStudioProperties) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const heading = useRef<HTMLHeadingElement>(null);
  const keys = useRef(new Map<string, string>());

  const handleFailure = useCallback(
    (failure: PublicationClientError): void => {
      if (failure.status === 401) {
        onUnauthorized();
        return;
      }
      dispatch({ type: "error", error: failure });
    },
    [onUnauthorized]
  );

  useEffect(() => {
    let isCancelled = false;
    const open = async (): Promise<void> => {
      const result = await openPublicationReview(requestId, csrf);
      if (isCancelled) {
        return;
      }
      if (result.ok) {
        dispatch({ type: "review", review: result.value });
      } else {
        handleFailure(result.error);
      }
    };
    void open();
    return () => {
      isCancelled = true;
    };
  }, [requestId, csrf, handleFailure]);

  useEffect(() => {
    heading.current?.focus();
  }, [state.view, state.review?.version.id]);

  if (!state.review && state.error) {
    return (
      <section className="review-studio" aria-label="Review and publish">
        <h2 ref={heading} tabIndex={-1}>
          The review is not available
        </h2>
        <ErrorPanel
          error={state.error}
          onDismiss={() => dispatch({ type: "error", error: null })}
        />
        <Button type="button" variant="outline" onClick={onClose}>
          Back to the studio
        </Button>
      </section>
    );
  }

  if (!state.review) {
    return (
      <output className="review-loading" aria-live="polite">
        Opening the persisted review…
      </output>
    );
  }

  const keyFor = (intent: string): string => {
    const existing = keys.current.get(intent);
    if (existing) {
      return existing;
    }
    const created = crypto.randomUUID();
    keys.current.set(intent, created);
    return created;
  };

  const clearKey = (intent: string): void => {
    keys.current.delete(intent);
  };

  const runApprove = async (
    targetKind: "variant" | "reverse-path",
    targetId: string,
    codes: string[]
  ): Promise<void> => {
    if (!state.review || state.busy) {
      return;
    }
    dispatch({ type: "busy", busy: true });
    dispatch({ type: "error", error: null });
    dispatch({ type: "notice", notice: null });
    const intent = `approve:${state.review.version.id}:${targetKind}:${targetId}:${sortedCodes(codes).join(",")}`;
    const result = await approvePublicationTarget(
      {
        requestId,
        versionId: state.review.version.id,
        targetKind,
        targetId,
        acknowledgedFindingCodes: codes,
        operationKey: keyFor(intent),
      },
      csrf
    );
    if (!result.ok) {
      handleFailure(result.error);
      return;
    }
    clearKey(intent);
    dispatch({ type: "review", review: result.value });
    dispatch({
      type: "notice",
      notice:
        targetKind === "variant"
          ? "Screen approved for this revision."
          : "Reverse reasoning path approved.",
    });
  };

  const runRevise = async (edits: PublicationEdit[]): Promise<void> => {
    if (!state.review || state.busy) {
      return;
    }
    if (edits.length === 0) {
      dispatch({
        type: "notice",
        notice: "No changes to save yet. Edit a piece, hint, or feedback.",
      });
      return;
    }
    dispatch({ type: "busy", busy: true });
    dispatch({ type: "error", error: null });
    dispatch({ type: "notice", notice: null });
    const intent = `revise:${state.review.version.id}:${JSON.stringify(edits)}`;
    const result = await revisePublicationVersion(
      {
        requestId,
        versionId: state.review.version.id,
        expectedArtifactHash: state.review.version.artifactHash,
        edits,
        operationKey: keyFor(intent),
      },
      csrf
    );
    if (!result.ok) {
      handleFailure(result.error);
      return;
    }
    clearKey(intent);
    dispatch({ type: "review", review: result.value });
    dispatch({
      type: "notice",
      notice: `Revision ${result.value.version.revision} saved and revalidated. Approvals start again.`,
    });
  };

  const runPublish = async (learnerId: string): Promise<void> => {
    if (!state.review || state.busy) {
      return;
    }
    dispatch({ type: "busy", busy: true });
    dispatch({ type: "error", error: null });
    dispatch({ type: "notice", notice: null });
    const intent = `publish:${state.review.version.id}:${learnerId}`;
    const result = await publishPublication(
      {
        requestId,
        versionId: state.review.version.id,
        expectedArtifactHash: state.review.version.artifactHash,
        learnerId,
        operationKey: keyFor(intent),
      },
      csrf
    );
    if (!result.ok) {
      handleFailure(result.error);
      return;
    }
    clearKey(intent);
    dispatch({ type: "review", review: result.value.review });
    dispatch({
      type: "published",
      published: {
        publicationId: result.value.publicationId,
        assignmentId: result.value.assignmentId,
        learnerName:
          state.review.availableLearners.find(
            (learner) => learner.id === learnerId
          )?.displayName ?? learnerId,
      },
    });
  };

  return (
    <section className="review-studio" aria-label="Review and publish">
      <div className="review-studio__toolbar">
        <Button type="button" variant="outline" onClick={onClose}>
          <ArrowLeft aria-hidden="true" /> Back to the studio
        </Button>
        <span className="review-studio__lock">
          <ShieldCheck aria-hidden="true" />
          Nothing reaches students until you publish.
        </span>
      </div>

      <output className="review-notice" aria-live="polite">
        {state.notice}
      </output>
      {state.error ? (
        <ErrorPanel
          error={state.error}
          onDismiss={() => dispatch({ type: "error", error: null })}
        />
      ) : null}

      {state.view === "gallery" ? (
        <ReviewGallery
          review={state.review}
          busy={state.busy}
          headingRef={heading}
          onOpenVariant={(variantId) => {
            dispatch({ type: "openVariant", variantId });
          }}
          onApproveReverse={(codes) => {
            void runApprove("reverse-path", reversePathTargetId, codes);
          }}
          onContinue={() => dispatch({ type: "view", view: "confirm" })}
        />
      ) : null}

      {state.view === "variant" && state.activeVariantId ? (
        <VariantEditor
          key={`${state.review.version.id}:${state.activeVariantId}`}
          review={state.review}
          variantId={state.activeVariantId}
          busy={state.busy}
          onBack={() => dispatch({ type: "view", view: "gallery" })}
          onApprove={(codes) => {
            void runApprove("variant", state.activeVariantId ?? "", codes);
          }}
          onSave={(edits) => {
            void runRevise(edits);
          }}
        />
      ) : null}

      {state.view === "confirm" ? (
        <PublishConfirmation
          review={state.review}
          busy={state.busy}
          published={state.published}
          onBack={() => dispatch({ type: "view", view: "gallery" })}
          onPublish={(learnerId) => {
            void runPublish(learnerId);
          }}
          onClose={onClose}
        />
      ) : null}
    </section>
  );
};
