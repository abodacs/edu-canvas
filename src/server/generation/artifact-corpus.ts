import { gateArtifact } from "@/server/safety/artifact-gate";
import {
  buildValidatedLearningPath,
  toNormalizedReasoningPath,
} from "./learning-path";
import {
  semanticValidationRunnerVersion,
  validateSemanticLesson,
} from "./semantic-validation";
import { validateProviderDraft } from "./validation";
import type {
  LessonLanguage,
  RecoveryAction,
  SemanticValidationVerdict,
} from "@/shared/generation-contract";
import type { FractionLessonDraft } from "@/shared/fractions-contract";
import type { A2UICatalogVersion, A2UIMessage } from "@/shared/a2ui-contract";

import type {
  ArtifactGateFinding,
  ArtifactGateResult,
  ArtifactPreRenderFailure,
} from "@/server/safety/artifact-gate";
import type {
  CurriculumNode,
  SemanticValidationReport,
  VersionedCurriculumContext,
} from "./semantic-validation-contract";
import type {
  GenerationDiagnostic,
  ProviderLearningPath,
  ProviderLessonDraft,
  ProviderProvenance,
  ProviderVariant,
  ValidatedLearningPath,
} from "./types";

// One fixture corpus for the Validation & Safety gate. Every seam test (draft
// gate, semantic runner, A2UI compile guard) reads its break fixtures and its
// expected verdict from this module, so a new seam extends one table.
//
// The corpus module stays in `src/server/generation` on purpose: the compile
// guard lives in `src/server/a2ui`, and the dependency boundary forbids the
// drafting context from importing it. The differential oracle test assembles
// both contexts as a test module.

export type CorpusSeam = "draft" | "semantic" | "compile";

export type CorpusSeamVerdict = SemanticValidationVerdict | "not_applicable";

export interface CorpusExpectation {
  readonly code: string;
  readonly validator: ArtifactGateFinding["validator"];
  readonly recovery: RecoveryAction;
}

export interface DraftPlan {
  readonly sourceCount: number;
  readonly language: LessonLanguage;
}

export interface PathPlan {
  readonly nodeCount: number;
  readonly language: LessonLanguage;
  readonly extraEdgeFlags: boolean[];
  readonly arabicLabels: boolean[];
}

export interface ArtifactCorpusCase {
  readonly id: string;
  readonly description: string;
  readonly artifact: CorpusArtifact;
  readonly expectedVerdict: SemanticValidationVerdict;
  readonly expectedFindings: readonly CorpusExpectation[];
  readonly rejectingSeams: readonly CorpusSeam[];
  readonly preRenderFailures?: readonly ArtifactPreRenderFailure[];
  readonly messageMutation?: MessageMutation;
  readonly compileFailure?: CompileFailure;
  readonly compileOutcome: "accept" | "reject" | "not_applicable";
  /**
   * Set when the raw compile guard accepts an artifact the gate hard-blocks.
   * The compile guard only sees the rendered projection, so it cannot observe every draft or semantic rule. The gate stays the stricter seam.
   */
  readonly stricterThanCompile?: string;
}

export interface MessageMutation {
  readonly catalogVersion: A2UICatalogVersion;
  readonly apply: (messages: A2UIMessage[]) => void;
}

export interface CompileFailure {
  readonly code: string;
  readonly messagePattern: RegExp;
}

export type CorpusArtifact =
  | {
      readonly kind: "lesson";
      readonly draft: ProviderLessonDraft;
      readonly learningPath?: ValidatedLearningPath;
      readonly context: VersionedCurriculumContext;
    }
  | {
      readonly kind: "fraction";
      readonly draft: FractionLessonDraft;
    };

export interface DraftMutationProbe {
  readonly name: string;
  readonly expectedCode: string;
  readonly recovery: RecoveryAction;
  readonly rejectingSeams: readonly CorpusSeam[];
  readonly compileOutcome: ArtifactCorpusCase["compileOutcome"];
  readonly stricterThanCompile?: string;
  readonly applies?: (plan: DraftPlan) => boolean;
  readonly apply: (draft: ProviderLessonDraft, plan: DraftPlan) => void;
}

export interface LearningPathMutationProbe {
  readonly name: string;
  readonly expectedCode: string;
  readonly recovery: RecoveryAction;
  readonly rejectingSeams: readonly CorpusSeam[];
  readonly compileOutcome: ArtifactCorpusCase["compileOutcome"];
  readonly stricterThanCompile?: string;
  readonly apply: (proposal: ProviderLearningPath) => void;
}

export interface PreRenderBreakProbe {
  readonly name: string;
  readonly expectation: CorpusExpectation;
  readonly catalogVersion: A2UICatalogVersion;
  readonly apply: (messages: A2UIMessage[]) => void;
}

export interface FractionBreakProbe {
  readonly name: string;
  readonly expectation: CorpusExpectation;
  readonly apply: (draft: FractionLessonDraft) => void;
}

const corpusLanguage: LessonLanguage = "en";
const corpusSourceCount = 6;
const corpusRequestId = "draft_corpus_fixture";
const corpusStandardId = "standard_ccss_4_nf_a_01";
const distractorLabel = "7/2";
const matchingCatalogVersion: A2UICatalogVersion = "matching-v1";
const fractionsCatalogVersion: A2UICatalogVersion = "fractions-v2";

