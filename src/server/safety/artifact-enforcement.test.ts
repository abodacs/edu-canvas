import { describe, expect, it } from "vitest";

import { parseTenantId } from "@/server/identity/identifiers";
import { syntheticTeacherActor } from "@/server/identity/test-actors";
import { createSeededPersistence } from "@/server/persistence/seeded";
import { syntheticSeed } from "@/server/seed-data";

import {
  createDeterministicLessonDraftProvider,
  createEquivalentFractionsDraft,
} from "../generation/provider";
import { reviewDraftForAcceptance } from "../generation/draft-acceptance";
import { createGenerationService } from "../generation/service";
import {
  ArtifactShareRejectedError,
  assertShareable,
  deriveStoredArtifactGate,
  gateStoredArtifact,
} from "./artifact-enforcement";
import {
  artifactGatePolicyVersion,
  snapshotArtifactGateResult,
} from "./artifact-gate";
import type {
  LessonGenerationRecord,
  ProviderLessonDraft,
  ProviderProvenance,
} from "../generation/types";
import type { SemanticValidationReport } from "../generation/semantic-validation-contract";

import type { RenderableArtifact } from "./artifact-gate";

const validInput = {
  prompt: "equivalent fractions for grade 4",
  grade: 4,
  standardId: syntheticSeed.standard.id,
  language: "en" as const,
  difficulty: "on-level" as const,
};

const teacherActor = syntheticTeacherActor({
  tenantId: parseTenantId(syntheticSeed.tenant.id),
});

const fixtureProvenance: ProviderProvenance = {
  provider: "artifact-enforcement-fixture",
  model: "fixture-model",
  promptTemplateVersion: "fixture-template-v1",
  validatorVersion: "lesson-validator-v2",
};

const passingReport: SemanticValidationReport = {
  status: "complete",
  verdict: "pass",
  recovery: null,
  reviews: [],
  findings: [],
  retry: { available: false, message: "No retry needed." },
};

const warningReport: SemanticValidationReport = {
  ...passingReport,
  verdict: "warning",
  recovery: "edit",
  findings: [
    {
      validator: "learning-quality",
      validatorVersion: "artifact-enforcement-fixture-v1",
      verdict: "warning",
      code: "CONTENT_TOO_LONG",
      field: "instructions",
      reason: "The instructions are longer than the advisory limit.",
      recovery: "edit",
    },
  ],
};

const blockedReport: SemanticValidationReport = {
  ...passingReport,
  verdict: "hard_block",
  recovery: "edit",
  findings: [
    {
      validator: "curriculum",
      validatorVersion: "artifact-enforcement-fixture-v1",
      verdict: "hard_block",
      code: "ANSWER_MISMATCH",
      field: "relationships",
      reason: "A relationship does not match the expected answer.",
      recovery: "edit",
    },
  ],
};

const acceptanceDraft = (): ProviderLessonDraft =>
  createEquivalentFractionsDraft(validInput);

const review = (
  draft: ProviderLessonDraft,
  options: {
    report?: SemanticValidationReport;
    structuralDiagnostics?: Parameters<
      typeof reviewDraftForAcceptance
    >[0]["structuralDiagnostics"];
    artifactGate?: Parameters<
      typeof reviewDraftForAcceptance
    >[1]["artifactGate"];
  } = {}
) => {
  return reviewDraftForAcceptance(
    {
      draft,
      input: validInput,
      tenantId: syntheticSeed.tenant.id,
      requestId: "draft_req_artifact_enforcement",
      provenance: fixtureProvenance,
      structuralDiagnostics: options.structuralDiagnostics ?? [],
      graphVersion: syntheticSeed.activityVersion.graphVersion,
    },
    {
      semanticValidation: () =>
        Promise.resolve(options.report ?? passingReport),
      ...(options.artifactGate && { artifactGate: options.artifactGate }),
    }
  );
};

const acceptsRenderable = (artifact: RenderableArtifact): string =>
  artifact.artifactHash;

const captureShareRejection = (record: LessonGenerationRecord): unknown => {
  try {
    assertShareable(record);
    return null;
  } catch (error) {
    return error;
  }
};

const generateFixture = (
  report: SemanticValidationReport
): Promise<
  Awaited<ReturnType<ReturnType<typeof createGenerationService>["generate"]>>
> => {
  const service = createGenerationService({
    persistence: createSeededPersistence(),
    provider: createDeterministicLessonDraftProvider(),
    requestIdFactory: () => "draft_req_share_fixture",
    semanticValidation: () => Promise.resolve(report),
  });

  return service.generate({
    actor: teacherActor,
    input: {
      ...validInput,
      idempotencyKey: "share-fixture-request",
    },
  });
};

