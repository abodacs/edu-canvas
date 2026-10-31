import {
  array,
  assert as assertProperty,
  boolean,
  constantFrom,
  integer,
  jsonValue,
  property,
} from "fast-check";
import { describe, expect, it } from "vitest";

import { buildStoryPlan, StoryPlanBuildError } from "@/shared/story-plan";
import {
  buildValidatedLearningPath,
  LearningPathBuildError,
} from "./learning-path";
import { validateProviderDraft } from "./validation";
import type { ProviderProvenance } from "./provider";
import type {
  CurriculumNode,
  VersionedCurriculumContext,
} from "./semantic-validation-contract";
import type {
  ProviderLessonDraft,
  ProviderVariant,
  ValidatedLearningPath,
} from "./types";
import type { LessonLanguage } from "@/shared/generation-contract";

// Property checks for the Validation & Safety gate. Run directly with
// `pnpm verify:lesson-gate`; the operating skill lives in
// .agents/skills/verify-lesson-gate.

interface DraftPlan {
  sourceCount: number;
  language: LessonLanguage;
}

const propertyOptions = () => {
  return {
    numRuns: Number(process.env.LESSON_GATE_RUNS ?? 200),
    // Pinned so a counterexample reproduces byte-for-byte on rerun.
    seed: Number(process.env.LESSON_GATE_SEED ?? 12_345),
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// ------------------------------------------------------------------
// Draft gate: `validateProviderDraft` denies provider output that is
// unsafe or malformed. The re-check below re-derives each rule the
// gate implements; the properties hold the gate to it.
// ------------------------------------------------------------------

const executableCopyPatterns: RegExp[] = [
  /<\s*\/?(?:script|iframe|object|embed|style)/iu,
  /javascript\s*:/iu,
  /on[a-z]+\s*=/iu,
];

const hasExecutableCopy = (value: string): boolean =>
  executableCopyPatterns.some((pattern) => pattern.test(value));

const collectExecutableCopy = (value: unknown, where: string): string[] => {
  if (typeof value === "string") {
    return hasExecutableCopy(value)
      ? [`Executable copy inside ${where}: ${JSON.stringify(value)}.`]
      : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectExecutableCopy(entry, `${where}[${index}]`)
    );
  }
  return isRecord(value)
    ? Object.entries(value).flatMap(([key, entry]) =>
        collectExecutableCopy(entry, `${where}.${key}`)
      )
    : [];
};

const expectedVariantMix: Record<string, number> = {
  standard: 2,
  scaffold: 1,
  challenge: 1,
};

const DIRECTION_BY_LANGUAGE = { en: "ltr", ar: "rtl" } as const;

type IdRegistrar = (id: unknown, label: string) => void;

const collectItemIds = (
  field: string,
  variant: Record<string, unknown>,
  registerUnique: IdRegistrar,
  violations: string[]
): string[] => {
  const list = variant[field];
  if (!Array.isArray(list)) {
    violations.push(`Accepted ${field} must be an item list.`);
    return [];
  }
  return list.flatMap((item, itemIndex) => {
    if (!isRecord(item) || typeof item.id !== "string") {
      violations.push(`Accepted ${field}[${itemIndex}] must keep a string id.`);
      return [];
    }
    registerUnique(item.id, `${field}[${itemIndex}] id`);
    return [item.id];
  });
};

const checkAcceptedItems = (
  variant: Record<string, unknown>,
  registerUnique: IdRegistrar,
  violations: string[]
): { sourceIds: string[]; targetIds: string[] } => {
  const sourceIds = collectItemIds(
    "sourceItems",
    variant,
    registerUnique,
    violations
  );
  const targetIds = collectItemIds(
    "targetItems",
    variant,
    registerUnique,
    violations
  );
  const distractorIds = collectItemIds(
    "distractorItems",
    variant,
    registerUnique,
    violations
  );

  const maximumDistractors = Math.floor(sourceIds.length / 4);
  if (distractorIds.length > maximumDistractors) {
    violations.push(
      `Accepted variant carries ${distractorIds.length} distractor(s) for ${sourceIds.length} source item(s).`
    );
  }
  return { sourceIds, targetIds };
};

const checkAcceptedRelationship = (
  candidate: unknown,
  sourceIdSet: Set<string>,
  targetIdSet: Set<string>,
  ownersByTarget: Map<string, Set<string>>,
  registerUnique: IdRegistrar,
  violations: string[]
): void => {
  if (!isRecord(candidate)) {
    violations.push("Accepted relationships must be objects.");
    return;
  }
  registerUnique(candidate.id, "relationship id");
  const { sourceId, targetId } = candidate;
  if (typeof sourceId !== "string" || !sourceIdSet.has(sourceId)) {
    violations.push(
      `Accepted relationship points at the unknown source ${JSON.stringify(sourceId)}.`
    );
    return;
  }
  if (typeof targetId !== "string" || !targetIdSet.has(targetId)) {
    violations.push(
      `Accepted relationship points at the unknown target ${JSON.stringify(targetId)}.`
    );
    return;
  }

  const owners = ownersByTarget.get(targetId) ?? new Set<string>();
  owners.add(sourceId);
  ownersByTarget.set(targetId, owners);
};

const checkAcceptedRelationships = (
  variant: Record<string, unknown>,
  sourceIds: string[],
  targetIds: string[],
  registerUnique: IdRegistrar,
  violations: string[]
): void => {
  const sourceIdSet = new Set(sourceIds);
  const targetIdSet = new Set(targetIds);
  const ownersByTarget = new Map<string, Set<string>>();
  const { relationships } = variant;
  if (!Array.isArray(relationships)) {
    violations.push("Accepted relationships must be a list.");
    return;
  }

  for (const candidate of relationships) {
    const relationship = candidate;
    checkAcceptedRelationship(
      relationship,
      sourceIdSet,
      targetIdSet,
      ownersByTarget,
      registerUnique,
      violations
    );
  }

  for (const targetId of targetIdSet) {
    const owners = ownersByTarget.get(targetId);
    if (!owners) {
      violations.push(
        `Accepted target ${targetId} is never matched by a source.`
      );
    } else if (owners.size > 1) {
      violations.push(`Accepted target ${targetId} is reused by two sources.`);
    }
  }
};

const checkAcceptedLanguage = (
  variant: Record<string, unknown>,
  expectedLanguage: LessonLanguage,
  violations: string[]
): void => {
  const { languageMetadata } = variant;
  if (!isRecord(languageMetadata)) {
    return;
  }
  if (languageMetadata.language !== expectedLanguage) {
    violations.push(
      `Accepted variant must use the requested language ${expectedLanguage}.`
    );
  }
  if (languageMetadata.direction !== DIRECTION_BY_LANGUAGE[expectedLanguage]) {
    violations.push(
      "Accepted variant must use the direction required by its language."
    );
  }
};

const checkAcceptedVariant = (
  candidate: unknown,
  expectedLanguage: LessonLanguage,
  kindCounts: Map<string, number>,
  registerUnique: IdRegistrar,
  violations: string[]
): void => {
  if (!isRecord(candidate)) {
    violations.push("The gate must only accept variant objects.");
    return;
  }
  const variant = candidate;

  const { kind } = variant;
  if (typeof kind === "string") {
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  } else {
    violations.push("Accepted variants must name their kind.");
  }

  const { sourceIds, targetIds } = checkAcceptedItems(
    variant,
    registerUnique,
    violations
  );
  checkAcceptedRelationships(
    variant,
    sourceIds,
    targetIds,
    registerUnique,
    violations
  );
  checkAcceptedLanguage(variant, expectedLanguage, violations);
};

const checkAcceptedDraft = (
  draft: unknown,
  expectedLanguage: LessonLanguage
): string[] => {
  const violations: string[] = collectExecutableCopy(draft, "accepted draft");

  if (!isRecord(draft) || !Array.isArray(draft.variants)) {
    return [...violations, "The gate must only accept a draft with variants."];
  }
  if (draft.variants.length !== 4) {
    violations.push("The gate must only accept exactly four variants.");
  }

  const kindCounts = new Map<string, number>();
  const ids = new Set<string>();
  const registerUnique: IdRegistrar = (id, label) => {
    if (typeof id !== "string" || id.length === 0) {
      violations.push(`Accepted ${label} must keep a nonempty string id.`);
      return;
    }
    if (ids.has(id)) {
      violations.push(`Accepted ${label} repeats the id ${id}.`);
    }
    ids.add(id);
  };

  for (const candidate of draft.variants) {
    if (!isRecord(candidate)) {
      violations.push("The gate must only accept variant objects.");
      continue;
    }
    const variant = candidate;
    registerUnique(variant.id, `variant id`);
    checkAcceptedVariant(
      variant,
      expectedLanguage,
      kindCounts,
      registerUnique,
      violations
    );
  }

  for (const [kind, expectedCount] of Object.entries(expectedVariantMix)) {
    if ((kindCounts.get(kind) ?? 0) !== expectedCount) {
      violations.push(
        `The gate must require ${expectedCount} ${kind} variant(s).`
      );
    }
  }

  return violations;
};

const buildValidBaseDraft = (
  sourceCount: number,
  language: LessonLanguage
): ProviderLessonDraft => {
  return {
    variants: (["standard", "standard", "scaffold", "challenge"] as const).map(
      (kind, variantIndex): ProviderVariant => {
        const sourceItems = Array.from(
          { length: sourceCount },
          (_, itemIndex) => {
            return {
              id: `variant-${variantIndex}-source-${itemIndex}`,
              label: `${itemIndex + 1}/2`,
            };
          }
        );
        const targetItems = sourceItems.map((_, itemIndex) => {
          return {
            id: `variant-${variantIndex}-target-${itemIndex}`,
            label: `${itemIndex + 1}/1`,
          };
        });
        const distractorItems = Array.from(
          { length: Math.floor(sourceCount / 4) },
          (_, itemIndex) => {
            return {
              id: `variant-${variantIndex}-distractor-${itemIndex}`,
              label: "7/2",
            };
          }
        );

        return {
          id: `variant-${variantIndex}`,
          kind,
          title: `Equivalent fractions set ${variantIndex}`,
          instructions:
            "Match each fraction with another name for the same part.",
          sourceItems,
          targetItems,
          distractorItems,
          relationships: sourceItems.map((source, itemIndex) => {
            return {
              id: `variant-${variantIndex}-relationship-${itemIndex}`,
              sourceId: source.id,
              targetId: targetItems[itemIndex].id,
            };
          }),
          hints: ["Look for fractions that name the same portion of a whole."],
          feedback: {
            correct: "These fractions name the same part of a whole.",
            incorrect: "Try comparing the equal parts in each fraction.",
          },
          languageMetadata: {
            language,
            direction: language === "ar" ? "rtl" : "ltr",
            locale: language === "ar" ? "ar-SA" : "en-US",
          },
          accessibilityMetadata: {
            instructions: "Instructions for matching equivalent fractions",
            sourceGroupLabel: "Fractions to match",
            targetGroupLabel: "Possible equivalent fractions",
          },
        };
      }
    ),
  };
};

const draftPlanArb = integer({ min: 3, max: 8 }).chain((sourceCount) =>
  constantFrom("en", "ar").map((language) => ({ sourceCount, language }))
);

const languageFlip: Record<LessonLanguage, LessonLanguage> = {
  en: "ar",
  ar: "en",
};

interface DraftMutationProbe {
  name: string;
  expectedCode: string;
  applies?: ({ sourceCount }: { sourceCount: number }) => boolean;
  apply: (draft: ProviderLessonDraft, plan: DraftPlan) => void;
}

const draftMutationProbes: DraftMutationProbe[] = [
  {
    name: "a source id reused as a target id",
    expectedCode: "DUPLICATE_ID",
    apply(draft) {
      const [, variant] = draft.variants;
      variant.targetItems[1] = {
        id: variant.sourceItems[1].id,
        label: "Reused",
      };
    },
  },
  {
    name: "a distractor past the four-source limit",
    expectedCode: "DISTRACTOR_LIMIT",
    // At eight source items the contract itself caps distractors at two,
    // so the probe only exercises the limit rule below the contract cap.
    applies: ({ sourceCount }) => sourceCount <= 7,
    apply(draft, plan) {
      const [variant] = draft.variants;
      const maximumDistractors = Math.floor(plan.sourceCount / 4);
      variant.distractorItems = Array.from(
        // The contract itself caps the distractor list at two items, so
        // cap the overflow there; below eight source items one more
        // distractor than the limit still fits the contract shape.
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
    apply(draft) {
      const [variant] = draft.variants;
      const { relationships } = variant;
      relationships[2] = {
        ...relationships[2],
        targetId: relationships[0].targetId,
      };
    },
  },
  {
    name: "a source item with no relationship",
    expectedCode: "SOURCE_WITHOUT_TARGET",
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
    apply(draft) {
      const [variant] = draft.variants;
      variant.relationships[2].sourceId = "probe-guard-ghost-source";
    },
  },
  {
    name: "a relationship pointing at an unknown target",
    expectedCode: "UNKNOWN_TARGET",
    apply(draft) {
      const [variant] = draft.variants;
      variant.relationships[2].targetId = "probe-guard-ghost-target";
    },
  },
  {
    name: "a draft leaning on too many standard variants",
    expectedCode: "MISSING_VARIANT_KIND",
    apply(draft) {
      draft.variants[3].kind = "standard";
    },
  },
  {
    name: "a language the teacher did not request",
    expectedCode: "LANGUAGE_MISMATCH",
    apply(draft, plan) {
      draft.variants[2].languageMetadata = {
        language: languageFlip[plan.language],
        direction: plan.language === "ar" ? "ltr" : "rtl",
        locale: plan.language === "ar" ? "en-US" : "ar-SA",
      };
    },
  },
  {
    name: "script markup inside teacher copy",
    expectedCode: "EXECUTABLE_CONTENT",
    apply(draft) {
      const [variant] = draft.variants;
      variant.instructions = "<script>alert(1)</script>";
    },
  },
  {
    name: "an untrusted field smuggled into a variant",
    expectedCode: "UNTRUSTED_FIELD",
    apply(draft) {
      const [variant] = draft.variants as (ProviderVariant & {
        untrustedField?: string;
      })[];
      variant.untrustedField = "smuggled";
    },
  },
  {
    name: "a draft with no hints",
    expectedCode: "INVALID_CONTRACT",
    apply(draft) {
      const [variant] = draft.variants;
      variant.hints = [];
    },
  },
  {
    name: "a relationship id reused inside one variant",
    expectedCode: "DUPLICATE_ID",
    apply(draft) {
      const [variant] = draft.variants;
      const { relationships } = variant;
      relationships[2].id = relationships[1].id;
    },
  },
];

// ------------------------------------------------------------------
// Learning path gate: `buildValidatedLearningPath` accepts a provider
// proposal for a teacher preview. The context is built from a random
// plan; the properties pin the accepted path to the context.
// ------------------------------------------------------------------

interface PathPlan {
  nodeCount: number;
  language: LessonLanguage;
  extraEdgeFlags: boolean[];
  arabicLabels: boolean[];
}

const qualifyingExtraPairs = (nodeCount: number): [number, number][] => {
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

const pathPlanArb = integer({ min: 3, max: 6 }).chain((nodeCount) => {
  return array(boolean(), {
    minLength: qualifyingExtraPairs(nodeCount).length,
    maxLength: qualifyingExtraPairs(nodeCount).length,
  }).chain((extraEdgeFlags) => {
    return array(boolean(), {
      minLength: nodeCount,
      maxLength: nodeCount,
    }).chain((arabicLabels) => {
      return constantFrom("en", "ar").map((language) => {
        return {
          nodeCount,
          language,
          extraEdgeFlags,
          arabicLabels,
        };
      });
    });
  });
});

const buildVersionedPlanContext = (
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
      prerequisiteId: nodes[index].id,
      successorId: node.id,
    };
  });
  const extraEdges = qualifyingExtraPairs(plan.nodeCount)
    .filter((_pair, index) => plan.extraEdgeFlags[index])
    .map(([from, to]) => {
      return {
        prerequisiteId: nodes[from].id,
        successorId: nodes[to].id,
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

const buildBaseLearningPathProposal = (context: VersionedCurriculumContext) => {
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

const pathCopyPatterns: RegExp[] = [
  /<\s*\/?(?:script|iframe|object|embed|style)/iu,
  /javascript\s*:/iu,
  /answer\s*key/iu,
  /api\s*key/iu,
  /secret/iu,
  /chain[- ]of[- ]thought/iu,
  /student\s+identity/iu,
];

const labelForLanguage = (node: CurriculumNode, isArabic: boolean): string =>
  isArabic ? (node.labelAr ?? node.label) : node.label;

const screenPurposeForLanguage = (
  node: CurriculumNode,
  isArabic: boolean
): string =>
  isArabic ? (node.screenPurposeAr ?? node.screenPurpose) : node.screenPurpose;

interface ParsedPathStep {
  nodeId: string;
}

const parseAcceptedPathStep = (
  candidate: unknown,
  context: VersionedCurriculumContext,
  seenNodeIds: Set<string>,
  isLast: boolean,
  isArabic: boolean,
  violations: string[]
): ParsedPathStep | null => {
  if (!isRecord(candidate)) {
    violations.push("Accepted steps must be objects.");
    return null;
  }
  const step = candidate;
  const { nodeId } = step;
  if (typeof nodeId !== "string") {
    violations.push("Accepted steps must carry a node id.");
    return null;
  }
  if (seenNodeIds.has(nodeId)) {
    violations.push(`An accepted path must not repeat the node ${nodeId}.`);
  }
  seenNodeIds.add(nodeId);

  const node = context.nodes.find(
    (candidateNode) => candidateNode.id === nodeId
  );
  if (!node) {
    violations.push(
      `An accepted path must not leave the curriculum: ${nodeId}.`
    );
    return null;
  }

  if (step.screenPurposeId !== node.screenPurposeId) {
    violations.push(
      `An accepted step must carry the screen purpose of ${nodeId}.`
    );
  }
  if (step.label !== labelForLanguage(node, isArabic)) {
    violations.push(
      `An accepted step must show the context label of ${nodeId}.`
    );
  }
  if (step.screenPurpose !== screenPurposeForLanguage(node, isArabic)) {
    violations.push(
      `An accepted step must show the context screen purpose of ${nodeId}.`
    );
  }
  const expectedRole = isLast ? "target" : "prerequisite";
  if (step.role !== expectedRole) {
    violations.push(
      `An accepted step of ${nodeId} must be the ${expectedRole}.`
    );
  }

  return { nodeId };
};

const checkAcceptedPathCopy = (path: Record<string, unknown>): string[] => {
  const violations: string[] = [];
  for (const field of ["rationale", "nextScreenRationale"]) {
    const copy = path[field];
    if (typeof copy !== "string") {
      violations.push(`An accepted path must keep ${field} copy.`);
      continue;
    }
    const collapsed = copy.split(/\s+/u).filter(Boolean).join(" ");
    const isWithinBounds = collapsed.length > 0 && collapsed.length <= 240;
    if (!isWithinBounds) {
      violations.push(
        `An accepted ${field} must stay within 240 collapsed characters.`
      );
    }
    if (
      pathCopyPatterns.some(
        (pattern) => pattern.test(copy) || pattern.test(collapsed)
      )
    ) {
      violations.push(`An accepted ${field} must stay learner-safe.`);
    }
  }
  return violations;
};

const checkAcceptedPath = (
  path: unknown,
  context: VersionedCurriculumContext
): string[] => {
  if (!isRecord(path)) {
    return ["An accepted path must be an object."];
  }
  const violations: string[] = [];
  if (path.direction !== "forward") {
    violations.push("An accepted path must be forward.");
  }

  const approvedEdges = new Set(
    context.edges.map((edge) => `${edge.prerequisiteId}=>${edge.successorId}`)
  );
  const seenNodeIds = new Set<string>();
  const isArabicLanguage = context.language === "ar";
  const { steps } = path;
  if (!Array.isArray(steps) || steps.length < 2) {
    return [...violations, "An accepted path must keep at least two steps."];
  }

  const parsedSteps = steps.map((candidate, index) => {
    return parseAcceptedPathStep(
      candidate,
      context,
      seenNodeIds,
      index === steps.length - 1,
      isArabicLanguage,
      violations
    );
  });

  const walkedPairs = parsedSteps.slice(1);
  for (const [index, step] of walkedPairs.entries()) {
    const previousStep = parsedSteps[index];
    const isWalkBreak = step === null || previousStep === null;
    if (isWalkBreak) {
      continue;
    }
    const isApprovedEdge = approvedEdges.has(
      `${previousStep.nodeId}=>${step.nodeId}`
    );
    if (!isApprovedEdge) {
      violations.push(
        `An accepted path must walk an approved edge from ${previousStep.nodeId} to ${step.nodeId}.`
      );
    }
  }

  const [finalStep] = parsedSteps.slice(-1);
  if (finalStep === null || finalStep.nodeId !== context.targetNodeId) {
    violations.push("An accepted path must end at the requested target node.");
  }

  return [...violations, ...checkAcceptedPathCopy(path)];
};

interface PathMutationProbe {
  name: string;
  apply: (proposal: NonNullable<ProviderLessonDraft["learningPath"]>) => void;
}

const learningPathMutationProbes: PathMutationProbe[] = [
  {
    name: "a reversed prerequisite walk",
    apply(proposal) {
      proposal.direction = "reverse";
    },
  },
  {
    name: "a single-step path",
    apply(proposal) {
      proposal.steps = proposal.steps.slice(0, 1);
    },
  },
  {
    name: "a repeated node",
    apply(proposal) {
      proposal.steps.splice(2, 0, {
        nodeId: proposal.steps[0].nodeId,
        screenPurposeId: proposal.steps[0].screenPurposeId,
      });
    },
  },
  {
    name: "an unknown curriculum node",
    apply(proposal) {
      proposal.steps[1].nodeId = "graph_node_ghost";
    },
  },
  {
    name: "an unapproved screen purpose",
    apply(proposal) {
      proposal.steps[1].screenPurposeId = "screen_purpose_ghost";
    },
  },
  {
    name: "a skipped prerequisite edge",
    apply(proposal) {
      proposal.steps = proposal.steps.filter(
        (_step, index, steps) => index === 0 || index === steps.length - 1
      );
    },
  },
  {
    name: "a path that stops one node short of the target",
    apply(proposal) {
      proposal.steps = proposal.steps.slice(0, -1);
    },
  },
  {
    name: "copy that exposes the answer key",
    apply(proposal) {
      proposal.rationale = "reveal the answer key";
    },
  },
];

const pathProvenance: ProviderProvenance = {
  provider: "property-fixture",
  model: "fixture-model",
  promptTemplateVersion: "fixture-template-v1",
  validatorVersion: "lesson-validator-v2",
};

interface StoryMutationProbe {
  readonly name: string;
  readonly apply: (path: ValidatedLearningPath) => void;
  readonly expectedCode: string;
}

// #19: the story plan is a pure projection, so its only new rejections are a
// path that cannot carry a beat and a path whose approved copy is blank.
const storyMutationProbes: StoryMutationProbe[] = [
  {
    name: "a path with no approved prerequisite edge",
    apply(path) {
      path.steps = path.steps.slice(0, 1);
    },
    expectedCode: "STORY_PATH_TOO_SHORT",
  },
  {
    name: "a path with blank step copy",
    apply(path) {
      path.steps[0].label = " ".repeat(3);
    },
    expectedCode: "STORY_SOURCE_COPY_EMPTY",
  },
];

const buildAcceptedPath = (plan: PathPlan): ValidatedLearningPath => {
  const context = buildVersionedPlanContext(plan);
  const proposal = buildBaseLearningPathProposal(context);

  return buildValidatedLearningPath({
    proposal,
    context,
    draftId: "draft_property_fixture",
    provenance: pathProvenance,
    validatorVersion: "lesson-validator-v2",
  });
};

const storyViolations = (
  story: ReturnType<typeof buildStoryPlan>,
  path: ValidatedLearningPath
): string[] => {
  const hinge = story.beats.find((beat) => beat.role === "hinge");
  const allowedLabels = new Set([
    ...path.steps.map((step) => step.label),
    hinge?.label ?? "",
  ]);
  const allowedNarratives = new Set([
    ...path.steps.map((step) => step.screenPurpose),
    story.connectionExplanation,
  ]);
  const allowedTransitions = new Set([
    ...story.beats.map((beat) => beat.label),
    path.nextScreenRationale,
  ]);
  const allowedScreenPurposeIds = new Set(
    path.steps.map((step) => step.screenPurposeId)
  );

  return story.beats.flatMap((beat) => {
    const violations: string[] = [];
    if (!allowedLabels.has(beat.label)) {
      violations.push(`invented label: ${beat.label}`);
    }
    if (!allowedNarratives.has(beat.narrative)) {
      violations.push(`invented narrative: ${beat.narrative}`);
    }
    if (!allowedTransitions.has(beat.transition)) {
      violations.push(`invented transition: ${beat.transition}`);
    }
    if (!allowedScreenPurposeIds.has(beat.screenPurposeId)) {
      violations.push(`unapproved screen purpose: ${beat.screenPurposeId}`);
    }
    return violations;
  });
};

describe("lesson gate properties", () => {
  it("every accepted draft satisfies every rule the gate enforces (re-checked)", () => {
    assertProperty(
      property(draftPlanArb, (plan) => {
        const draft = buildValidBaseDraft(plan.sourceCount, plan.language);
        const result = validateProviderDraft(draft, {
          expectedLanguage: plan.language,
        });
        if (!result.ok) {
          throw new Error(
            `A generated valid draft was rejected: ${JSON.stringify(result.diagnostics)}`
          );
        }

        expect(checkAcceptedDraft(result.draft, plan.language)).toStrictEqual(
          []
        );
      }),
      propertyOptions()
    );
  });

  it("every draft probe in the break catalog is rejected and names its rule", () => {
    assertProperty(
      property(draftPlanArb, (plan) => {
        const draft = buildValidBaseDraft(plan.sourceCount, plan.language);
        for (const probe of draftMutationProbes) {
          if (probe.applies && !probe.applies(plan)) {
            continue;
          }
          const mutated = structuredClone(draft);
          probe.apply(mutated, plan);
          const result = validateProviderDraft(mutated, {
            expectedLanguage: plan.language,
          });

          expect(result.ok).toBeFalsy();

          const reportedCodes = result.ok
            ? []
            : result.diagnostics.map((diagnostic) => diagnostic.code);

          expect(reportedCodes).toContain(probe.expectedCode);
        }
      }),
      propertyOptions()
    );
  });

  it("every accepted learning path is pinned to its context, and every path probe is rejected", () => {
    assertProperty(
      property(pathPlanArb, (plan) => {
        const context = buildVersionedPlanContext(plan);
        const baseProposal = buildBaseLearningPathProposal(context);
        const draftId = "draft_property_fixture";

        let built: ValidatedLearningPath;
        try {
          built = buildValidatedLearningPath({
            proposal: baseProposal,
            context,
            draftId,
            provenance: pathProvenance,
            validatorVersion: "lesson-validator-v2",
          });
        } catch (error) {
          throw new Error(
            `A generated valid learning path was rejected: ${Error.isError(error) ? error.message : String(error)}`,
            { cause: error }
          );
        }

        expect(built.versionPins.draftId).toBe(draftId);
        expect(built.versionPins.graphVersion).toBe(context.graphVersion);
        expect(checkAcceptedPath(built, context)).toStrictEqual([]);

        for (const probe of learningPathMutationProbes) {
          const mutated: NonNullable<ProviderLessonDraft["learningPath"]> =
            structuredClone(baseProposal);
          probe.apply(mutated);

          expect(() => {
            return buildValidatedLearningPath({
              proposal: mutated,
              context,
              draftId,
              provenance: pathProvenance,
              validatorVersion: "lesson-validator-v2",
            });
          }).toThrow(LearningPathBuildError);
        }
      }),
      propertyOptions()
    );
  });

  it("every story beat traces to the accepted path, and every story probe is rejected", () => {
    assertProperty(
      property(pathPlanArb, (plan) => {
        const path = buildAcceptedPath(plan);
        const story = buildStoryPlan({
          path,
          language: plan.language,
          learnerAction: "Match each source to a target.",
        });

        const hingeBeats = story.beats.filter((beat) => beat.role === "hinge");
        const storyShape = {
          beatCount: story.beats.length,
          expectedBeatCount: path.steps.length + 1,
          violations: storyViolations(story, path),
          hingeCount: hingeBeats.length,
          hingeReveal: hingeBeats.map((beat) => beat.reveal),
          lastRole: story.beats.at(-1)?.role,
          positions: story.beats.map((beat) => beat.position),
          expectedPositions: story.beats.map((_beat, index) => index + 1),
        };

        expect(storyShape).toStrictEqual({
          beatCount: storyShape.expectedBeatCount,
          expectedBeatCount: storyShape.expectedBeatCount,
          violations: [],
          hingeCount: 1,
          hingeReveal: [true],
          lastRole: "target",
          positions: storyShape.expectedPositions,
          expectedPositions: storyShape.expectedPositions,
        });

        for (const probe of storyMutationProbes) {
          const mutated = structuredClone(path);
          probe.apply(mutated);

          const buildMutatedStory = () => {
            return buildStoryPlan({
              path: mutated,
              language: plan.language,
              learnerAction: "Match each source to a target.",
            });
          };
          let reportedCode = "none";
          try {
            buildMutatedStory();
          } catch (error) {
            reportedCode =
              error instanceof StoryPlanBuildError ? error.code : "none";
          }

          expect(reportedCode).toBe(probe.expectedCode);
        }
      }),
      propertyOptions()
    );
  });

  it("arbitrary untrusted payloads never crash the gate, and accepted ones pass the re-check", () => {
    assertProperty(
      property(jsonValue({ maxDepth: 6 }), (untrusted) => {
        const result = validateProviderDraft(untrusted, {
          expectedLanguage: "en",
        });
        const violations = result.ok
          ? checkAcceptedDraft(result.draft, "en")
          : [];

        expect(violations).toStrictEqual([]);
      }),
      propertyOptions()
    );
  });
});