const defaultCorpusPlan: DraftPlan = {
  sourceCount: corpusSourceCount,
  language: corpusLanguage,
};

const corpusProvenance: ProviderProvenance = {
  provider: "artifact-corpus-fixture",
  model: "corpus-model-v1",
  promptTemplateVersion: "corpus-template-v1",
  validatorVersion: "lesson-validator-v2",
};

const corpusNodes: readonly CurriculumNode[] = [
  {
    id: "graph_node_equal_parts",
    label: "Recognise equal parts",
    sequence: 0,
    screenPurposeId: "screen_purpose_equal_parts",
    screenPurpose: "Recognise equal parts of one whole",
  },
  {
    id: "graph_node_equivalent_names",
    label: "Name equivalent fractions",
    sequence: 1,
    screenPurposeId: "screen_purpose_equivalent_names",
    screenPurpose: "Name two fractions for the same part",
  },
  {
    id: "graph_node_equivalent_fractions",
    label: "Match equivalent fractions",
    sequence: 2,
    screenPurposeId: "screen_purpose_equivalent_fractions",
    screenPurpose: "Match equivalent fraction names",
  },
];

export const buildCorpusCurriculumContext = (
  language: LessonLanguage = corpusLanguage
): VersionedCurriculumContext => {
  return {
    tenantId: "tenant_corpus_fixture",
    standardId: corpusStandardId,
    standardCode: "4.NF.A.1",
    grade: 4,
    language,
    graphVersion: "graph-corpus-v1",
    targetNodeId: "graph_node_equivalent_fractions",
    nodes: corpusNodes,
    edges: [
      {
        prerequisiteId: "graph_node_equal_parts",
        successorId: "graph_node_equivalent_names",
      },
      {
        prerequisiteId: "graph_node_equivalent_names",
        successorId: "graph_node_equivalent_fractions",
      },
    ],
  };
};

export const buildCorpusLearningPathProposal = (): NonNullable<
  ProviderLessonDraft["learningPath"]
> => {
  return {
    direction: "forward",
    steps: corpusNodes.map((node) => {
      return {
        nodeId: node.id,
        screenPurposeId: node.screenPurposeId,
      };
    }),
    rationale:
      "Begin with equal parts and walk both prerequisite steps until the matching target appears.",
    nextScreenRationale:
      "The matching screen shows how two fraction names describe the same part.",
  };
};

export const qualifyingExtraPairs = (nodeCount: number): [number, number][] => {
  return Array.from(
    { length: Math.max(0, nodeCount - 2) },
    (_, from) => from
  ).flatMap((from) => {
    return Array.from(
      { length: Math.max(0, nodeCount - 2 - from - 1) },
      (_, offset) => [from, from + 2 + offset] as [number, number]
    );
  });
};

/**
 * A randomized-shape curriculum graph used by the path property. The corpus fixtures use the fixed three-node graph; this generator keeps the independent re-check honest about longer graphs.
 */
export const buildVersionedPlanContext = (
  plan: PathPlan
): VersionedCurriculumContext => {
  const nodes = Array.from(
    { length: plan.nodeCount },
    (_, index): CurriculumNode => {
      return {
        id: `graph_node_${index}`,
        label: `Equal-parts node ${index}`,
        sequence: index,
        screenPurposeId: `screen_purpose_${index}`,
        screenPurpose: `Screen purpose ${index}`,
        ...(plan.arabicLabels[index] && {
          labelAr: "Equivalence nodes Arabic",
          screenPurposeAr: "Screen purpose Arabic",
        }),
      };
    }
  );
  const chainEdges = nodes.slice(1).map((node, index) => {
    return {
      prerequisiteId: nodes[index]?.id ?? "",
      successorId: node.id,
    };
  });
  const extraEdges = qualifyingExtraPairs(plan.nodeCount)
    .filter((_pair, index) => plan.extraEdgeFlags[index])
    .map(([from, to]) => {
      return {
        prerequisiteId: nodes[from]?.id ?? "",
        successorId: nodes[to]?.id ?? "",
      };
    });

  return {
    tenantId: "tenant_demo",
    standardId: "standard_test",
    standardCode: "TEST.1",
    grade: 4,
    language: plan.language,
    graphVersion: "graph-v-test-1",
    targetNodeId: `graph_node_${plan.nodeCount - 1}`,
    nodes,
    edges: [...chainEdges, ...extraEdges],
  };
};

export const buildBaseLearningPathProposal = (
  context: VersionedCurriculumContext
): ProviderLearningPath => {
  const steps = context.nodes.map((node) => {
    return {
      nodeId: node.id,
      screenPurposeId: node.screenPurposeId,
    };
  });
  return {
    direction: "forward" as const,
    steps,
    rationale:
      "Begin with equal parts and walk every prerequisite until the new fraction name appears.",
    nextScreenRationale:
      "The teacher preview shows the matching screen that follows this lesson.",
  };
};

