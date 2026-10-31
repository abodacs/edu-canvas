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
  artifactCorpus,
  buildBaseLearningPathProposal,
  buildValidBaseDraft,
  buildVersionedPlanContext,
  draftMutationProbes,
  evaluateCorpusArtifact,
  learningPathMutationProbes,
  qualifyingExtraPairs,
} from "./artifact-corpus";
import {
  buildValidatedLearningPath,
  LearningPathBuildError,
} from "./learning-path";
import { validateProviderDraft } from "./validation";
import type { DraftPlan, PathPlan } from "./artifact-corpus";
import type { ProviderProvenance } from "./provider";
import type {
  CurriculumNode,
  VersionedCurriculumContext,
} from "./semantic-validation-contract";
import type { ProviderLessonDraft, ValidatedLearningPath } from "./types";
import type { LessonLanguage } from "@/shared/generation-contract";

// Property checks for the Validation & Safety gate. Run directly with
// `pnpm verify:lesson-gate`; the operating skill lives in
// .agents/skills/verify-lesson-gate. Break fixtures and expected verdicts
// live in ./artifact-corpus.ts.

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

// ------------------------------------------------------------------
// Learning path gate: `buildValidatedLearningPath` accepts a provider
// proposal for a teacher preview. The context is built from a random
// plan; the properties pin the accepted path to the context.
// ------------------------------------------------------------------

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
        } satisfies PathPlan;
      });
    });
  });
});

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

const pathProvenance: ProviderProvenance = {
  provider: "property-fixture",
  model: "fixture-model",
  promptTemplateVersion: "fixture-template-v1",
  validatorVersion: "lesson-validator-v2",
};

const draftPlanArb = integer({ min: 3, max: 8 }).chain((sourceCount) => {
  return constantFrom("en", "ar").map(
    (language) => ({ sourceCount, language }) satisfies DraftPlan
  );
});

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

// Every string a beat carries must be a substring of the accepted path copy,
// because the connection clause is a slice of `rationale`. Role labels are
// surface chrome, so they are the only other allowed source. The oracle reads
// the path, never the story, so an invented sentence fails it.
const storyViolations = (
  story: ReturnType<typeof buildStoryPlan>,
  path: ValidatedLearningPath
): string[] => {
  const approvedCopy = [
    ...path.steps.flatMap((step) => [step.label, step.screenPurpose]),
    path.rationale,
    path.nextScreenRationale,
  ];
  const isApprovedCopy = (value: string) =>
    approvedCopy.some((copy) => copy.includes(value));
  const roleLabels = new Set(story.beats.map((beat) => beat.roleLabel));

  return story.beats.flatMap((beat) => {
    const violations: string[] = [];
    const beatCopy = {
      label: beat.label,
      narrative: beat.narrative,
      transition: beat.transition,
      screenPurpose: beat.screenPurpose,
      roleLabel: beat.roleLabel,
    };

    for (const [name, value] of Object.entries(beatCopy)) {
      if (!(isApprovedCopy(value) || roleLabels.has(value))) {
        violations.push(`unapproved ${name}: ${value}`);
      }
    }
    if (
      path.steps.every((step) => step.screenPurposeId !== beat.screenPurposeId)
    ) {
      violations.push(`unapproved screen purpose: ${beat.screenPurposeId}`);
    }
    return violations;
  });
};

describe("lesson gate properties", () => {
  it("every accepted draft satisfies every rule the gate enforces (re-checked)", () => {
    assertProperty(
      property(draftPlanArb, (plan) => {
        const draft = buildValidBaseDraft(plan);
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
        const draft = buildValidBaseDraft(plan);
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

describe("artifact gate corpus", () => {
  it("every corpus break yields hard_block and names its rule, and a warning-only artifact stays warning", async () => {
    const evaluations = await Promise.all(
      artifactCorpus.map(async (entry) => {
        return {
          entry,
          evaluation: await evaluateCorpusArtifact(entry),
        };
      })
    );
    const failures: string[] = [];

    for (const { entry, evaluation } of evaluations) {
      if (evaluation.gate.verdict !== entry.expectedVerdict) {
        failures.push(
          `${entry.id}: verdict ${evaluation.gate.verdict}, expected ${entry.expectedVerdict}`
        );
      }

      const shouldRender = entry.expectedVerdict !== "hard_block";
      if (shouldRender !== (evaluation.gate.renderable !== null)) {
        failures.push(
          `${entry.id}: ${shouldRender ? "expected a renderable artifact" : "expected renderable to be null"}`
        );
      }

      for (const expectation of entry.expectedFindings) {
        const matched = evaluation.gate.findings.some((finding) => {
          return (
            finding.code === expectation.code &&
            finding.validator === expectation.validator &&
            finding.recovery === expectation.recovery
          );
        });
        if (!matched) {
          failures.push(
            `${entry.id}: missing ${expectation.validator} finding ${expectation.code} (${expectation.recovery})`
          );
        }
      }
    }

    expect(failures).toStrictEqual([]);
  });
});
