import { readResponseJson } from "@/lib/http";
import { storedGenerationResultSchema } from "@/shared/generation-contract";

import type { StoredGenerationResult } from "@/shared/generation-contract";

/**
The teacher-visible copy when a draft link cannot be opened. The server answers
a missing draft and another teacher's draft identically, so the copy never
claims which one it was.
*/
export const STORED_DRAFT_UNAVAILABLE_MESSAGE =
  "This draft is not available. Start a new lesson, or open a draft from your own workspace.";

export type StoredDraftRead =
  | { readonly kind: "draft"; readonly stored: StoredGenerationResult }
  | { readonly kind: "unauthorized" }
  | { readonly kind: "unavailable"; readonly message: string };

const unavailable: StoredDraftRead = {
  kind: "unavailable",
  message: STORED_DRAFT_UNAVAILABLE_MESSAGE,
};

/**
GET /api/lessons/:draftId for the signed-in teacher. Every failure resolves to
one of three outcomes so the composer never handles transport detail.
*/
export const readStoredDraft = async (
  requestId: string,
  signal?: AbortSignal
): Promise<StoredDraftRead> => {
  let response: Response;
  try {
    response = await fetch(`/api/lessons/${encodeURIComponent(requestId)}`, {
      headers: { accept: "application/json" },
      signal,
    });
  } catch {
    return unavailable;
  }
  if (response.status === 401) {
    return { kind: "unauthorized" };
  }
  if (!response.ok) {
    return unavailable;
  }
  const parsed = storedGenerationResultSchema.safeParse(
    await readResponseJson(response)
  );
  return parsed.success ? { kind: "draft", stored: parsed.data } : unavailable;
};
