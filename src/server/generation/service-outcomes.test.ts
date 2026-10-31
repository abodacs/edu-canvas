import { describe, expect, it } from "vitest";

import { demoSeed } from "@/server/seed-data";
import { parseTenantId } from "@/server/identity/identifiers";
import { syntheticTeacherActor } from "@/server/identity/test-actors";

import { createSeededPersistence } from "../persistence/seeded";
import {
  allowedSafetyResult,
  blockedSafetyResult,
} from "../moderation/content-safety";
import {
  createDeterministicLessonDraftProvider,
  createEquivalentFractionsDraft,
} from "./provider";
import { createGenerationService } from "./service";
import { createDemoCurriculumContext } from "./semantic-validation";

const teacherActor = syntheticTeacherActor({
  tenantId: parseTenantId(demoSeed.tenant.id),
});

const input = {
  prompt: "equivalent fractions for grade 4",
  grade: 4,
  standardId: demoSeed.standard.id,
  language: "en" as const,
  difficulty: "on-level" as const,
  idempotencyKey: "outcome-request",
};

describe("generation attempt outcomes", () => {
  it("retains correction diagnostics in history when corrected output is moderated", async () => {
    const persistence = createSeededPersistence();
    const provider =
      createDeterministicLessonDraftProvider("invalid-then-valid");
    const service = createGenerationService({
      persistence,
      provider,
      safety: {
        checkPrompt: () => allowedSafetyResult(),
        checkGeneratedContent: () => {
          return provider.calls === 1
            ? allowedSafetyResult()
            : blockedSafetyResult("harmful-content");
        },
        checkSourceText: () => allowedSafetyResult(),
      },
    });

    const { record, publicResult } = await service.generate({
      actor: teacherActor,
      input,
    });

    expect(record).toMatchObject({
      state: "blocked-by-moderation",
      diagnostics: [expect.objectContaining({ code: "MODERATION_BLOCKED" })],
    });
    expect(record.attempts[0]).toMatchObject({
      state: "blocked-by-moderation",
      correctionAttempted: true,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "UNKNOWN_TARGET" }),
        expect.objectContaining({ code: "MODERATION_BLOCKED" }),
      ]),
    });
    expect(publicResult).toMatchObject({
      draft: null,
      retry: { available: false },
    });
    expect(provider.calls).toBe(2);
    await expect(
      persistence.readGeneration(record.tenantId, record.requestId)
    ).resolves.toStrictEqual(record);
  });

  it("retains both invalid responses in attempt history after one correction", async () => {
    const provider = createDeterministicLessonDraftProvider(
      "invalid-then-invalid"
    );
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
    });

    const { record } = await service.generate({
      actor: teacherActor,
      input,
    });

    expect(record.state).toBe("blocked-by-validation");
    expect(record.attempts[0]?.diagnostics).toStrictEqual([
      ...record.diagnostics,
      ...record.diagnostics,
    ]);
    expect(record.attempts[0]?.correctionAttempted).toBeTruthy();
    expect(provider.calls).toBe(2);
  });

  it.each([false, true])(
    "keeps semantic exceptions retryable after correction=%s",
    async (corrected) => {
      const persistence = createSeededPersistence();
      const provider = createDeterministicLessonDraftProvider(
        corrected ? "invalid-then-valid" : "valid"
      );
      const service = createGenerationService({
        persistence,
        provider,
        semanticValidation: () => {
          throw new Error("Private validator failure details");
        },
      });

      const { record, publicResult } = await service.generate({
        actor: teacherActor,
        input,
      });

      expect(record).toMatchObject({
        state: "failed-retryable",
        draft: null,
        diagnostics: [
          expect.objectContaining({
            code: "SEMANTIC_VALIDATION_UNAVAILABLE",
            validatorVersion: "semantic-validation-runner-v1",
          }),
        ],
      });
      expect(record.attempts[0]).toMatchObject({
        state: "failed-retryable",
        correctionAttempted: corrected,
        diagnostics: record.diagnostics,
      });
      expect(publicResult.retry.available).toBeTruthy();
      expect(JSON.stringify(publicResult)).not.toContain("Private validator");
      await expect(
        persistence.readGeneration(record.tenantId, record.requestId)
      ).resolves.toStrictEqual(record);
    }
  );

  it("blocks a curriculum context that does not match the request before semantic review", async () => {
    let isReviewed = false;
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider: createDeterministicLessonDraftProvider(),
      curriculumContext: (request) => {
        return {
          ...createDemoCurriculumContext(request),
          grade: request.grade + 1,
        };
      },
      semanticValidation: () => {
        isReviewed = true;
        throw new Error("Unexpected semantic review");
      },
    });

    const { record } = await service.generate({
      actor: teacherActor,
      input,
    });

    expect(record.state).toBe("blocked-by-validation");
    expect(record.diagnostics).toStrictEqual([
      expect.objectContaining({ code: "CURRICULUM_CONTEXT_MISMATCH" }),
    ]);
    expect(isReviewed).toBeFalsy();
  });

  it("blocks a path that cannot be accepted even when semantic review passes", async () => {
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider: {
        provenance: createDeterministicLessonDraftProvider().provenance,
        generate(request) {
          const draft = createEquivalentFractionsDraft(request);
          if (draft.learningPath) {
            draft.learningPath.steps[0].screenPurposeId = "unapproved-purpose";
          }
          return Promise.resolve({ draft });
        },
      },
      semanticValidation: () => {
        return Promise.resolve({
          status: "complete",
          verdict: "pass",
          recovery: null,
          reviews: [],
          findings: [],
          retry: { available: false, message: "No retry needed." },
        });
      },
    });

    const { record, publicResult } = await service.generate({
      actor: teacherActor,
      input,
    });

    expect(record.state).toBe("blocked-by-validation");
    expect(record.diagnostics).toStrictEqual([
      expect.objectContaining({ code: "LEARNING_PATH_BLOCKED" }),
    ]);
    expect(publicResult.draft).toBeNull();
  });
});
