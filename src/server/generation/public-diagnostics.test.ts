import { describe, expect, it } from "vitest";

import {
  recoveryActionValues,
  publicGenerationDiagnosticSchema,
} from "@/shared/generation-contract";

import { createEquivalentFractionsDraft } from "./provider";
import { toPublicGenerationResult } from "./projection";
import type {
  GenerationDiagnostic,
  LessonDraft,
  LessonGenerationRecord,
  NormalizedGenerationRequest,
  ProviderProvenance,
  ValidatedLearningPath,
} from "./types";

const fixtureInput: NormalizedGenerationRequest = {
  prompt: "equivalent fractions for grade 4",
  grade: 4,
  standardId: "standard_ccss_4_nf_a_01",
  language: "en",
  difficulty: "on-level",
};

const fixtureProvenance: ProviderProvenance = {
  provider: "public-diagnostics-fixture",
  model: "fixture-model",
  promptTemplateVersion: "fixture-template-v1",
  validatorVersion: "lesson-validator-v2",
};

const fixtureLearningPath: ValidatedLearningPath = {
  direction: "forward",
  steps: [
    {
      nodeId: "node_equivalent_fractions",
      label: "Equivalent fractions",
      role: "target",
      screenPurposeId: "screen_matching",
      screenPurpose: "Match equivalent fractions",
    },
  ],
  rationale: "Fixture rationale.",
  nextScreenRationale: "Fixture next-screen rationale.",
  versionPins: {
    draftId: "draft_req_public_diagnostics",
    graphVersion: "graph-v1",
    catalogVersion: "catalog-v1",
    modelVersion: "fixture-model",
    validatorVersion: "lesson-validator-v2",
  },
};

const fixtureDraft = (): LessonDraft => {
  const providerDraft = createEquivalentFractionsDraft(fixtureInput);
  return {
    ...providerDraft,
    learningPath: fixtureLearningPath,
    requestId: "draft_req_public_diagnostics",
    input: fixtureInput,
    provenance: fixtureProvenance,
    createdAt: "2026-10-31T00:00:00.000Z",
  };
};

const recordWith = (
  overrides: Partial<LessonGenerationRecord> = {}
): LessonGenerationRecord => {
  return {
    requestId: "draft_req_public_diagnostics",
    tenantId: "tenant_demo",
    teacherId: "teacher_demo",
    input: fixtureInput,
    state: "blocked-by-validation",
    attempt: 1,
    diagnostics: [],
    attempts: [],
    createdAt: "2026-10-31T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
    ...overrides,
  };
};

const hardBlockDiagnostics: GenerationDiagnostic[] = [
  {
    severity: "error",
    code: "DUPLICATE_ID",
    message: "Variant identifiers must be unique across the draft.",
    field: "variants",
    variantId: "variant-2",
    verdict: "hard_block",
    validatorVersion: "lesson-validator-v2",
    recovery: "edit",
  },
  {
    severity: "error",
    code: "UNSAFE_PAYLOAD",
    message: "The compiled screen contains an executable payload.",
    field: "instructions",
    variantId: "variant-3",
    verdict: "hard_block",
    validatorVersion: "a2ui-compile-guard-v1",
    recovery: "replace",
  },
  {
    severity: "error",
    code: "ARTIFACT_GATE_UNAVAILABLE",
    message: "The safety gate could not complete safely. Try this draft again.",
    field: "draft",
    verdict: "hard_block",
    validatorVersion: "artifact-gate-policy-v1",
    recovery: "retry",
  },
];

