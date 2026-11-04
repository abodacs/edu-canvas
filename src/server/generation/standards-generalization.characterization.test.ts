import { describe, expect, it } from "vitest";

import {
  multistepWordProblemsPack,
  ri52MainIdeaPack,
} from "@/server/curriculum/built-in-packs";
import { parseTenantId } from "@/server/identity/identifiers";
import { syntheticTeacherActor } from "@/server/identity/test-actors";
import { createSeededGenerationLimitStore } from "@/server/persistence/limits-seeded";
import { createSeededPersistence } from "@/server/persistence/seeded";
import { syntheticSeed } from "@/server/seed-data";

import { reviewDraftForAcceptance } from "./draft-acceptance";
import { GenerationRequestError } from "./generation-request-error";
import { createSyntheticCurriculumContext } from "./semantic-validation";
import { createGenerationService, normalizeGenerationInput } from "./service";
import { validateProviderDraft } from "./validation";

import type { ProviderGenerationContext } from "./provider";
import type { VersionedCurriculumContext } from "./semantic-validation-contract";
import type {
  NormalizedGenerationRequest,
  ProviderLessonDraft,
  ProviderProvenance,
  ProviderVariant,
} from "./types";
import type { LessonGenerationInput } from "@/shared/generation-contract";

/**
Characterization for the standards-generalization research record
(docs/research/standards-generalization/README.md, break points B1, B6, B7).
S2 and S3 flipped B1 and B6. #222 flips B7: the RI.5.2 pack authors a Grade 4
prerequisite node and declares text-evidence and teacher-review rules, so the
non-math path passes the structural gate. A separate case still pins the gate's
refusal of a one-node path, so the structural rule was not weakened to fit the
pack.
*/

const tenantId = syntheticSeed.tenant.id;

const fixtureProvenance: ProviderProvenance = {
  provider: "standards-generalization-fixture",
  model: "fixture-model",
  promptTemplateVersion: "fixture-template-v1",
  validatorVersion: "lesson-validator-v2",
};

interface MatchingPair {
  source: string;
  target: string;
}

// 4.OA.A.3: word problem -> equation with a letter for the unknown.
const wordProblemPairs: readonly MatchingPair[] = [
  {
    source:
      "Sam has 4 boxes with 6 pencils in each box. He gives away 5 pencils. How many pencils are left?",
    target: "4 × 6 − 5 = p",
  },
  {
    source:
      "A class of 27 students sits at tables of 4. How many tables are needed so everyone has a seat?",
    target: "27 ÷ 4 = t, round up",
  },
  {
    source:
      "Mia buys 3 packs of 8 stickers and gets 7 more from a friend. How many stickers does she have?",
    target: "3 × 8 + 7 = s",
  },
];

// RI.5.2: key detail -> the main idea it supports.
const detailPairs: readonly MatchingPair[] = [
  {
    source: "Bees carry pollen from one flower to the next.",
    target: "Bees help plants make seeds.",
  },
  {
    source: "Farmers rent hives so their orchards produce more fruit.",
    target: "People depend on bees for food.",
  },
  {
    source: "Fewer wildflowers means bees have less to eat.",
    target: "Bees face threats to their survival.",
  },
];

const variantPlan = [
  { id: "standard_1", kind: "standard" },
  { id: "standard_2", kind: "standard" },
  { id: "scaffold_1", kind: "scaffold" },
  { id: "challenge_1", kind: "challenge" },
] as const;

const buildVariant = (
  plan: (typeof variantPlan)[number],
  pairs: readonly MatchingPair[]
): ProviderVariant => {
  return {
    id: plan.id,
    kind: plan.kind,
    title: `Match each item (${plan.id})`,
    instructions: "Match each item on the left with the item it goes with.",
    sourceItems: pairs.map((pair, index) => {
      return { id: `${plan.id}_source_${index}`, label: pair.source };
    }),
    targetItems: pairs.map((pair, index) => {
      return { id: `${plan.id}_target_${index}`, label: pair.target };
    }),
    distractorItems: [],
    relationships: pairs.map((_, index) => {
      return {
        id: `${plan.id}_relationship_${index}`,
        sourceId: `${plan.id}_source_${index}`,
        targetId: `${plan.id}_target_${index}`,
      };
    }),
    hints: ["Read each item twice before you match it."],
    feedback: {
      correct: "Each match is correct.",
      incorrect: "Look at one match again.",
    },
    languageMetadata: { language: "en", direction: "ltr", locale: "en-US" },
    accessibilityMetadata: {
      instructions: "Use Tab to move between items and Enter to match.",
      sourceGroupLabel: "Items to match",
      targetGroupLabel: "Possible matches",
    },
  };
};

