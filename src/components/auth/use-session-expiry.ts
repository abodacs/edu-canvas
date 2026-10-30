import { useCallback, useEffect, useState } from "react";

import { renewSession } from "./auth-client";

// The warning appears this long before the server-provided idle deadline.
export const SESSION_WARNING_LEAD_MS = 120_000;

interface SessionExpiryOptions {
  readonly idleExpiresAt: string | null;
  readonly absoluteExpiresAt: string | null;
  readonly csrf: string | null;
  readonly isActive: boolean;
  readonly onExpired: () => void;
  readonly onRenewed: (
    idleExpiresAt: string,
    absoluteExpiresAt: string
  ) => void;
}

export interface SessionExpiryState {
  readonly isWarningVisible: boolean;
  readonly isContinuing: boolean;
  readonly continueError: string | null;
  readonly continueSession: () => void;
  readonly dismissWarning: () => void;
}

const deadlineFor = (
  idleExpiresAt: string,
  absoluteExpiresAt: string
): number => Math.min(Date.parse(idleExpiresAt), Date.parse(absoluteExpiresAt));

const noCleanup = (): void => {
  // Nothing was scheduled, so there is nothing to release.
};

// Drives the idle warning from the server's own deadline: one timer that shows
// the banner 120 seconds early and one that expires the session exactly on
// time. Only the explicit Continue action renews; nothing here counts down in a
// live region, so the warning announces once.
export const useSessionExpiry = ({
  idleExpiresAt,
  absoluteExpiresAt,
  csrf,
  isActive,
  onExpired,
  onRenewed,
}: SessionExpiryOptions): SessionExpiryState => {
  const [isWarningVisible, setIsWarningVisible] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);

  const hasDeadline =
    idleExpiresAt !== null && absoluteExpiresAt !== null && isActive;

  useEffect(() => {
    if (!hasDeadline || idleExpiresAt === null || absoluteExpiresAt === null) {
      setIsWarningVisible(false);
      return noCleanup;
    }

    const delay = Math.max(
      0,
      deadlineFor(idleExpiresAt, absoluteExpiresAt) -
        Date.now() -
        SESSION_WARNING_LEAD_MS
    );
    if (delay === 0) {
      setIsWarningVisible(true);
      return noCleanup;
    }

    const timer = window.setTimeout(() => {
      setIsWarningVisible(true);
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [absoluteExpiresAt, hasDeadline, idleExpiresAt]);

  useEffect(() => {
    if (!hasDeadline || idleExpiresAt === null || absoluteExpiresAt === null) {
      return noCleanup;
    }

    const delay = Math.max(
      0,
      deadlineFor(idleExpiresAt, absoluteExpiresAt) - Date.now()
    );
    const timer = window.setTimeout(onExpired, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [absoluteExpiresAt, hasDeadline, idleExpiresAt, onExpired]);

  const continueSession = useCallback((): void => {
    if (csrf === null || isContinuing) {
      return;
    }
    setIsContinuing(true);
    setContinueError(null);
    void (async () => {
      const result = await renewSession(csrf);
      setIsContinuing(false);

      if (result.ok) {
        setIsWarningVisible(false);
        onRenewed(result.data.idleExpiresAt, result.data.absoluteExpiresAt);
        return;
      }

      if (result.error.code === "UNAUTHENTICATED") {
        onExpired();
        return;
      }

      setContinueError(
        result.error.code === "RATE_LIMITED"
          ? "Too many attempts. Wait a moment, then choose Continue again."
          : "We could not extend this session. Try Continue again, or sign in again."
      );
    })();
  }, [csrf, isContinuing, onExpired, onRenewed]);

  const dismissWarning = useCallback((): void => {
    setIsWarningVisible(false);
  }, []);

  return {
    isWarningVisible: hasDeadline && isWarningVisible,
    isContinuing,
    continueError,
    continueSession,
    dismissWarning,
  };
};