describe("public diagnostics payload", () => {
  it("carries the record input language when the draft is blocked", () => {
    const result = toPublicGenerationResult(
      recordWith({
        input: { ...fixtureInput, language: "ar" },
        diagnostics: hardBlockDiagnostics,
      })
    );

    expect(result.draft).toBeNull();
    expect(result.language).toBe("ar");
  });

  it("names every blocked screen and keeps the draft out of the payload", () => {
    const result = toPublicGenerationResult(
      recordWith({ diagnostics: hardBlockDiagnostics })
    );

    expect(result.state).toBe("blocked-by-validation");
    expect(result.draft).toBeNull();
    expect(result).toMatchObject({
      diagnosticsRollup: {
        verdict: "hard_block",
        recovery: "retry",
        affectedScreens: ["variant-2", "variant-3"],
        screens: [
          {
            variantId: "variant-2",
            verdict: "hard_block",
            findings: [{ code: "DUPLICATE_ID", recovery: "edit" }],
          },
          {
            variantId: "variant-3",
            verdict: "hard_block",
            findings: [{ code: "UNSAFE_PAYLOAD", recovery: "replace" }],
          },
        ],
        flow: [{ code: "ARTIFACT_GATE_UNAVAILABLE", recovery: "retry" }],
      },
    });
  });

  it("gives every public finding exactly one closed recovery action", () => {
    const result = toPublicGenerationResult(
      recordWith({ diagnostics: hardBlockDiagnostics })
    );
    const findings = [
      ...result.diagnosticsRollup.screens.flatMap((screen) => screen.findings),
      ...result.diagnosticsRollup.flow,
    ];

    expect(findings).toHaveLength(hardBlockDiagnostics.length);

    for (const finding of findings) {
      expect(publicGenerationDiagnosticSchema.parse(finding)).toStrictEqual(
        finding
      );
      expect(recoveryActionValues).toContain(finding.recovery);
    }
  });

  it("rolls up every affected screen once and keeps flow findings separate", () => {
    const diagnostics: GenerationDiagnostic[] = [
      {
        severity: "error",
        code: "TARGET_REUSED",
        message: "A target cannot be related to more than one source item.",
        field: "relationships",
        variantId: "variant-1",
        recovery: "edit",
      },
      {
        severity: "warning",
        code: "CONTENT_TOO_LONG",
        message: "Instructions are long; a teacher should shorten them.",
        field: "instructions",
        variantId: "variant-1",
        verdict: "warning",
        recovery: "edit",
      },
      {
        severity: "error",
        code: "UNKNOWN_TARGET",
        message: "Every relationship must refer to a target item.",
        field: "relationships",
        variantId: "variant-2",
        recovery: "edit",
      },
      {
        severity: "error",
        code: "UNKNOWN_COMPONENT",
        message: "The screen uses a component the catalog does not allow.",
        field: "component",
        variantId: "variant-4",
        recovery: "replace",
      },
      {
        severity: "error",
        code: "LEARNING_PATH_MISSING",
        message: "The lesson draft has no validated prerequisite path.",
        field: "learningPath",
        recovery: "edit",
      },
    ];

    const result = toPublicGenerationResult(recordWith({ diagnostics }));
    const { affectedScreens, screens, flow } = result.diagnosticsRollup;

    expect(affectedScreens).toStrictEqual([
      "variant-1",
      "variant-2",
      "variant-4",
    ]);
    expect(screens.map((screen) => screen.findings.length)).toStrictEqual([
      2, 1, 1,
    ]);
    expect(flow).toStrictEqual([
      expect.objectContaining({ code: "LEARNING_PATH_MISSING" }),
    ]);
    expect(
      screens.every((screen) => {
        return screen.findings.every(
          (finding) => finding.variantId === screen.variantId
        );
      })
    ).toBeTruthy();
  });

  it("keeps a warning-only payload reviewable with its draft and warnings visible", () => {
    const diagnostics: GenerationDiagnostic[] = [
      {
        severity: "warning",
        code: "CONTENT_TOO_LONG",
        message: "Instructions are long; a teacher should shorten them.",
        field: "instructions",
        variantId: "variant-1",
        verdict: "warning",
        validator: "learning-quality",
        validatorVersion: "learning-quality-v1",
        recovery: "edit",
      },
    ];

    const result = toPublicGenerationResult(
      recordWith({
        state: "ready-for-review",
        diagnostics,
        draft: fixtureDraft(),
      })
    );

    expect(result.state).toBe("ready-for-review");
    expect(result.draft?.variants).toHaveLength(4);
    expect(result.diagnosticsRollup).toMatchObject({
      verdict: "warning",
      recovery: "edit",
      affectedScreens: ["variant-1"],
    });
    expect(result.diagnostics).toStrictEqual([
      expect.objectContaining({ code: "CONTENT_TOO_LONG" }),
    ]);
  });
});

