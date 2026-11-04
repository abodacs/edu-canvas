import { useCallback, useEffect, useRef, useState } from "react";

import { readStoredDraft } from "@/lib/stored-draft-client";

import type { StoredDraftRead } from "@/lib/stored-draft-client";
import type { StoredGenerationResult } from "@/shared/generation-contract";

export interface StoredDraftHandlers {
  /** A draft link starts loading: drop whatever the previous read showed. */
  readonly onReset: () => void;
  readonly onDraft: (stored: StoredGenerationResult) => void;
  readonly onUnauthorized: () => void;
  readonly onUnavailable: (message: string) => void;
}

interface StoredDraftLoad {
  readonly requestId: string | undefined;
  readonly read: (
    requestId: string,
    signal: AbortSignal
  ) => Promise<StoredDraftRead>;
  readonly signal: AbortSignal;
  readonly setOpening: (isOpening: boolean) => void;
  readonly handlers: () => StoredDraftHandlers;
}

/**
One load of one draft link, free of React so its ordering is testable. The
opening flag follows the link: it is set when a link starts loading and
cleared when there is no link, so it never sticks after the link goes away
mid-read. An aborted read (a newer link, an unmount) changes nothing.
*/
export const loadStoredDraft = async ({
  requestId,
  read,
  signal,
  setOpening,
  handlers,
}: StoredDraftLoad): Promise<void> => {
  setOpening(requestId !== undefined);
  if (requestId === undefined) {
    return;
  }
  handlers().onReset();
  const outcome = await read(requestId, signal);
  if (signal.aborted) {
    return;
  }
  setOpening(false);
  switch (outcome.kind) {
    case "draft": {
      handlers().onDraft(outcome.stored);
      break;
    }
    case "unauthorized": {
      handlers().onUnauthorized();
      break;
    }
    default: {
      handlers().onUnavailable(outcome.message);
    }
  }
};

/**
Opens a persisted draft once per draft link (`/workspace?draft=<id>`). The
caller routes the result through the same outcome branch a fresh generation
takes, so a blocked draft shows its diagnostics or moderation panel exactly as
it did when it was generated. `reload` reads the same link again on request;
nothing polls.
*/
export const useStoredDraft = (
  draftRequestId: string | undefined,
  handlers: StoredDraftHandlers
): { readonly isOpening: boolean; readonly reload: () => void } => {
  const [isOpening, setIsOpening] = useState(draftRequestId !== undefined);
  const [readCount, setReadCount] = useState(0);
  // Callers pass fresh callbacks each render; the read must run once per
  // link, so it reads the latest handlers through a ref.
  const handlersReference = useRef(handlers);
  useEffect(() => {
    handlersReference.current = handlers;
  });

  useEffect(() => {
    const controller = new AbortController();
    void loadStoredDraft({
      requestId: draftRequestId,
      read: readStoredDraft,
      signal: controller.signal,
      setOpening: setIsOpening,
      handlers: () => handlersReference.current,
    });
    return () => {
      controller.abort();
    };
  }, [draftRequestId, readCount]);

  const reload = useCallback(() => {
    setReadCount((count) => count + 1);
  }, []);

  return { isOpening, reload };
};