export const buildCorpusLearningPath = (
  language: LessonLanguage = corpusLanguage
): ValidatedLearningPath => {
  return buildValidatedLearningPath({
    proposal: buildCorpusLearningPathProposal(),
    context: buildCorpusCurriculumContext(language),
    draftId: corpusRequestId,
    provenance: corpusProvenance,
    validatorVersion: semanticValidationRunnerVersion,
  });
};

const equivalentTargetLabel = (sourceIndex: number): string =>
  `${(sourceIndex + 1) * 2}/4`;

const configureVariantItems = (
  variant: ProviderVariant,
  sourceCount: number,
  hintCount: number,
  distractorCount: number
): void => {
  const sourceItems = Array.from({ length: sourceCount }, (_, itemIndex) => {
    return {
      id: `${variant.id}-source-${itemIndex}`,
      label: `${itemIndex + 1}/2`,
    };
  });
  const targetItems = sourceItems.map((_item, itemIndex) => {
    return {
      id: `${variant.id}-target-${itemIndex}`,
      label: equivalentTargetLabel(itemIndex),
    };
  });

  variant.sourceItems = sourceItems;
  variant.targetItems = targetItems;
  variant.distractorItems = Array.from(
    { length: distractorCount },
    (_, itemIndex) => {
      return {
        id: `${variant.id}-distractor-${itemIndex}`,
        label: distractorLabel,
      };
    }
  );
  variant.relationships = sourceItems.map((source, itemIndex) => {
    return {
      id: `${variant.id}-relationship-${itemIndex}`,
      sourceId: source.id,
      targetId:
        targetItems[itemIndex]?.id ?? `${variant.id}-target-${itemIndex}`,
    };
  });
  variant.hints = Array.from({ length: hintCount }, (_hint, hintIndex) => {
    return hintIndex === 0
      ? "Compare the equal parts that each fraction names."
      : "Start with the parts you can see, then look for the same amount.";
  });
};

const createVariant = (
  kind: ProviderVariant["kind"],
  variantIndex: number,
  plan: DraftPlan
): ProviderVariant => {
  const variant: ProviderVariant = {
    id: `variant-${variantIndex}`,
    kind,
    title: `Equivalent fractions set ${variantIndex}`,
    instructions: "Match each fraction with another name for the same part.",
    sourceItems: [],
    targetItems: [],
    distractorItems: [],
    relationships: [],
    hints: ["Compare the equal parts that each fraction names."],
    feedback: {
      correct: "These fractions name the same part of a whole.",
      incorrect: "Try comparing the equal parts in each fraction.",
    },
    languageMetadata: {
      language: plan.language,
      direction: plan.language === "ar" ? "rtl" : "ltr",
      locale: plan.language === "ar" ? "ar-SA" : "en-US",
    },
    accessibilityMetadata: {
      instructions: "Instructions for matching equivalent fractions",
      sourceGroupLabel: "Fractions to match",
      targetGroupLabel: "Possible equivalent fractions",
    },
  };
  configureVariantItems(
    variant,
    plan.sourceCount,
    1,
    Math.floor(plan.sourceCount / 4)
  );
  return variant;
};

/**
 * The warning-only base: every variant shares one interaction structure, so the semantic runner warns without hard-blocking.
 */
export const buildValidBaseDraft = (
  plan: DraftPlan = defaultCorpusPlan
): ProviderLessonDraft => {
  return {
    learningPath: buildCorpusLearningPathProposal(),
    variants: (["standard", "standard", "scaffold", "challenge"] as const).map(
      (kind, variantIndex) => createVariant(kind, variantIndex, plan)
    ),
  };
};

/**
 * The passing base: each variant carries a distinct learning move, so the semantic runner emits neither warnings nor hard blocks.
 */
export const buildPassingLessonDraft = (
  plan: DraftPlan = defaultCorpusPlan
): ProviderLessonDraft => {
  const draft = buildValidBaseDraft(plan);
  const [firstStandard, secondStandard, scaffold, challenge] = draft.variants;

  configureVariantItems(firstStandard, 5, 1, 1);
  configureVariantItems(secondStandard, 6, 1, 1);
  configureVariantItems(scaffold, 3, 2, 0);
  configureVariantItems(challenge, 7, 1, 1);

  return draft;
};

/**
 * The semantic answer-key break: the first relationship pairs two fractions that do not name the same part. The draft gate cannot see it and the compile guard never reads relationships; the semantic runner hard-blocks.
 */
export const breakFirstRelationshipAnswer = (
  draft: ProviderLessonDraft
): void => {
  const [firstVariant] = draft.variants;
  const [firstTarget] = firstVariant?.targetItems ?? [];
  if (firstTarget) {
    firstTarget.label = "3/4";
  }
};

export const validFractionDraft: FractionLessonDraft = {
  requestId: "draft_corpus_fraction",
  standardId: corpusStandardId,
  grade: 4,
  language: "en",
  direction: "ltr",
  title: "Equivalent fractions",
  sections: [
    {
      sectionId: "section-equal-parts",
      purpose: "Recognise equal parts",
      stem: "\\frac{1}{2}",
      stemTextEquivalent: "One half.",
      diagramLabel: "Shade one half",
      denominator: 2,
      numerator: 1,
    },
    {
      sectionId: "section-equivalence",
      purpose: "Match equivalent names",
      stem: "\\frac{2}{4} = \\frac{1}{2}",
      diagramLabel: "Shade two quarters",
      denominator: 4,
      numerator: 2,
      advanceLabel: "Finish section",
    },
  ],
};

