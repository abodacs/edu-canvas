import { useEffect, useRef, useState } from "react";

import { readStoredDraft } from "@/lib/stored-draft-client";

import type { StoredGenerationResult } from "@/shared/generation-contract";

interface StoredDraftHandlers {
  readonly onDraft: (stored: StoredGenerationResult) => void;
  readonly onUnauthorized: () => void;
  readonly onUnavailable: (message: string) => void;
}

/**
Opens a persisted draft once per draft link (`/workspace?draft=<id>`). The
caller routes the result through the same outcome branch a fresh generation
takes, so a blocked draft shows its diagnostics or moderation panel exactly as
it did when it was generated. Returns whether the read is still in flight.
*/
export const useStoredDraft = (
  draftRequestId: string | undefined,
  handlers: StoredDraftHandlers
): boolean => {
  const [isOpening, setIsOpening] = useState(draftRequestId !== undefined);
  // Callers pass fresh callbacks each render; the read must run once per
  // link, so it reads the latest handlers through a ref.
  const handlersReference = useRef(handlers);
  useEffect(() => {
    handlersReference.current = handlers;
  });

  useEffect(() => {
    if (draftRequestId === undefined) {
      return () => {
        // No draft link, nothing to read.
      };
    }
    const controller = new AbortController();
    const open = async (): Promise<void> => {
      const read = await readStoredDraft(draftRequestId, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      setIsOpening(false);
      switch (read.kind) {
        case "draft": {
          handlersReference.current.onDraft(read.stored);
          break;
        }
        case "unauthorized": {
          handlersReference.current.onUnauthorized();
          break;
        }
        default: {
          handlersReference.current.onUnavailable(read.message);
        }
      }
    };
    void open();
    return () => {
      controller.abort();
    };
  }, [draftRequestId]);

  return isOpening;
};