const buildDraft = (
  pairs: readonly MatchingPair[],
  steps: { nodeId: string; screenPurposeId: string }[]
): ProviderLessonDraft => {
  return {
    variants: variantPlan.map((plan) => buildVariant(plan, pairs)),
    learningPath: {
      direction: "forward",
      steps,
      rationale: "Start with the prerequisite skill, then reach the standard.",
      nextScreenRationale: "The matching screen checks the target skill.",
    },
  };
};

// A one-step equation with a whole-number answer is a deliberately wrong
// target for the first word problem (4 × 6 − 5 is 19, not 4 + 6 − 5).
const withOneWrongPair = (pairs: readonly MatchingPair[]): MatchingPair[] => {
  const [first, ...rest] = pairs;
  if (!first) {
    throw new Error("The fixture needs at least one pair.");
  }
  return [{ ...first, target: "4 + 6 − 5 = p" }, ...rest];
};

const operationsGraphVersion = "operations-word-problems-v1";
const operationsContext: VersionedCurriculumContext = {
  tenantId,
  standardId: "standard_ccss_4_oa_a_03",
  standardCode: "4.OA.A.3",
  grade: 4,
  language: "en",
  packVersion: multistepWordProblemsPack.packVersion,
  graphVersion: operationsGraphVersion,
  targetNodeId: "graph_node_multistep_word_problems",
  nodes: [
    {
      id: "graph_node_two_step_word_problems",
      label: "Solve two-step word problems (3.OA.D.8)",
      sequence: 1,
      screenPurposeId: "screen_purpose_two_step",
      screenPurpose: "Write an equation for a two-step word problem.",
    },
    {
      id: "graph_node_multistep_word_problems",
      label: "Solve multistep word problems (4.OA.A.3)",
      sequence: 2,
      screenPurposeId: "screen_purpose_multistep",
      screenPurpose: "Match a multistep word problem to its equation.",
    },
  ],
  edges: [
    {
      prerequisiteId: "graph_node_two_step_word_problems",
      successorId: "graph_node_multistep_word_problems",
    },
  ],
  answerRules: multistepWordProblemsPack.answerRules,
  allowedScreenPatterns: multistepWordProblemsPack.allowedScreenPatterns,
};

const operationsSteps = [
  {
    nodeId: "graph_node_two_step_word_problems",
    screenPurposeId: "screen_purpose_two_step",
  },
  {
    nodeId: "graph_node_multistep_word_problems",
    screenPurposeId: "screen_purpose_multistep",
  },
];

// The RI.5.2 pack is the authority for the non-math context. The pack authors
// a Grade 4 prerequisite node, so the path is two steps even though Learning
// Commons returns no ELA prerequisites.
const readingContext: VersionedCurriculumContext =
  createSyntheticCurriculumContext({
    grade: 5,
    language: "en",
    standardId: ri52MainIdeaPack.standardId,
  });

const readingSteps = ri52MainIdeaPack.graph.nodes.map((node) => {
  return { nodeId: node.id, screenPurposeId: node.screenPurposeId };
});

// The fraction control uses the pack whose answer rule is fraction equivalence,
// not the 4.OA.A.3 context: the validator now reads the rule the pack declares.
const fractionContext: VersionedCurriculumContext =
  createSyntheticCurriculumContext({
    grade: 4,
    language: "en",
    standardId: syntheticSeed.standard.id,
  });

const fractionSteps = [
  {
    nodeId: "graph_node_equal_parts",
    screenPurposeId: "screen_purpose_equal_parts",
  },
  {
    nodeId: "graph_node_equivalent_fractions",
    screenPurposeId: "screen_purpose_equivalent_fractions",
  },
];

const requestFor = (
  context: VersionedCurriculumContext
): NormalizedGenerationRequest => {
  return {
    prompt: `Matching practice for ${context.standardCode}`,
    grade: context.grade,
    standardId: context.standardId,
    language: "en",
    difficulty: "on-level",
  };
};

const accept = (
  draft: ProviderLessonDraft,
  context: VersionedCurriculumContext
) => {
  return reviewDraftForAcceptance(
    {
      draft,
      input: requestFor(context),
      tenantId,
      requestId: `draft_req_${context.graphVersion}`,
      provenance: fixtureProvenance,
      structuralDiagnostics: [],
      graphVersion: context.graphVersion,
    },
    { curriculumContext: () => context }
  );
};

interface CodedDiagnostic {
  code: string;
  validator?: string;
  verdict?: string;
}

