import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { demoSeed } from "@/server/seed-data";

import { artifactGatePolicyVersion, gateArtifact } from "./artifact-gate";
import {
  breakFirstRelationshipAnswer,
  validFractionDraft,
} from "./artifact-corpus";
import { buildValidatedLearningPath } from "./learning-path";
import { createEquivalentFractionsDraft } from "./provider";
import {
  createDemoCurriculumContext,
  semanticValidationRunnerVersion,
  validateSemanticLesson,
} from "./semantic-validation";
import { curriculumValidatorVersion } from "./semantic-validation-contract";
import { validatorVersion } from "./validation";
import type { ArtifactGateResult, RenderableArtifact } from "./artifact-gate";
import type { SemanticValidationReport } from "./semantic-validation-contract";
import type {
  ProviderLessonDraft,
  ProviderProvenance,
  ValidatedLearningPath,
} from "./types";

const validInput = () => {
  return {
    prompt: "equivalent fractions for grade 4",
    grade: 4,
    standardId: demoSeed.standard.id,
    language: "en" as const,
    difficulty: "on-level" as const,
  };
};

const fixtureProvenance: ProviderProvenance = {
  provider: "artifact-gate-fixture",
  model: "fixture-model",
  promptTemplateVersion: "fixture-template-v1",
  validatorVersion: "lesson-validator-v2",
};

const buildArtifact = (draft: ProviderLessonDraft) => {
  if (!draft.learningPath) {
    throw new Error("The gate fixture draft must carry a learning path.");
  }
  const context = createDemoCurriculumContext(validInput());
  const learningPath: ValidatedLearningPath = buildValidatedLearningPath({
    proposal: draft.learningPath,
    context,
    draftId: "draft_gate_fixture",
    provenance: fixtureProvenance,
    validatorVersion: semanticValidationRunnerVersion,
  });

  return { draft, learningPath, context };
};

const differentiatedDraft = () => {
  const draft = createEquivalentFractionsDraft(validInput());
  const [, secondStandard, scaffold, challenge] = draft.variants;

  secondStandard.distractorItems = [];
  scaffold.sourceItems = scaffold.sourceItems.slice(0, 3);
  scaffold.targetItems = scaffold.targetItems.slice(0, 3);
  scaffold.relationships = scaffold.relationships.slice(0, 3);
  scaffold.distractorItems = [];
  scaffold.hints = [
    ...scaffold.hints,
    "Start with the equal parts you can see.",
  ];

  challenge.sourceItems.push({ id: "source-4-7", label: "4/7" });
  challenge.targetItems.push({ id: "target-4-7", label: "8/14" });
  challenge.relationships.push({
    id: "relationship-4-7",
    sourceId: "source-4-7",
    targetId: "target-4-7",
  });

  return draft;
};

const answerMismatchDraft = () => {
  const draft = createEquivalentFractionsDraft(validInput());
  breakFirstRelationshipAnswer(draft);
  return draft;
};

const emptyPassReport: SemanticValidationReport = {
  status: "complete",
  verdict: "pass",
  recovery: null,
  reviews: [],
  findings: [],
  retry: { available: false, message: "No retry needed." },
};

const reverseKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => reverseKeys(entry));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .toReversed()
      .map((key) => [key, reverseKeys(record[key])])
  );
};

const consumerRecovery = (result: ArtifactGateResult): string | null => {
  switch (result.verdict) {
    case "pass": {
      return null;
    }
    case "warning": {
      return result.recovery;
    }
    case "hard_block": {
      return result.recovery;
    }
    default: {
      const exhaustive: never = result;
      throw new Error(`Unhandled gate verdict: ${String(exhaustive)}`);
    }
  }
};

