import { useCallback, useEffect, useRef, useState } from "react";

import { fetchAuthChallenge } from "./auth-client";
import { useAuthNotice } from "./use-auth-notice";

import type { AuthNotice } from "./auth-status";
import type { AuthNoticeState } from "./use-auth-notice";

export interface AuthChallengeOptions {
  /**
  False while a child route owns the pending credential.
  */
  readonly enabled?: boolean;
  /**
  Copy for a sign-in form whose challenge could not be started.
  */
  readonly unavailableNotice: Omit<AuthNotice, "actionLabel" | "onAction">;
}

export interface AuthChallengeState extends AuthNoticeState {
  readonly csrf: string | null;
  readonly unavailable: boolean;
}

/**
 * Mint the pre-auth challenge a sign-in or sign-up form must echo, and turn a failure into a retryable notice. Both forms behave identically here, so the pending state, the retry action, and the load-once rule live in one place.
 */
export const useAuthChallenge = (
  options: AuthChallengeOptions
): AuthChallengeState => {
  const enabled = options.enabled ?? true;
  const { notice, statusReference, announce } = useAuthNotice();
  const [csrf, setCsrf] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const loadReference = useRef<(() => Promise<void>) | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setUnavailable(false);
    const result = await fetchAuthChallenge();
    if (result.ok) {
      setCsrf(result.data.csrf);
      return;
    }

    setCsrf(null);
    setUnavailable(true);
    announce({
      ...options.unavailableNotice,
      actionLabel: "Try again",
      onAction: () => {
        void loadReference.current?.();
      },
    });
  }, [announce, options.unavailableNotice]);

  useEffect(() => {
    loadReference.current = load;
  }, [load]);

  // The loader is stable, so this re-fetches only when the route changes. It is
  // invoked through the ref to keep the effect a subscription rather than a
  // synchronous state write.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    void loadReference.current?.();
  }, [enabled]);

  return {
    notice,
    statusReference,
    announce,
    csrf,
    unavailable,
  };
};
