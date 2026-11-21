import { useCallback, useEffect, useRef, useState } from "react";

import type { AuthNotice } from "./auth-status";
import type { RefObject } from "react";

export interface AuthNoticeState {
  readonly notice: AuthNotice | null;
  readonly statusReference: RefObject<HTMLDivElement | null>;
  readonly announce: (notice: AuthNotice | null) => void;
}

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

export const useFocusAfterRender = (): {
  readonly focusAfterRender: (target: RefObject<HTMLElement | null>) => void;
} => {
  const pending = useRef<RefObject<HTMLElement | null> | null>(null);
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