describe("artifact gate contract", () => {
  it("mints a renderable artifact for a passing report", async () => {
    const { draft, learningPath, context } = buildArtifact(
      differentiatedDraft()
    );
    const report = await validateSemanticLesson({ draft, context });

    const result = gateArtifact({
      kind: "lesson",
      draft,
      learningPath,
      report,
    });

    expect(report.verdict).toBe("pass");
    expect(result).toMatchObject({
      verdict: "pass",
      recovery: null,
      findings: [],
      policyVersion: artifactGatePolicyVersion,
      renderable: {
        artifactHash: expect.stringMatching(/^[a-f\d]{64}$/u),
        policyVersion: artifactGatePolicyVersion,
      },
    });
    expect(result.artifactHash).toBe(result.renderable?.artifactHash);
    expect(consumerRecovery(result)).toBeNull();
  });

  it("treats a report with no findings as a pass", () => {
    const { draft, learningPath } = buildArtifact(
      createEquivalentFractionsDraft(validInput())
    );

    const result = gateArtifact({
      kind: "lesson",
      draft,
      learningPath,
      report: emptyPassReport,
    });

    expect(result.verdict).toBe("pass");
    expect(result.recovery).toBeNull();
    expect(result.findings).toStrictEqual([]);
    expect(result.renderable).not.toBeNull();
  });

  it("keeps a warning artifact renderable and actionable", async () => {
    const { draft, learningPath, context } = buildArtifact(
      createEquivalentFractionsDraft(validInput())
    );
    const report = await validateSemanticLesson({ draft, context });

    const result = gateArtifact({
      kind: "lesson",
      draft,
      learningPath,
      report,
    });

    expect(result).toMatchObject({ verdict: "warning", recovery: "edit" });
    expect(result.findings.length).toBeGreaterThan(0);
    expect(
      result.findings.every((finding) => finding.recovery === "edit")
    ).toBeTruthy();
    expect(result.renderable).not.toBeNull();
    expect(consumerRecovery(result)).toBe("edit");
  });

  it("hard-blocks a broken relationship and withholds the renderable artifact", async () => {
    const { draft, learningPath, context } = buildArtifact(
      answerMismatchDraft()
    );
    const report = await validateSemanticLesson({ draft, context });

    const result = gateArtifact({
      kind: "lesson",
      draft,
      learningPath,
      report,
    });

    expect(result.verdict).toBe("hard_block");
    expect(result.recovery).toBe("edit");
    expect(result.renderable).toBeNull();
    expect(result.findings).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ANSWER_MISMATCH",
          recovery: "edit",
        }),
      ])
    );
    expect(consumerRecovery(result)).toBe("edit");
  });

  it("retains validator provenance and the affected node on every finding", async () => {
    const { draft, learningPath, context } = buildArtifact(
      answerMismatchDraft()
    );
    const report = await validateSemanticLesson({
      draft,
      context,
      path: {
        direction: "forward",
        nodeIds: ["graph_node_ghost", context.targetNodeId],
      },
    });

    const result = gateArtifact({
      kind: "lesson",
      draft,
      learningPath,
      report,
    });

    expect(result.verdict).toBe("hard_block");
    expect(result.findings).toStrictEqual(
      expect.arrayContaining([
        {
          validator: "curriculum",
          validatorVersion: curriculumValidatorVersion,
          verdict: "hard_block",
          code: "UNKNOWN_PATH_NODE",
          field: "path.nodeIds",
          nodeId: "graph_node_ghost",
          reason: expect.any(String),
          recovery: "edit",
        },
      ])
    );
    expect(result.findings).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          validator: "curriculum",
          validatorVersion: curriculumValidatorVersion,
          code: "ANSWER_MISMATCH",
          field: "relationships",
          variantId: draft.variants[0]?.id,
          reason: expect.any(String),
          recovery: "edit",
        }),
      ])
    );
  });

  it("maps retryable validator infrastructure to retry, not edit", async () => {
    const { draft, learningPath, context } = buildArtifact(
      createEquivalentFractionsDraft(validInput())
    );
    const report = await validateSemanticLesson(
      { draft, context },
      {
        timeoutMs: 2,
        maxAttempts: 1,
        recommendationAgents: [
          {
            role: "learning-quality",
            version: "artifact-gate-timeout-fixture-v1",
            async review(_input, signal) {
              await delay(20, undefined, { signal });
              return [];
            },
          },
        ],
      }
    );

    const result = gateArtifact({
      kind: "lesson",
      draft,
      learningPath,
      report,
    });

    expect(report.status).toBe("retryable");
    expect(result).toMatchObject({
      verdict: "hard_block",
      recovery: "retry",
      renderable: null,
    });
    expect(result.findings).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VALIDATION_TIMEOUT",
          validatorVersion: "artifact-gate-timeout-fixture-v1",
          recovery: "retry",
        }),
      ])
    );
    expect(consumerRecovery(result)).toBe("retry");
  });

  it("re-derives the same result for the same artifact and policy version", async () => {
    const { draft, learningPath, context } = buildArtifact(
      answerMismatchDraft()
    );
    const report = await validateSemanticLesson({ draft, context });

    const first = gateArtifact({ kind: "lesson", draft, learningPath, report });
    const second = gateArtifact({
      kind: "lesson",
      draft,
      learningPath,
      report,
    });
    const reordered = gateArtifact({
      kind: "lesson",
      draft: reverseKeys(draft) as ProviderLessonDraft,
      learningPath: reverseKeys(learningPath) as ValidatedLearningPath,
      report,
    });

    expect(second).toStrictEqual(first);
    expect(reordered.artifactHash).toBe(first.artifactHash);
    expect(reordered.verdict).toBe(first.verdict);
  });

  it("echoes the supplied policy version in the gate result", () => {
    const { draft, learningPath } = buildArtifact(
      createEquivalentFractionsDraft(validInput())
    );

    const result = gateArtifact({
      kind: "lesson",
      draft,
      learningPath,
      report: emptyPassReport,
      policyVersion: "artifact-gate-policy-fixture-v9",
    });

    expect(result.policyVersion).toBe("artifact-gate-policy-fixture-v9");
    expect(result.renderable?.policyVersion).toBe(
      "artifact-gate-policy-fixture-v9"
    );
  });

  it("cannot construct a renderable artifact outside the gate module", () => {
    const { draft, learningPath } = buildArtifact(
      createEquivalentFractionsDraft(validInput())
    );

    // @ts-expect-error -- the brand is private to the gate module; only gateArtifact can mint it.
    const forged: RenderableArtifact = {
      kind: "lesson",
      draft,
      learningPath,
      artifactHash: "forged",
      policyVersion: artifactGatePolicyVersion,
    };

    expect(forged.artifactHash).toBe("forged");
    expect(forged.policyVersion).toBe(artifactGatePolicyVersion);
    expect(forged.kind).toBe("lesson");

    if (forged.kind !== "lesson") {
      return;
    }

    expect(forged.draft.variants).toHaveLength(4);
    expect(forged.learningPath.steps.length).toBeGreaterThan(0);
  });

  it("maps executable structural diagnostics to replace and withholds the brand", () => {
    const { draft, learningPath } = buildArtifact(
      createEquivalentFractionsDraft(validInput())
    );

    const result = gateArtifact({
      kind: "lesson",
      draft,
      learningPath,
      report: emptyPassReport,
      structuralDiagnostics: [
        {
          severity: "error",
          code: "EXECUTABLE_CONTENT",
          message: "Generated content contains executable markup.",
          variantId: draft.variants[0]?.id,
          field: "instructions",
        },
      ],
    });

    expect(result).toMatchObject({
      verdict: "hard_block",
      recovery: "replace",
      renderable: null,
    });
    expect(result.findings).toStrictEqual([
      {
        validator: "structural",
        validatorVersion,
        verdict: "hard_block",
        code: "EXECUTABLE_CONTENT",
        field: "instructions",
        variantId: draft.variants[0]?.id,
        reason: "Generated content contains executable markup.",
        recovery: "replace",
      },
    ]);
  });

  it("maps schema and relationship diagnostics to edit", () => {
    const { draft, learningPath } = buildArtifact(
      createEquivalentFractionsDraft(validInput())
    );

    const result = gateArtifact({
      kind: "lesson",
      draft,
      learningPath,
      report: emptyPassReport,
      structuralDiagnostics: [
        {
          severity: "error",
          code: "TARGET_REUSED",
          message: "A target cannot be related to more than one source item.",
          field: "relationships",
        },
      ],
    });

    expect(result).toMatchObject({
      verdict: "hard_block",
      recovery: "edit",
      renderable: null,
    });
    expect(result.findings[0]).toMatchObject({
      code: "TARGET_REUSED",
      recovery: "edit",
    });
  });

  it("treats a structural warning as renderable and actionable", () => {
    const { draft, learningPath } = buildArtifact(
      createEquivalentFractionsDraft(validInput())
    );

    const result = gateArtifact({
      kind: "lesson",
      draft,
      learningPath,
      report: emptyPassReport,
      structuralDiagnostics: [
        {
          severity: "warning",
          code: "CONTENT_TOO_LONG",
          message: "Instructions are long.",
          field: "instructions",
        },
      ],
    });

    expect(result).toMatchObject({ verdict: "warning", recovery: "edit" });
    expect(result.renderable).not.toBeNull();
  });

  it("maps unknown pre-render payloads to replace and id breaks to edit", () => {
    const { draft, learningPath } = buildArtifact(
      createEquivalentFractionsDraft(validInput())
    );

    const unknownComponent = gateArtifact({
      kind: "lesson",
      draft,
      learningPath,
      report: emptyPassReport,
      preRenderFailures: [
        {
          code: "UNKNOWN_COMPONENT",
          field: "preview",
          reason: "The preview requested a component outside the catalog.",
        },
      ],
    });
    const duplicateComponent = gateArtifact({
      kind: "lesson",
      draft,
      learningPath,
      report: emptyPassReport,
      preRenderFailures: [
        {
          code: "DUPLICATE_COMPONENT",
          field: "preview",
          reason: "The preview sent duplicate component identifiers.",
        },
      ],
    });

    expect(unknownComponent).toMatchObject({
      verdict: "hard_block",
      recovery: "replace",
      renderable: null,
    });
    expect(unknownComponent.findings[0]).toMatchObject({
      validator: "structural",
      validatorVersion: "a2ui-compile-guard-v1",
      code: "UNKNOWN_COMPONENT",
      recovery: "replace",
    });
    expect(duplicateComponent).toMatchObject({
      verdict: "hard_block",
      recovery: "edit",
      renderable: null,
    });
  });

  it("hard-blocks a lesson without a validated learning path", () => {
    const { draft } = buildArtifact(
      createEquivalentFractionsDraft(validInput())
    );

    const result = gateArtifact({
      kind: "lesson",
      draft,
      report: emptyPassReport,
    });

    expect(result).toMatchObject({ verdict: "hard_block", renderable: null });
    expect(result.findings).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "LEARNING_PATH_MISSING",
          validator: "structural",
          recovery: "edit",
        }),
      ])
    );
  });

  it("mints a fraction renderable artifact with a deterministic hash", () => {
    const first = gateArtifact({
      kind: "fraction",
      draft: validFractionDraft,
    });
    const second = gateArtifact({
      kind: "fraction",
      draft: structuredClone(validFractionDraft),
    });

    expect(first.verdict).toBe("pass");
    expect(first.renderable).toMatchObject({
      kind: "fraction",
      draft: validFractionDraft,
      artifactHash: expect.stringMatching(/^[a-f\d]{64}$/u),
    });
    expect(second.artifactHash).toBe(first.artifactHash);
  });
});
