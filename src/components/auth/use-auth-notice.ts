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