const languageFlip: Record<LessonLanguage, LessonLanguage> = {
  en: "ar",
  ar: "en",
};

export const draftMutationProbes: readonly DraftMutationProbe[] = [
  {
    name: "a source id reused as a target id",
    expectedCode: "DUPLICATE_ID",
    recovery: "edit",
    rejectingSeams: ["draft"],
    compileOutcome: "accept",
    stricterThanCompile:
      "The compile guard names cards by group and item id, so a cross-list duplicate survives compilation.",
    apply(draft) {
      const [, variant] = draft.variants;
      variant.targetItems[1] = {
        id: variant.sourceItems[1]?.id ?? "reused-source",
        label: "Reused",
      };
    },
  },
  {
    name: "two source items sharing one id",
    expectedCode: "DUPLICATE_ID",
    recovery: "edit",
    rejectingSeams: ["draft", "compile"],
    compileOutcome: "reject",
    apply(draft) {
      const [variant] = draft.variants;
      variant.sourceItems[1] = {
        id: variant.sourceItems[0]?.id ?? "reused-source",
        label: "1/2",
      };
    },
  },
  {
    name: "a distractor past the four-source limit",
    expectedCode: "DISTRACTOR_LIMIT",
    recovery: "edit",
    rejectingSeams: ["draft"],
    compileOutcome: "accept",
    stricterThanCompile:
      "The compile guard renders the distractor list as targets and cannot count the source-to-distractor ratio.",
    applies: (plan) => plan.sourceCount <= 7,
    apply(draft, plan) {
      const [variant] = draft.variants;
      const maximumDistractors = Math.floor(plan.sourceCount / 4);
      variant.distractorItems = Array.from(
        { length: Math.min(maximumDistractors + 1, 2) },
        (_, itemIndex) => {
          return {
            id: `probe-guard-distractor-${itemIndex}`,
            label: "9/4",
          };
        }
      );
    },
  },
  {
    name: "a target requested by two sources",
    expectedCode: "TARGET_REUSED",
    recovery: "edit",
    rejectingSeams: ["draft"],
    compileOutcome: "accept",
    stricterThanCompile:
      "The compile guard receives rendered cards, not the private relationship graph.",
    apply(draft) {
      const [variant] = draft.variants;
      const { relationships } = variant;
      const targetId = relationships[0]?.targetId;
      if (targetId && relationships[2]) {
        relationships[2] = { ...relationships[2], targetId };
      }
    },
  },
  {
    name: "a source item with no relationship",
    expectedCode: "SOURCE_WITHOUT_TARGET",
    recovery: "edit",
    rejectingSeams: ["draft"],
    compileOutcome: "accept",
    stricterThanCompile:
      "The compile guard cannot see which source items are unmatched.",
    apply(draft) {
      const [variant] = draft.variants;
      variant.relationships = variant.relationships.filter(
        (_relationship, index) => index !== 2
      );
    },
  },
  {
    name: "a relationship pointing at an unknown source",
    expectedCode: "UNKNOWN_SOURCE",
    recovery: "edit",
    rejectingSeams: ["draft"],
    compileOutcome: "accept",
    stricterThanCompile:
      "The compile guard never reads relationship endpoints.",
    apply(draft) {
      const [variant] = draft.variants;
      if (variant.relationships[2]) {
        variant.relationships[2].sourceId = "probe-guard-ghost-source";
      }
    },
  },
  {
    name: "a relationship pointing at an unknown target",
    expectedCode: "UNKNOWN_TARGET",
    recovery: "edit",
    rejectingSeams: ["draft"],
    compileOutcome: "accept",
    stricterThanCompile:
      "The compile guard never reads relationship endpoints.",
    apply(draft) {
      const [variant] = draft.variants;
      if (variant.relationships[2]) {
        variant.relationships[2].targetId = "probe-guard-ghost-target";
      }
    },
  },
  {
    name: "a draft leaning on too many standard variants",
    expectedCode: "MISSING_VARIANT_KIND",
    recovery: "edit",
    rejectingSeams: ["draft"],
    compileOutcome: "accept",
    stricterThanCompile:
      "The compile guard never counts variant kinds; it only renders the four variants.",
    apply(draft) {
      const [challenge] = draft.variants.slice(3);
      if (challenge) {
        challenge.kind = "standard";
      }
    },
  },
  {
    name: "a variant without its kind",
    expectedCode: "INVALID_CONTRACT",
    recovery: "edit",
    rejectingSeams: ["draft", "compile"],
    compileOutcome: "reject",
    apply(draft) {
      const [, variant] = draft.variants;
      if (variant) {
        Reflect.deleteProperty(variant, "kind");
      }
    },
  },
  {
    name: "a language the teacher did not request",
    expectedCode: "LANGUAGE_MISMATCH",
    recovery: "edit",
    rejectingSeams: ["draft", "semantic"],
    compileOutcome: "accept",
    stricterThanCompile:
      "The compile guard renders whatever language metadata the draft carries.",
    apply(draft, plan) {
      const [scaffold] = draft.variants.slice(2);
      if (scaffold) {
        scaffold.languageMetadata = {
          language: languageFlip[plan.language],
          direction: plan.language === "ar" ? "ltr" : "rtl",
          locale: plan.language === "ar" ? "en-US" : "ar-SA",
        };
      }
    },
  },
  {
    name: "a direction that contradicts the requested language",
    expectedCode: "DIRECTION_MISMATCH",
    recovery: "edit",
    rejectingSeams: ["draft", "semantic"],
    compileOutcome: "accept",
    stricterThanCompile:
      "The compile guard copies direction into the data model without cross-checking the request.",
    apply(draft, plan) {
      const [, secondStandard] = draft.variants;
      if (secondStandard) {
        secondStandard.languageMetadata = {
          ...secondStandard.languageMetadata,
          direction: plan.language === "ar" ? "ltr" : "rtl",
        };
      }
    },
  },
  {
    name: "script markup inside teacher copy",
    expectedCode: "EXECUTABLE_CONTENT",
    recovery: "replace",
    rejectingSeams: ["draft", "semantic", "compile"],
    compileOutcome: "reject",
    apply(draft) {
      const [variant] = draft.variants;
      const [source] = variant?.sourceItems ?? [];
      if (source) {
        source.label = "<script>alert(1)</script>";
      }
    },
  },
  {
    name: "an untrusted field smuggled into a variant",
    expectedCode: "UNTRUSTED_FIELD",
    recovery: "replace",
    rejectingSeams: ["draft"],
    compileOutcome: "accept",
    stricterThanCompile:
      "The compile guard only reads named draft fields, so an extra field never reaches a surface.",
    apply(draft) {
      const [variant] = draft.variants as (ProviderVariant & {
        untrustedField?: string;
      })[];
      if (variant) {
        variant.untrustedField = "smuggled";
      }
    },
  },
  {
    name: "a draft with no hints",
    expectedCode: "INVALID_CONTRACT",
    recovery: "edit",
    rejectingSeams: ["draft"],
    compileOutcome: "accept",
    stricterThanCompile:
      "The compile guard does not render hints, so an empty hint list still compiles.",
    apply(draft) {
      const [variant] = draft.variants;
      if (variant) {
        variant.hints = [];
      }
    },
  },
  {
    name: "a relationship id reused inside one variant",
    expectedCode: "DUPLICATE_ID",
    recovery: "edit",
    rejectingSeams: ["draft"],
    compileOutcome: "accept",
    stricterThanCompile:
      "The compile guard never reads relationship identifiers.",
    apply(draft) {
      const [variant] = draft.variants;
      if (variant?.relationships[2] && variant.relationships[1]) {
        variant.relationships[2].id = variant.relationships[1].id;
      }
    },
  },
];

