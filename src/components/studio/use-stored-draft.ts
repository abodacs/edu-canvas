import { useCallback, useEffect, useRef, useState } from "react";

import { readStoredDraft } from "@/lib/stored-draft-client";

import type { StoredDraftRead } from "@/lib/stored-draft-client";
import type { StoredGenerationResult } from "@/shared/generation-contract";

export interface StoredDraftHandlers {
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
    case "unavailable": {
      handlers().onUnavailable(outcome.message);
      break;
    }
    default: {
      handlers().onUnavailable("");
    }
  }
};

export const useStoredDraft = (
  draftRequestId: string | undefined,
  handlers: StoredDraftHandlers
): { readonly isOpening: boolean; readonly reload: () => void } => {
  const [isOpening, setIsOpening] = useState(draftRequestId !== undefined);
  const [readCount, setReadCount] = useState(0);
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