describe("public payload scrub", () => {
  const canaries = [
    "CANARY_ANSWER_KEY_7f3c",
    "CANARY_SECRET_91ab",
    "CANARY_TOKEN_44d0",
    "CANARY_STUDENT_2b8e",
    "CANARY_RAW_PROVIDER_TEXT_9c1d",
  ] as const;

  it("removes answer keys, secrets, tokens, provider text, and student identifiers", () => {
    const canaryDiagnostics: GenerationDiagnostic[] = [
      {
        severity: "error",
        code: "DUPLICATE_ID",
        message: `The answer key repeats ${canaries[0]}.`,
        field: "variants",
        variantId: canaries[3],
        nodeId: canaries[2],
        verdict: "hard_block",
        validatorVersion: "lesson-validator-v2",
        recommendation: `Use the secret ${canaries[1]}.`,
        recovery: "edit",
      },
      {
        severity: "error",
        code: "UNSAFE_PAYLOAD",
        message: `provider_response: ${canaries[4]}.`,
        field: "instructions",
        variantId: "variant-2",
        verdict: "hard_block",
        recovery: "replace",
      },
      {
        severity: "error",
        code: "UNTRUSTED_FIELD",
        message: `student_id: ${canaries[3]}.`,
        field: "draft",
        verdict: "hard_block",
        recovery: "edit",
      },
      {
        severity: "error",
        code: "UNKNOWN_TARGET",
        message: `Bearer token=${canaries[2]}.`,
        field: "relationships",
        variantId: "variant-3",
        verdict: "hard_block",
        recovery: "edit",
      },
    ];

    const result = toPublicGenerationResult(
      recordWith({ diagnostics: canaryDiagnostics })
    );
    const serialized = JSON.stringify(result);

    expect(
      canaries.filter((canary) => serialized.includes(canary))
    ).toStrictEqual([]);
    expect(result.diagnostics.map((finding) => finding.code)).toStrictEqual([
      "DUPLICATE_ID",
      "UNSAFE_PAYLOAD",
      "UNTRUSTED_FIELD",
      "UNKNOWN_TARGET",
    ]);
    expect(result.diagnosticsRollup.affectedScreens).toStrictEqual([
      "variant-2",
      "variant-3",
    ]);
    expect(
      result.diagnostics.every(
        (finding) =>
          finding.message.length > 0 && finding.recovery !== undefined
      )
    ).toBeTruthy();
  });

  it("never publishes private relationship (answer-key) identifiers", () => {
    const draft = fixtureDraft();
    const [firstVariant] = draft.variants;
    if (!firstVariant) {
      throw new Error("The fixture must carry a first variant.");
    }
    firstVariant.relationships = firstVariant.relationships.map(
      (relationship, index) => {
        return {
          ...relationship,
          id: index === 0 ? `relationship-${canaries[0]}` : relationship.id,
        };
      }
    );

    const result = toPublicGenerationResult(
      recordWith({ state: "ready-for-review", draft })
    );
    const serialized = JSON.stringify(result);
    const [publicVariant] = result.draft?.variants ?? [];

    expect(serialized).not.toContain(canaries[0]);
    expect(result.draft).not.toBeNull();
    expect(publicVariant?.targetItems.length).toBeGreaterThan(0);
  });
});