export const learningPathMutationProbes: readonly LearningPathMutationProbe[] =
  [
    {
      name: "a reversed prerequisite walk",
      expectedCode: "INVALID_PATH_EDGE",
      recovery: "edit",
      rejectingSeams: ["semantic"],
      compileOutcome: "accept",
      stricterThanCompile:
        "The compile guard renders the accepted path shape and never re-walks graph edges.",
      apply(proposal) {
        proposal.direction = "reverse";
      },
    },
    {
      name: "a single-step path",
      expectedCode: "INVALID_CONTRACT",
      recovery: "edit",
      rejectingSeams: ["draft"],
      compileOutcome: "accept",
      stricterThanCompile:
        "The compile guard receives the accepted path, not the rejected proposal.",
      apply(proposal) {
        proposal.steps = proposal.steps.slice(0, 1);
      },
    },
    {
      name: "a repeated node",
      expectedCode: "PATH_CYCLE",
      recovery: "edit",
      rejectingSeams: ["semantic"],
      compileOutcome: "accept",
      stricterThanCompile:
        "The compile guard does not check path node uniqueness.",
      apply(proposal) {
        const [firstStep] = proposal.steps;
        if (firstStep) {
          proposal.steps.splice(2, 0, {
            nodeId: firstStep.nodeId,
            screenPurposeId: firstStep.screenPurposeId,
          });
        }
      },
    },
    {
      name: "an unknown curriculum node",
      expectedCode: "UNKNOWN_PATH_NODE",
      recovery: "edit",
      rejectingSeams: ["semantic"],
      compileOutcome: "accept",
      stricterThanCompile:
        "The compile guard accepts any identifier-shaped node id in the path data model.",
      apply(proposal) {
        const [, step] = proposal.steps;
        if (step) {
          step.nodeId = "graph_node_ghost";
        }
      },
    },
    {
      name: "an unapproved screen purpose",
      expectedCode: "UNAPPROVED_SCREEN_PURPOSE",
      recovery: "edit",
      rejectingSeams: ["semantic"],
      compileOutcome: "accept",
      stricterThanCompile:
        "The compile guard copies screen purposes without re-checking the curriculum graph.",
      apply(proposal) {
        const [, step] = proposal.steps;
        if (step) {
          step.screenPurposeId = "screen_purpose_ghost";
        }
      },
    },
    {
      name: "a skipped prerequisite edge",
      expectedCode: "INVALID_PATH_EDGE",
      recovery: "edit",
      rejectingSeams: ["semantic"],
      compileOutcome: "accept",
      stricterThanCompile:
        "The compile guard renders adjacent path steps without checking approved edges.",
      apply(proposal) {
        proposal.steps = proposal.steps.filter(
          (_step, index, steps) => index === 0 || index === steps.length - 1
        );
      },
    },
    {
      name: "a path that stops one node short of the target",
      expectedCode: "PATH_TARGET_MISMATCH",
      recovery: "edit",
      rejectingSeams: ["semantic"],
      compileOutcome: "accept",
      stricterThanCompile:
        "The compile guard does not know which node the request targeted.",
      apply(proposal) {
        proposal.steps = proposal.steps.slice(0, -1);
      },
    },
    {
      name: "copy that exposes the answer key",
      expectedCode: "INVALID_CONTRACT",
      recovery: "edit",
      rejectingSeams: ["draft"],
      compileOutcome: "accept",
      stricterThanCompile:
        "The compile guard allows learner-safe text and does not scan for answer-key wording.",
      apply(proposal) {
        proposal.rationale = "reveal the answer key";
      },
    },
  ];