const codesOf = (diagnostics: readonly CodedDiagnostic[]): string[] => {
  return [
    ...new Set(diagnostics.map((diagnostic) => diagnostic.code)),
  ].toSorted();
};

const captureStandardRejection = (standardId: string): unknown => {
  try {
    normalizeGenerationInput({
      prompt: "Multistep word problems",
      grade: 4,
      standardId,
      language: "en",
      difficulty: "on-level",
    });
  } catch (error) {
    return error;
  }
  return undefined;
};

// The fixture repeats one interaction structure across variants, so the
// learning-quality validator adds its own warnings; the answer rule is the
// curriculum validator's, so these checks read its findings only.
const curriculumFindings = (
  diagnostics: readonly CodedDiagnostic[]
): CodedDiagnostic[] => {
  return diagnostics.filter(
    (diagnostic) => diagnostic.validator === "curriculum"
  );
};

describe("standards generalization: 4.OA.A.3 word problem -> equation matching", () => {
  it("B1: accepts a registry-resolved standard and reaches the provider with its pack context", async () => {
    const input: LessonGenerationInput = {
      prompt: "Multistep word problems",
      grade: 4,
      standardId: "4.OA.A.3",
      language: "en",
      difficulty: "on-level",
    };

    expect(normalizeGenerationInput(input).standardId).toBe(
      multistepWordProblemsPack.standardId
    );

    let received:
      | {
          request: NormalizedGenerationRequest;
          context: ProviderGenerationContext;
        }
      | undefined;
    const service = createGenerationService({
      limits: createSeededGenerationLimitStore(),
      persistence: createSeededPersistence(),
      provider: {
        provenance: fixtureProvenance,
        generate(request, context) {
          received = { request, context };
          return Promise.resolve({
            draft: buildDraft(wordProblemPairs, operationsSteps),
          });
        },
      },
      requestIdFactory: () => "draft_req_4_oa_a_3",
    });

    const result = await service.generate({
      actor: syntheticTeacherActor({ tenantId: parseTenantId(tenantId) }),
      input: {
        ...input,
        idempotencyKey: "standards-generalization-4-oa-a-3",
      },
    });

    expect({
      normalizedStandardId: normalizeGenerationInput(input).standardId,
      requestStandardId: received?.request.standardId,
      targetNodeId: received?.context.curriculumContext?.targetNodeId,
      referenceContext: received?.context.referenceContext,
      state: result.record.state,
      versionPins: {
        graphVersion:
          result.record.draft?.learningPath.versionPins.graphVersion,
        packVersion: result.record.draft?.learningPath.versionPins.packVersion,
      },
      provenance: {
        packVersion: result.record.draft?.provenance.packVersion,
        allowedScreenPatterns:
          result.record.draft?.provenance.allowedScreenPatterns,
      },
    }).toStrictEqual({
      normalizedStandardId: multistepWordProblemsPack.standardId,
      requestStandardId: multistepWordProblemsPack.standardId,
      targetNodeId: multistepWordProblemsPack.graph.targetNodeId,
      referenceContext: undefined,
      state: "ready-for-review",
      versionPins: {
        graphVersion: multistepWordProblemsPack.graph.version,
        packVersion: multistepWordProblemsPack.packVersion,
      },
      provenance: {
        packVersion: multistepWordProblemsPack.packVersion,
        allowedScreenPatterns: multistepWordProblemsPack.allowedScreenPatterns,
      },
    });
  });

  it("B1: rejects an unknown standard without naming another lesson", () => {
    const rejection = captureStandardRejection("5.NBT.A.1");

    expect(rejection).toBeInstanceOf(GenerationRequestError);
    expect(rejection).toMatchObject({ code: "GENERATION_INPUT_INVALID" });
    expect((rejection as Error).message).toContain("not supported");
    expect((rejection as Error).message).not.toContain("4.NF.A.1");
  });

  it("B6: a correct answer set passes the structural gate and reaches ready-for-review", async () => {
    const draft = buildDraft(wordProblemPairs, operationsSteps);
    expect(
      validateProviderDraft(draft, { expectedLanguage: "en" })
    ).toStrictEqual({
      ok: true,
      draft,
      diagnostics: [],
    });

    const acceptance = await accept(draft, operationsContext);

    expect(acceptance.state).toBe("ready-for-review");
    const curriculum = curriculumFindings(acceptance.diagnostics);
    // Two equations per variant evaluate to the declared answer. The remainder
    // pair carries the annotation ", round up", which the bounded parser does
    // not evaluate, so it keeps the declared warning instead of a silent pass.
    expect(codesOf(curriculum)).toStrictEqual([
      "ANSWER_RELATIONSHIP_UNVERIFIED",
    ]);
    expect(curriculum).toHaveLength(4);
    expect(
      acceptance.diagnostics.every(
        (diagnostic) => diagnostic.verdict === "warning"
      )
    ).toBeTruthy();
  });

  it("B6: one wrong pair is blocked by the pack's whole-number answer rule", async () => {
    const correct = await accept(
      buildDraft(wordProblemPairs, operationsSteps),
      operationsContext
    );
    const wrongDraft = buildDraft(
      withOneWrongPair(wordProblemPairs),
      operationsSteps
    );
    expect(
      validateProviderDraft(wrongDraft, { expectedLanguage: "en" }).ok
    ).toBeTruthy();

    const wrong = await accept(wrongDraft, operationsContext);
    const curriculum = curriculumFindings(wrong.diagnostics);

    expect(
      validateProviderDraft(wrongDraft, { expectedLanguage: "en" }).ok
    ).toBeTruthy();
    expect({
      correctState: correct.state,
      wrongState: wrong.state,
      diagnosticsChanged:
        JSON.stringify(wrong.diagnostics) !==
        JSON.stringify(correct.diagnostics),
      codes: codesOf(curriculum),
      mismatches: curriculum.filter(
        (finding) => finding.code === "ANSWER_MISMATCH"
      ).length,
    }).toStrictEqual({
      correctState: "ready-for-review",
      wrongState: "blocked-by-validation",
      diagnosticsChanged: true,
      codes: ["ANSWER_MISMATCH", "ANSWER_RELATIONSHIP_UNVERIFIED"],
      mismatches: 4,
    });
  });
});

