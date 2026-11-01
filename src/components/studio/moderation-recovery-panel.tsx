import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

import { resolveModerationRecovery } from "./moderation-recovery";
import type { ModerationRecoveryInput } from "./moderation-recovery";

export interface ModerationRecoveryPanelProperties extends ModerationRecoveryInput {
  // The blocked request's objective, exactly as the teacher wrote it.
  readonly objective: string;
  readonly hasEarlierDraft: boolean;
  readonly onRevise: () => void;
}

// The #119 blocked-by-moderation panel. It replaces the retry affordance: one
// heading, the category reason, the preserved objective, the request
// reference, and the single "Revise request" action. Focus moves to the
// heading for a new request only; one live region repeats the visible reason.
export const ModerationRecoveryPanel = ({
  objective,
  hasEarlierDraft,
  category,
  requestId,
  onRevise,
}: ModerationRecoveryPanelProperties) => {
  const recovery = resolveModerationRecovery({ category, requestId });
  const headingReference = useRef<HTMLHeadingElement>(null);
  const announcementReference = useRef<HTMLOutputElement>(null);
  const announcedKeyReference = useRef<string | null>(null);
  // A blocked result and the same-prompt error both open the panel; the error
  // path has no request id, so the code stands in as the focus key.
  const focusKey = requestId ?? recovery.category ?? "moderation";

  useEffect(() => {
    headingReference.current?.focus();
  }, [focusKey]);

  useEffect(() => {
    const region = announcementReference.current;
    if (!region || announcedKeyReference.current === focusKey) {
      return () => {
        // Nothing was announced, so there is nothing to clean up.
      };
    }
    announcedKeyReference.current = focusKey;

    if (region.textContent === recovery.reason) {
      // Identical text produces no DOM change, so clear it for one frame.
      region.textContent = "";
      const frame = window.requestAnimationFrame(() => {
        region.textContent = recovery.reason;
      });
      return () => window.cancelAnimationFrame(frame);
    }

    region.textContent = recovery.reason;
    return () => {
      // The announcement stays in place until the next blocked request.
    };
  }, [focusKey, recovery.reason]);

  return (
    <section
      id="blocked-generation"
      className="moderation-recovery"
      aria-labelledby="blocked-generation-heading"
    >
      <output
        className="sr-only"
        id="blocked-generation-announcement"
        aria-live="polite"
        aria-atomic="true"
        ref={announcementReference}
      />
      <h2 id="blocked-generation-heading" tabIndex={-1} ref={headingReference}>
        {recovery.title}
      </h2>
      <p id="blocked-generation-reason">{recovery.reason}</p>

      {objective.trim() ? (
        <blockquote
          id="blocked-generation-objective"
          className="moderation-recovery__objective"
        >
          {objective}
        </blockquote>
      ) : null}

      {hasEarlierDraft ? (
        <p className="moderation-recovery__draft-note">
          Your earlier draft is unchanged.
        </p>
      ) : null}

      {recovery.requestReference || recovery.categoryReference ? (
        <p id="blocked-generation-reference">
          {recovery.requestReference} {recovery.categoryReference}
        </p>
      ) : null}

      <div className="moderation-recovery__action">
        <Button type="button" id="revise-request" onClick={onRevise}>
          {recovery.actionLabel}
        </Button>
      </div>
    </section>
  );
};