describe("acceptance gate snapshot", () => {
  it("retains a passing gate snapshot on a ready-for-review record", async () => {
    const acceptance = await review(acceptanceDraft());

    expect(acceptance.state).toBe("ready-for-review");

    if (acceptance.state !== "ready-for-review") {
      return;
    }

    expect(acceptance.gate).toMatchObject({
      verdict: "pass",
      recovery: null,
      policyVersion: artifactGatePolicyVersion,
      artifactHash: expect.stringMatching(/^[a-f\d]{64}$/u),
      findings: [],
    });
  });

  it("retains warning findings while keeping the artifact renderable", async () => {
    const acceptance = await review(acceptanceDraft(), {
      report: warningReport,
    });

    expect(acceptance.state).toBe("ready-for-review");

    if (acceptance.state !== "ready-for-review") {
      return;
    }

    expect(acceptance.gate).toMatchObject({
      verdict: "warning",
      recovery: "edit",
    });
    expect(acceptance.gate.findings).toStrictEqual([
      expect.objectContaining({ code: "CONTENT_TOO_LONG", verdict: "warning" }),
    ]);
  });

  it("never reports ready-for-review when the semantic report hard-blocks", async () => {
    const acceptance = await review(acceptanceDraft(), {
      report: blockedReport,
    });

    expect(acceptance.state).toBe("blocked-by-validation");
    expect(acceptance).not.toHaveProperty("gate");
    expect(acceptance.diagnostics).toStrictEqual([
      expect.objectContaining({
        severity: "error",
        code: "ANSWER_MISMATCH",
        field: "relationships",
        verdict: "hard_block",
        validator: "curriculum",
        recovery: "edit",
      }),
    ]);
  });

  it("never reports ready-for-review when structural diagnostics hard-block", async () => {
    const acceptance = await review(acceptanceDraft(), {
      structuralDiagnostics: [
        {
          severity: "error",
          code: "TARGET_REUSED",
          message: "A target cannot be related to more than one source item.",
          field: "relationships",
        },
      ],
    });

    expect(acceptance.state).toBe("blocked-by-validation");
    expect(acceptance).not.toHaveProperty("gate");
    expect(acceptance.diagnostics).toStrictEqual([
      expect.objectContaining({
        severity: "error",
        code: "TARGET_REUSED",
        field: "relationships",
        verdict: "hard_block",
        recovery: "edit",
      }),
    ]);
  });

  it("fails closed as retryable when the gate throws", async () => {
    const acceptance = await review(acceptanceDraft(), {
      artifactGate: () => {
        throw new Error("The gate exploded.");
      },
    });

    expect(acceptance.state).toBe("failed-retryable");
    expect(acceptance).not.toHaveProperty("gate");
    expect(acceptance.diagnostics).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "ARTIFACT_GATE_UNAVAILABLE",
        }),
      ])
    );
  });

  it("fails closed as retryable through the generation service", async () => {
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider: createDeterministicLessonDraftProvider(),
      requestIdFactory: () => "draft_req_gate_crash",
      semanticValidation: () => Promise.resolve(passingReport),
      artifactGate: () => {
        throw new Error("The gate exploded.");
      },
    });

    const { record, publicResult } = await service.generate({
      actor: teacherActor,
      input: { ...validInput, idempotencyKey: "gate-crash-request" },
    });

    expect(record.state).toBe("failed-retryable");
    expect(record.gate ?? null).toBeNull();
    expect(record.draft ?? null).toBeNull();
    expect(publicResult.state).toBe("failed-retryable");
  });
});