describe("standards generalization: control for the answer rule", () => {
  it("the same harness blocks a wrong fraction pair with ANSWER_MISMATCH", async () => {
    const fractionPairs: MatchingPair[] = [
      { source: "1/2", target: "2/3" },
      { source: "1/3", target: "2/6" },
      { source: "3/4", target: "6/8" },
    ];

    const acceptance = await accept(
      buildDraft(fractionPairs, fractionSteps),
      fractionContext
    );

    expect(acceptance.state).toBe("blocked-by-validation");
    expect(codesOf(curriculumFindings(acceptance.diagnostics))).toStrictEqual([
      "ANSWER_MISMATCH",
    ]);
  });
});

describe("standards generalization: RI.5.2 detail -> main-idea matching", () => {
  it("B7: the pack's two-node Grade 4 prerequisite path passes the structural gate", () => {
    const result = validateProviderDraft(
      buildDraft(detailPairs, readingSteps),
      {
        expectedLanguage: "en",
      }
    );

    expect(result.ok).toBeTruthy();
    expect(codesOf(result.diagnostics)).toStrictEqual([]);
  });

  it("B7: the pack's two-node path reaches ready-for-review with teacher review warnings", async () => {
    const acceptance = await accept(
      buildDraft(detailPairs, readingSteps),
      readingContext
    );

    const curriculum = curriculumFindings(acceptance.diagnostics);

    expect(acceptance.state).toBe("ready-for-review");
    expect(codesOf(curriculum)).toStrictEqual([
      "ANSWER_RELATIONSHIP_UNVERIFIED",
    ]);
    expect(curriculum).toHaveLength(12);
    expect(
      curriculum.every((finding) => finding.verdict === "warning")
    ).toBeTruthy();
  });

  it("B7: a detail absent from the pack passage is hard blocked", async () => {
    const [first, ...rest] = detailPairs;
    if (!first) {
      throw new Error("The fixture needs at least one pair.");
    }
    const absentDetailPairs = [
      { ...first, source: "Bees build their hives inside flowers." },
      ...rest,
    ];

    const acceptance = await accept(
      buildDraft(absentDetailPairs, readingSteps),
      readingContext
    );
    const curriculum = curriculumFindings(acceptance.diagnostics);

    expect(acceptance.state).toBe("blocked-by-validation");
    expect(codesOf(curriculum)).toContain("ANSWER_MISMATCH");
    expect(
      curriculum.some(
        (finding) =>
          finding.code === "ANSWER_MISMATCH" && finding.verdict === "hard_block"
      )
    ).toBeTruthy();
  });

  it("B7: the structural gate still refuses a one-node path", () => {
    const targetStep = readingSteps.at(-1);
    if (!targetStep) {
      throw new Error("The pack needs a target node.");
    }

    const result = validateProviderDraft(
      buildDraft(detailPairs, [targetStep]),
      {
        expectedLanguage: "en",
      }
    );

    expect(result.ok).toBeFalsy();
    expect(codesOf(result.diagnostics)).toStrictEqual(["INVALID_CONTRACT"]);
  });
});