interface RawComponentsMessage {
  readonly updateComponents: {
    readonly components: Record<string, unknown>[];
  };
}

const findUpdateComponents = (
  messages: readonly A2UIMessage[]
): RawComponentsMessage => {
  const message = messages.find((candidate) => "updateComponents" in candidate);
  if (!message || !("updateComponents" in message)) {
    throw new Error("The compiled corpus artifact has no components message.");
  }
  return message as unknown as RawComponentsMessage;
};

const findCreateSurface = (
  messages: readonly A2UIMessage[]
): { createSurface: { catalogId: string } } => {
  const message = messages.find((candidate) => "createSurface" in candidate);
  if (!message || !("createSurface" in message)) {
    throw new Error("The compiled corpus artifact has no surface message.");
  }
  return message as unknown as { createSurface: { catalogId: string } };
};

const findDataModel = (
  messages: readonly A2UIMessage[]
): { updateDataModel: { value: Record<string, unknown> } } => {
  const message = messages.find((candidate) => "updateDataModel" in candidate);
  if (!message || !("updateDataModel" in message)) {
    throw new Error("The compiled corpus artifact has no data-model message.");
  }
  return message as unknown as {
    updateDataModel: { value: Record<string, unknown> };
  };
};

const mutateFirstComponent = (
  messages: readonly A2UIMessage[],
  mutate: (component: Record<string, unknown>) => void
): void => {
  const { updateComponents } = findUpdateComponents(messages);
  const [first] = updateComponents.components;
  if (first) {
    mutate(first);
  }
};

export const preRenderBreakProbes: readonly PreRenderBreakProbe[] = [
  {
    name: "an unknown A2UI component",
    expectation: {
      code: "UNKNOWN_COMPONENT",
      validator: "structural",
      recovery: "replace",
    },
    catalogVersion: matchingCatalogVersion,
    apply(messages) {
      mutateFirstComponent(messages, (component) => {
        component.component = "Marquee";
      });
    },
  },
  {
    name: "an unknown A2UI action",
    expectation: {
      code: "UNKNOWN_ACTION",
      validator: "structural",
      recovery: "replace",
    },
    catalogVersion: matchingCatalogVersion,
    apply(messages) {
      const { updateComponents } = findUpdateComponents(messages);
      const { components } = updateComponents;
      const matchCard = components.find(
        (component) => component.component === "MatchCard"
      );
      const action = matchCard?.action as { event?: { name?: string } };
      if (action.event) {
        action.event.name = "teleport";
      }
    },
  },
  {
    name: "a catalog foreign to the preview",
    expectation: {
      code: "UNSUPPORTED_CATALOG",
      validator: "structural",
      recovery: "replace",
    },
    catalogVersion: matchingCatalogVersion,
    apply(messages) {
      findCreateSurface(messages).createSurface.catalogId =
        "https://edu-canvas.app/a2ui/v0.9.1/catalogs/foreign-v9";
    },
  },
  {
    name: "duplicate component identifiers",
    expectation: {
      code: "DUPLICATE_COMPONENT",
      validator: "structural",
      recovery: "edit",
    },
    catalogVersion: matchingCatalogVersion,
    apply(messages) {
      const { updateComponents } = findUpdateComponents(messages);
      const { components } = updateComponents;
      const [first, second] = components;
      if (first && second) {
        second.id = first.id;
      }
    },
  },
  {
    name: "an unsafe payload field",
    expectation: {
      code: "UNSAFE_PAYLOAD",
      validator: "structural",
      recovery: "replace",
    },
    catalogVersion: matchingCatalogVersion,
    apply(messages) {
      const { updateDataModel } = findDataModel(messages);
      updateDataModel.value.answerKey = "2/4";
    },
  },
  {
    name: "a fraction component from another catalog",
    expectation: {
      code: "UNKNOWN_COMPONENT",
      validator: "structural",
      recovery: "replace",
    },
    catalogVersion: fractionsCatalogVersion,
    apply(messages) {
      const { updateComponents } = findUpdateComponents(messages);
      const mathText = updateComponents.components.find(
        (component) => component.component === "MathText"
      );
      if (mathText) {
        mathText.component = "MatchCard";
      }
    },
  },
];

