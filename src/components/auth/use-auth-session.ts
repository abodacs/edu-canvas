import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearPendingMembershipHandoff,
  endSession,
  fetchSession,
  publishAuthSignal,
  subscribeToAuthSignals,
} from "./auth-client";

import type { ActiveSessionProjection } from "./auth-client";

export type AuthPhase =
  "loading" | "active" | "unauthenticated" | "unavailable";

export interface AuthSessionState {
  readonly phase: AuthPhase;
  readonly projection: ActiveSessionProjection | null;
  readonly csrf: string | null;
  readonly generation: string | null;
  /**
  True while the server is re-confirming the session; private UI stays hidden.
  */
  readonly isRevalidating: boolean;
  readonly wasExpired: boolean;
  readonly isSigningOut: boolean;
  readonly applyRenewal: (
    idleExpiresAt: string,
    absoluteExpiresAt: string
  ) => void;
  readonly markExpired: () => void;
  readonly revalidate: () => void;
  /**
  Resolves true only when revocation was confirmed or was never needed.
  */
  readonly signOut: () => Promise<boolean>;
}

/**
 * Owns the authenticated session for one tab. Every read goes through
 * `GET /api/auth/session`, which never renews idle time, so polling, refreshes,
 * visibility returns, and reconnects all leave the server deadline untouched.
 * A monotonic epoch drops late responses from a superseded request, and a broadcast hides private content in every tab on sign-out or expiry.
 */
export const useAuthSession = (): AuthSessionState => {
  const [phase, setPhase] = useState<AuthPhase>("loading");
  const [projection, setProjection] = useState<ActiveSessionProjection | null>(
    null
  );
  const [csrf, setCsrf] = useState<string | null>(null);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [wasExpired, setWasExpired] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const epoch = useRef(0);
  const generationReference = useRef<string | null>(null);
  const hadSession = useRef(false);

  generationReference.current = projection?.session.generation ?? null;

  const clear = useCallback((isExpired: boolean): void => {
    epoch.current += 1;
    setProjection(null);
    setCsrf(null);
    setIsRevalidating(false);
    setIsSigningOut(false);
    setWasExpired(isExpired);
    setPhase("unauthenticated");
  }, []);

  const load = useCallback(async (): Promise<void> => {
    const requestEpoch = epoch.current + 1;
    epoch.current = requestEpoch;
    setIsRevalidating(true);

    const result = await fetchSession();

    if (epoch.current !== requestEpoch) {
      // A newer request already resolved; this late response is discarded.
      return;
    }

    if (result.ok) {
      hadSession.current = true;
      setProjection(result.data.projection);
      setCsrf(result.data.csrf);
      setWasExpired(false);
      setIsRevalidating(false);
      setPhase("active");
      return;
    }

    if (
      result.error.code === "UNAUTHENTICATED" ||
      result.error.code === "FORBIDDEN"
    ) {
      // A never-signed-in visitor is not an expired one: only a session that
      // previously loaded and then vanished counts as an expiry.
      clear(hadSession.current);
      return;
    }

    setIsRevalidating(false);
    setPhase("unavailable");
  }, [clear]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeToAuthSignals((message) => {
      clear(message.type === "expired");
    });
  }, [clear]);

  useEffect(() => {
    const handleVisibility = (): void => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };
    const handleOnline = (): void => {
      void load();
    };
    const handlePageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) {
        void load();
      }
    };
    const handlePopState = (): void => {
      void load();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [load]);

  const applyRenewal = useCallback(
    (idleExpiresAt: string, absoluteExpiresAt: string): void => {
      setProjection((current) => {
        return current
          ? {
              ...current,
              session: {
                ...current.session,
                idleExpiresAt,
                absoluteExpiresAt,
              },
            }
          : current;
      });
    },
    []
  );

  const markExpired = useCallback((): void => {
    publishAuthSignal({
      type: "expired",
      generation: generationReference.current,
    });
    clear(true);
  }, [clear]);

  const signOut = useCallback(async (): Promise<boolean> => {
    const generation = generationReference.current;
    publishAuthSignal({ type: "signed-out", generation });
    setIsSigningOut(true);
    clearPendingMembershipHandoff();

    const result = csrf ? await endSession(csrf) : { ok: true as const };
    if (result.ok) {
      clear(false);
      return true;
    }

    // The credential is HttpOnly, so only a server response can clear it. Re-read
    // the truth instead of showing a signed-out page over a live session.
    setIsSigningOut(false);
    await load();
    return false;
  }, [clear, csrf, load]);

  const revalidate = useCallback((): void => {
    void load();
  }, [load]);

  return {
    phase,
    projection,
    csrf,
    generation: projection?.session.generation ?? null,
    isRevalidating,
    wasExpired,
    isSigningOut,
    applyRenewal,
    markExpired,
    revalidate,
    signOut,
  };
};