describe("stored artifact gate", () => {
  it("re-derives the same hash the acceptance snapshot recorded", async () => {
    const { record } = await generateFixture(passingReport);

    expect(record.gate).toBeDefined();

    const outcome = gateStoredArtifact(record);

    expect(outcome.ok).toBeTruthy();

    if (!outcome.ok) {
      return;
    }

    expect(outcome.result.artifactHash).toBe(record.gate?.artifactHash);
    expect(outcome.result.verdict).toBe("pass");
  });

  it("refuses a missing snapshot", async () => {
    const { record } = await generateFixture(passingReport);
    const withoutSnapshot = { ...record };
    delete withoutSnapshot.gate;

    const outcome = gateStoredArtifact(withoutSnapshot);

    expect(outcome).toMatchObject({
      ok: false,
      refusal: {
        code: "GATE_SNAPSHOT_MISSING",
        recovery: "retry",
        findings: [],
      },
    });
  });

  it("refuses a stale artifact hash and names the re-derivation", async () => {
    const { record } = await generateFixture(passingReport);
    const stale = structuredClone(record);
    const firstVariant = stale.draft?.variants[0];
    if (!firstVariant || !stale.draft) {
      throw new Error("The fixture must carry a lesson draft.");
    }
    firstVariant.title = `${firstVariant.title} (edited)`;

    const outcome = gateStoredArtifact(stale);

    expect(outcome).toMatchObject({
      ok: false,
      refusal: {
        code: "GATE_SNAPSHOT_STALE",
        recovery: "retry",
      },
    });

    expect(outcome.ok ? "" : outcome.refusal.message).toContain("Re-derive");
  });

  it("refuses a snapshot minted under another policy version", async () => {
    const { record } = await generateFixture(passingReport);
    const stale = structuredClone(record);
    if (!stale.gate) {
      throw new Error("The fixture must carry a gate snapshot.");
    }
    stale.gate.policyVersion = "artifact-gate-policy-v0";

    const outcome = gateStoredArtifact(stale);

    expect(outcome).toMatchObject({
      ok: false,
      refusal: { code: "GATE_SNAPSHOT_STALE" },
    });
  });

  it("refuses a hard-blocked artifact even when a forged pass snapshot matches it", async () => {
    const { record } = await generateFixture(passingReport);
    const corrupted = structuredClone(record);
    const [firstVariant, secondVariant] = corrupted.draft?.variants ?? [];
    if (!firstVariant || !secondVariant || !corrupted.draft) {
      throw new Error("The fixture must carry two variants.");
    }
    secondVariant.id = firstVariant.id;

    const derived = deriveStoredArtifactGate(corrupted);

    expect(derived.verdict).toBe("hard_block");

    corrupted.gate = {
      verdict: "pass",
      recovery: null,
      policyVersion: derived.policyVersion,
      artifactHash: derived.artifactHash,
      findings: [],
    };

    const outcome = gateStoredArtifact(corrupted);

    expect(outcome).toMatchObject({
      ok: false,
      refusal: {
        code: "GATE_HARD_BLOCKED",
        verdict: "hard_block",
        recovery: "edit",
      },
    });

    expect(outcome.ok ? [] : outcome.refusal.findings).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DUPLICATE_ID" }),
      ])
    );
  });
});

describe("Share guard", () => {
  it("returns the branded renderable artifact for a passing snapshot", async () => {
    const { record } = await generateFixture(passingReport);

    const artifact = assertShareable(record);

    expect(artifact.kind).toBe("lesson");
    expect(artifact.artifactHash).toBe(record.gate?.artifactHash);
    expect(artifact.policyVersion).toBe(artifactGatePolicyVersion);
  });

  it("keeps Share available for a warning snapshot", async () => {
    const { record } = await generateFixture(warningReport);

    expect(record.gate?.verdict).toBe("warning");
    expect(assertShareable(record).kind).toBe("lesson");
  });

  it("is idempotent and does not mutate the record", async () => {
    const { record } = await generateFixture(passingReport);
    const before = structuredClone(record);

    const first = assertShareable(record);
    const second = assertShareable(record);

    expect(second).toStrictEqual(first);
    expect(record).toStrictEqual(before);
  });

  it("refuses a missing snapshot with an actionable code", async () => {
    const { record } = await generateFixture(passingReport);
    const withoutSnapshot = { ...record };
    delete withoutSnapshot.gate;

    expect(() => assertShareable(withoutSnapshot)).toThrow(
      ArtifactShareRejectedError
    );

    expect(captureShareRejection(withoutSnapshot)).toMatchObject({
      refusal: { code: "GATE_SNAPSHOT_MISSING", recovery: "retry" },
    });
  });

  it("refuses a stale artifact", async () => {
    const { record } = await generateFixture(passingReport);
    const stale = structuredClone(record);
    const firstVariant = stale.draft?.variants[0];
    if (!firstVariant || !stale.draft) {
      throw new Error("The fixture must carry a lesson draft.");
    }
    firstVariant.instructions = `${firstVariant.instructions} Edit.`;

    expect(() => assertShareable(stale)).toThrow(ArtifactShareRejectedError);

    expect(captureShareRejection(stale)).toMatchObject({
      refusal: { code: "GATE_SNAPSHOT_STALE" },
    });
  });

  it("cannot accept a raw artifact through the branded type", async () => {
    const { record } = await generateFixture(passingReport);
    if (!record.gate || !record.draft) {
      throw new Error("The fixture must carry a draft and gate snapshot.");
    }

    const rawArtifact = {
      kind: "lesson" as const,
      draft: record.draft,
      learningPath: record.draft.learningPath,
      artifactHash: record.gate.artifactHash,
      policyVersion: record.gate.policyVersion,
    };

    // @ts-expect-error -- only gateArtifact may mint the private brand; a raw draft is not shareable.
    expect(acceptsRenderable(rawArtifact)).toBe(record.gate.artifactHash);
  });
});

describe("gate snapshot factory", () => {
  it("refuses to snapshot a hard-blocked result", () => {
    expect(() => {
      return snapshotArtifactGateResult({
        verdict: "hard_block",
        recovery: "edit",
        findings: [],
        policyVersion: artifactGatePolicyVersion,
        artifactHash: "a".repeat(64),
        renderable: null,
      });
    }).toThrow(/hard-blocked/u);
  });
});