export const fractionBreakProbes: readonly FractionBreakProbe[] = [
  {
    name: "fraction math that does not parse",
    expectation: {
      code: "INVALID_MATH",
      validator: "structural",
      recovery: "edit",
    },
    apply(draft) {
      const [firstSection] = draft.sections;
      if (firstSection) {
        firstSection.stem = "\\frac{1}";
      }
    },
  },
  {
    name: "a foreign fraction draft shape",
    expectation: {
      code: "INVALID_CONTRACT",
      validator: "structural",
      recovery: "edit",
    },
    apply(draft) {
      Reflect.deleteProperty(draft, "sections");
    },
  },
];

const lessonArtifact = (
  draft: ProviderLessonDraft,
  learningPath: ValidatedLearningPath | null = buildCorpusLearningPath()
): CorpusArtifact => {
  return {
    kind: "lesson",
    draft,
    ...(learningPath && { learningPath }),
    context: buildCorpusCurriculumContext(
      draft.variants[0]?.languageMetadata.language ?? corpusLanguage
    ),
  };
};

const warningOnlyCase: ArtifactCorpusCase = {
  id: "valid-warning-only-lesson",
  description:
    "A valid draft whose variants share one structure; the semantic runner warns without blocking.",
  artifact: lessonArtifact(buildValidBaseDraft()),
  expectedVerdict: "warning",
  expectedFindings: [
    {
      code: "VARIANT_NOT_MEANINGFULLY_DIFFERENT",
      validator: "learning-quality",
      recovery: "edit",
    },
  ],
  rejectingSeams: [],
  compileOutcome: "accept",
};

const passingLessonCase: ArtifactCorpusCase = {
  id: "valid-lesson",
  description: "A differentiated four-variant lesson that clears every seam.",
  artifact: lessonArtifact(buildPassingLessonDraft()),
  expectedVerdict: "pass",
  expectedFindings: [],
  rejectingSeams: [],
  compileOutcome: "accept",
};

const draftBreakCases = (): ArtifactCorpusCase[] => {
  const plan: DraftPlan = {
    sourceCount: corpusSourceCount,
    language: corpusLanguage,
  };
  return draftMutationProbes
    .filter((probe) => !probe.applies || probe.applies(plan))
    .map((probe) => {
      const draft = buildValidBaseDraft(plan);
      probe.apply(draft, plan);
      return {
        id: `draft-${probe.name.replaceAll(/\s+/gu, "-")}`,
        description: probe.name,
        artifact: lessonArtifact(draft),
        expectedVerdict: "hard_block",
        expectedFindings: [
          {
            code: probe.expectedCode,
            validator: "structural",
            recovery: probe.recovery,
          },
        ],
        rejectingSeams: probe.rejectingSeams,
        compileOutcome: probe.compileOutcome,
        ...(probe.stricterThanCompile && {
          stricterThanCompile: probe.stricterThanCompile,
        }),
      };
    });
};

const learningPathBreakCases = (): ArtifactCorpusCase[] => {
  return learningPathMutationProbes.map((probe) => {
    const draft = buildPassingLessonDraft();
    const proposal = structuredClone(buildCorpusLearningPathProposal());
    probe.apply(proposal);
    draft.learningPath = proposal;
    return {
      id: `path-${probe.name.replaceAll(/\s+/gu, "-")}`,
      description: probe.name,
      artifact: lessonArtifact(draft),
      expectedVerdict: "hard_block",
      expectedFindings: [
        {
          code: probe.expectedCode,
          validator:
            probe.expectedCode === "INVALID_CONTRACT"
              ? "structural"
              : "curriculum",
          recovery: probe.recovery,
        },
      ],
      rejectingSeams: probe.rejectingSeams,
      compileOutcome: probe.compileOutcome,
      ...(probe.stricterThanCompile && {
        stricterThanCompile: probe.stricterThanCompile,
      }),
    };
  });
};

const missingLearningPathCase: ArtifactCorpusCase = {
  id: "path-missing",
  description: "A draft with no learning path proposal.",
  artifact: lessonArtifact(buildPassingLessonDraft(), null),
  expectedVerdict: "hard_block",
  expectedFindings: [
    {
      code: "LEARNING_PATH_MISSING",
      validator: "structural",
      recovery: "edit",
    },
  ],
  rejectingSeams: ["compile"],
  compileOutcome: "reject",
};

