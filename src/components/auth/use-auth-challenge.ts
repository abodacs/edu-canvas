import { useCallback, useEffect, useRef, useState } from "react";

import { fetchAuthChallenge } from "./auth-client";
import { useAuthNotice } from "./use-auth-notice";

import type { AuthNotice } from "./auth-status";
import type { AuthNoticeState } from "./use-auth-notice";

export interface AuthChallengeOptions {
  readonly enabled?: boolean;
  readonly unavailableNotice: Omit<AuthNotice, "actionLabel" | "onAction">;
}

export interface AuthChallengeState extends AuthNoticeState {
  readonly csrf: string | null;
  readonly unavailable: boolean;
}

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
      announce(null);
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
