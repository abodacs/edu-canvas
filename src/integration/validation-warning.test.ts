import { describe, expect, it } from "vitest";

import { compileRawLessonPreview } from "@/server/a2ui/compiler";
import { createDeterministicLessonDraftProvider } from "@/server/generation/provider";
import { createGenerationService } from "@/server/generation/service";
import { parseTenantId } from "@/server/identity/identifiers";
import { syntheticTeacherActor } from "@/server/identity/test-actors";
import { createSeededPersistence } from "@/server/persistence/seeded";
import { assertShareable } from "@/server/safety/artifact-enforcement";
import { syntheticSeed } from "@/server/seed-data";

import type { SemanticValidationReport } from "@/server/generation/semantic-validation-contract";

const teacherActor = syntheticTeacherActor({
  tenantId: parseTenantId(syntheticSeed.tenant.id),
});

const warningReport: SemanticValidationReport = {
  status: "complete",
  verdict: "warning",
  recovery: "edit",
  reviews: [],
  findings: [
    {
      validator: "learning-quality",
      validatorVersion: "validation-diagnostics-fixture-v1",
      verdict: "warning",
      code: "CONTENT_TOO_LONG",
      field: "instructions",
      variantId: "variant-1",
      reason: "The instructions are longer than the advisory limit.",
      recovery: "edit",
    },
  ],
  retry: { available: false, message: "No retry needed." },
};

const generateWarningOnly = () => {
  return createGenerationService({
    persistence: createSeededPersistence(),
    provider: createDeterministicLessonDraftProvider(),
    semanticValidation: () => Promise.resolve(warningReport),
  }).generate({
    actor: teacherActor,
    input: {
      prompt: "equivalent fractions for grade 4",
      grade: 4,
      standardId: syntheticSeed.standard.id,
      language: "en",
      difficulty: "on-level",
      idempotencyKey: "validation-warning-fixture",
    },
  });
};

describe("warning-only validation result", () => {
  it("stays ready for review and keeps its warnings visible", async () => {
    const { record, publicResult } = await generateWarningOnly();

    expect({
      recordState: record.state,
      gateVerdict: record.gate?.verdict,
      publicState: publicResult.state,
      variants: publicResult.draft?.variants.length,
    }).toStrictEqual({
      recordState: "ready-for-review",
      gateVerdict: "warning",
      publicState: "ready-for-review",
      variants: 4,
    });
    expect(publicResult.diagnosticsRollup).toMatchObject({
      verdict: "warning",
      affectedScreens: ["variant-1"],
    });
    expect(publicResult.diagnostics).toStrictEqual([
      expect.objectContaining({
        code: "CONTENT_TOO_LONG",
        variantId: "variant-1",
        recovery: "edit",
      }),
    ]);
  });

  it("keeps preview and Share available", async () => {
    const { record } = await generateWarningOnly();
    const { draft } = record;

    if (!draft) {
      throw new Error("A warning-only record must keep its draft.");
    }

    const preview = compileRawLessonPreview({
      requestId: record.requestId,
      grade: record.input.grade,
      standardId: record.input.standardId,
      language: record.input.language,
      draft,
      learningPath: draft.learningPath,
    });
    const artifact = assertShareable(record);

    expect(preview.messages.length).toBeGreaterThan(0);
    expect(artifact.kind).toBe("lesson");
  });
});