const preRenderBreakCases = (): ArtifactCorpusCase[] => {
  const passingDraft = buildPassingLessonDraft();
  const passingPath = buildCorpusLearningPath();
  return preRenderBreakProbes.map((probe) => {
    return {
      id: `pre-render-${probe.name.replaceAll(/\s+/gu, "-")}`,
      description: probe.name,
      artifact: lessonArtifact(passingDraft, passingPath),
      expectedVerdict: "hard_block",
      expectedFindings: [probe.expectation],
      rejectingSeams: ["compile"],
      preRenderFailures: [
        {
          code: probe.expectation.code,
          field: "preview",
          reason: `The preview was blocked by ${probe.name}.`,
        },
      ],
      messageMutation: {
        catalogVersion: probe.catalogVersion,
        apply: probe.apply,
      },
      compileOutcome: "reject",
    };
  });
};

const fractionCases = (): ArtifactCorpusCase[] => {
  const validCase: ArtifactCorpusCase = {
    id: "valid-fraction-lesson",
    description:
      "A fractions-v2 lesson that compiles under its pinned catalog.",
    artifact: { kind: "fraction", draft: validFractionDraft },
    expectedVerdict: "pass",
    expectedFindings: [],
    rejectingSeams: [],
    compileOutcome: "accept",
  };

  return [
    validCase,
    ...fractionBreakProbes.map((probe) => {
      const draft = structuredClone(validFractionDraft);
      probe.apply(draft);
      return {
        id: `fraction-${probe.name.replaceAll(/\s+/gu, "-")}`,
        description: probe.name,
        artifact: { kind: "fraction" as const, draft },
        expectedVerdict: "hard_block" as const,
        expectedFindings: [probe.expectation],
        rejectingSeams: ["compile" as const],
        preRenderFailures: [
          {
            code: probe.expectation.code,
            field: "preview",
            reason: `The fraction preview was blocked by ${probe.name}.`,
          },
        ],
        compileFailure: {
          code: probe.expectation.code,
          messagePattern: /fraction|contract|math/iu,
        },
        compileOutcome: "reject" as const,
      };
    }),
  ];
};

const answerMismatchCase = (): ArtifactCorpusCase => {
  const draft = buildPassingLessonDraft();
  breakFirstRelationshipAnswer(draft);
  return {
    id: "semantic-answer-mismatch",
    description:
      "A relationship pairs fractions that do not name the same part; only the semantic runner sees it.",
    artifact: lessonArtifact(draft),
    expectedVerdict: "hard_block",
    expectedFindings: [
      {
        code: "ANSWER_MISMATCH",
        validator: "curriculum",
        recovery: "edit",
      },
    ],
    rejectingSeams: ["semantic"],
    compileOutcome: "accept",
    stricterThanCompile:
      "The compile guard renders the card labels but never evaluates the fraction relationship.",
  };
};

export const artifactCorpus: readonly ArtifactCorpusCase[] = [
  passingLessonCase,
  warningOnlyCase,
  ...draftBreakCases(),
  ...learningPathBreakCases(),
  missingLearningPathCase,
  answerMismatchCase(),
  ...preRenderBreakCases(),
  ...fractionCases(),
];

export interface CorpusEvaluation {
  readonly structural: {
    readonly verdict: CorpusSeamVerdict;
    readonly diagnostics: readonly GenerationDiagnostic[];
  };
  readonly semantic: {
    readonly verdict: CorpusSeamVerdict;
    readonly report?: SemanticValidationReport;
  };
  readonly gate: ArtifactGateResult;
}

const structuralVerdict = (
  diagnostics: readonly GenerationDiagnostic[]
): CorpusSeamVerdict => {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "hard_block";
  }
  return diagnostics.some((diagnostic) => diagnostic.severity === "warning")
    ? "warning"
    : "pass";
};

export const evaluateCorpusArtifact = async (
  entry: ArtifactCorpusCase
): Promise<CorpusEvaluation> => {
  if (entry.artifact.kind === "fraction") {
    const gate = gateArtifact({
      kind: "fraction",
      draft: entry.artifact.draft,
      ...(entry.preRenderFailures && {
        preRenderFailures: entry.preRenderFailures,
      }),
    });
    return {
      structural: { verdict: "not_applicable", diagnostics: [] },
      semantic: { verdict: "not_applicable" },
      gate,
    };
  }

  const { draft, context, learningPath } = entry.artifact;
  const structuralResult = validateProviderDraft(draft, {
    expectedLanguage: context.language,
  });
  const structural = {
    verdict: structuralVerdict(structuralResult.diagnostics),
    diagnostics: structuralResult.diagnostics,
  };

  let semantic: CorpusEvaluation["semantic"] = { verdict: "not_applicable" };
  if (structuralResult.ok) {
    const report = await validateSemanticLesson({
      draft: structuralResult.draft,
      context,
      ...(draft.learningPath && {
        path: toNormalizedReasoningPath(draft.learningPath),
      }),
    });
    semantic = { verdict: report.verdict, report };
  }

  const gate = gateArtifact({
    kind: "lesson",
    draft,
    ...(learningPath && { learningPath }),
    ...(semantic.report && { report: semantic.report }),
    structuralDiagnostics: structuralResult.diagnostics,
    ...(entry.preRenderFailures && {
      preRenderFailures: entry.preRenderFailures,
    }),
  });

  return { structural, semantic, gate };
};
