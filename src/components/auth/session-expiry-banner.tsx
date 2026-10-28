import { Clock } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

import type { ReactElement, Ref } from "react";

const TITLE_ID = "session-expiry-title";
const DESCRIPTION_ID = "session-expiry-description";

interface SessionExpiryBannerProperties {
  readonly bannerRef?: Ref<HTMLDivElement>;
  readonly isContinuing: boolean;
  readonly error: string | null;
  readonly onContinue: () => void;
  readonly onDismiss: () => void;
}

// A persistent, labelled alert dialog that warns about idle expiry and offers
// the only action that renews the session. It carries no ticking countdown, so
// it announces once: the caller moves focus into it when it opens, and Escape
// hands focus back to the work.
export const SessionExpiryBanner = ({
  bannerRef,
  isContinuing,
  error,
  onContinue,
  onDismiss,
}: SessionExpiryBannerProperties): ReactElement => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      onDismiss();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss]);

  return (
    <div
      ref={bannerRef}
      className="session-banner"
      aria-modal="false"
      aria-labelledby={TITLE_ID}
      aria-describedby={DESCRIPTION_ID}
      // The expiry-warning contract requires alertdialog semantics; a native
      // <dialog> announces as role="dialog" and would lose them.
      // eslint-disable-next-line react-doctor/prefer-html-dialog -- role="alertdialog" is required here.
      role="alertdialog"
      tabIndex={-1}
    >
      <span className="session-banner__icon" aria-hidden="true">
        <Clock />
      </span>
      <div className="session-banner__copy">
        <strong id={TITLE_ID}>Your session will end soon</strong>
        <p id={DESCRIPTION_ID}>
          You have been inactive for a while. Private drafts stay hidden until
          the session is renewed, and anything unsent is cleared when it ends.
        </p>
        {error ? (
          <p className="session-banner__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="session-banner__actions">
        <Button
          type="button"
          size="sm"
          className="session-banner__continue"
          disabled={isContinuing}
          onClick={onContinue}
        >
          {isContinuing ? "Continuing…" : "Continue"}
        </Button>
      </div>
    </div>
  );
};
