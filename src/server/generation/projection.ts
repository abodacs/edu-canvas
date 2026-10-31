import { publicGenerationResultSchema } from "@/shared/generation-contract";
import { toPublicDiagnosticsPayload } from "./public-diagnostics";
import type { PublicGenerationResult } from "@/shared/generation-contract";

import type { LessonGenerationRecord } from "./types";

const publicDraft = (record: LessonGenerationRecord) => {
  if (!record.draft) {
    return null;
  }

  return {
    requestId: record.requestId,
    prompt: record.input.prompt,
    grade: record.input.grade,
    standardId: record.input.standardId,
    language: record.input.language,
    difficulty: record.input.difficulty,
    variants: record.draft.variants.map((variant) => {
      return {
        id: variant.id,
        kind: variant.kind,
        title: variant.title,
        instructions: variant.instructions,
        sourceItems: variant.sourceItems,
        targetItems: variant.targetItems,
        distractorItems: variant.distractorItems,
        hints: variant.hints,
        feedback: variant.feedback,
        languageMetadata: variant.languageMetadata,
        accessibilityMetadata: variant.accessibilityMetadata,
      };
    }),
  };
};

const retryForState = (record: LessonGenerationRecord) => {
  if (
    record.state === "failed-retryable" ||
    record.state === "blocked-by-validation"
  ) {
    return {
      available: true,
      message: "Review the diagnostics, then try this draft again.",
    };
  }

  if (record.state === "blocked-by-moderation") {
    return {
      available: false,
      message: "Revise the request before starting a new draft.",
    };
  }

  return {
    available: false,
    message: "This generation attempt does not need a retry.",
  };
};

export const toPublicGenerationResult = (
  record: LessonGenerationRecord
): PublicGenerationResult => {
  const publicDiagnostics = toPublicDiagnosticsPayload(record.diagnostics);

  return publicGenerationResultSchema.parse({
    requestId: record.requestId,
    state: record.state,
    attempt: Math.max(record.attempt, 1),
    diagnostics: publicDiagnostics.diagnostics,
    diagnosticsRollup: publicDiagnostics.rollup,
    draft: publicDraft(record),
    provenance: record.provenance ?? null,
    retry: retryForState(record),
  });
};
