import { useCallback, useEffect, useRef, useState } from "react";

import type { AuthNotice } from "./auth-status";
import type { RefObject } from "react";

export interface AuthNoticeState {
  readonly notice: AuthNotice | null;
  readonly statusReference: RefObject<HTMLDivElement | null>;
  /**
  Show an outcome and move focus to it. `null` clears without moving focus.
  */
  readonly announce: (notice: AuthNotice | null) => void;
}

/**
 * One announcement contract for an authentication surface: the outcome, its stable host, and the rule that a new outcome takes focus. Every auth page needs exactly this, and the focus rule is easy to get subtly wrong per page.
 */
export const useAuthNotice = (): AuthNoticeState => {
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const statusReference = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);

  const announce = useCallback((next: AuthNotice | null): void => {
    focusPending.current = next !== null;
    setNotice(next);
  }, []);

  useEffect(() => {
    if (!(notice && focusPending.current)) {
      return;
    }

    focusPending.current = false;
    statusReference.current?.focus();
  }, [notice]);

  return { notice, statusReference, announce };
};

/**
 * Focus a form control after the commit that revealed its error. The effect
 * waits for React to mark the control invalid and attach its error text, so a
 * screen reader reads the state that is already on screen. Nothing is focused
 * on mount; only a submit names a target.
 */
export const useFocusAfterRender = (): {
  readonly focusAfterRender: (target: RefObject<HTMLElement | null>) => void;
} => {
  const pending = useRef<RefObject<HTMLElement | null> | null>(null);
  // A repeated submit can leave the error text unchanged, so the caller's
  // state update alone may bail out and never commit. The request counter
  // guarantees the render that carries the focus move.
  const [request, setRequest] = useState(0);

  useEffect(() => {
    const target = pending.current;
    pending.current = null;
    target?.current?.focus();
  }, [request]);

  const focusAfterRender = useCallback(
    (target: RefObject<HTMLElement | null>): void => {
      pending.current = target;
      setRequest((previous) => previous + 1);
    },
    []
  );

  return { focusAfterRender };
};
