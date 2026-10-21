import { curriculumValidatorVersion } from "./semantic-validation-contract";
import { finding, createReview } from "./semantic-validation-utilities";
import type {
  SemanticValidationFinding,
  SemanticValidationInput,
  SemanticValidatorReview,
  VersionedCurriculumContext,
} from "./semantic-validation-contract";
import type { ProviderVariant } from "./types";

const CURRICULUM_EDGES_FIELD = "curriculum.edges";

const PATH_NODE_IDS_FIELD = "path.nodeIds";

interface Fraction {
  numerator: number;
  denominator: number;
}

const fractionValue = (label: string): Fraction | undefined => {
  const match = /^(?<numerator>\d+)\s*\/\s*(?<denominator>\d+)$/u.exec(
    label.trim()
  );
  if (!match) {
    return undefined;
  }

  const numerator = Number(match.groups?.numerator);
  const denominator = Number(match.groups?.denominator);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    return undefined;
  }
  return denominator === 0 ? undefined : { numerator, denominator };
};

const areRelationshipsEquivalent = (
  left: Fraction,
  right: Fraction
): boolean => {
  return (
    BigInt(left.numerator) * BigInt(right.denominator) ===
    BigInt(right.numerator) * BigInt(left.denominator)
  );
};

const hasGraphCycle = (context: VersionedCurriculumContext): boolean => {
  const adjacency = new Map<string, string[]>();
  for (const edge of context.edges) {
    const successors = adjacency.get(edge.prerequisiteId) ?? [];
    successors.push(edge.successorId);
    adjacency.set(edge.prerequisiteId, successors);
  }

  const visited = new Set<string>();
  const active = new Set<string>();

  const hasCycleFrom = (nodeId: string): boolean => {
    if (active.has(nodeId)) {
      return true;
    }
    if (visited.has(nodeId)) {
      return false;
    }

    active.add(nodeId);
    const successors = adjacency.get(nodeId);
    if (successors) {
      for (const successorId of successors) {
        if (hasCycleFrom(successorId)) {
          return true;
        }
      }
    }
    active.delete(nodeId);
    visited.add(nodeId);
    return false;
  };

  return context.nodes.some((node) => hasCycleFrom(node.id));
};

const validatePathNodes = (
  path: NonNullable<SemanticValidationInput["path"]>,
  nodeIds: ReadonlySet<string>,
  findings: SemanticValidationFinding[]
): void => {
  const seen = new Set<string>();
  for (const nodeId of path.nodeIds) {
    if (!nodeIds.has(nodeId)) {
      findings.push(
        finding("curriculum", curriculumValidatorVersion, {
          verdict: "block",
          code: "UNKNOWN_PATH_NODE",
          field: PATH_NODE_IDS_FIELD,
          nodeId,
          reason:
            "The learning path references a node outside the approved curriculum graph.",
          recommendation:
            "Use only nodes from the pinned curriculum graph version.",
        })
      );
    }
    if (seen.has(nodeId)) {
      findings.push(
        finding("curriculum", curriculumValidatorVersion, {
          verdict: "block",
          code: "PATH_CYCLE",
          field: PATH_NODE_IDS_FIELD,
          nodeId,
          reason:
            "The learning path repeats a node and cannot be presented as an ordered prerequisite path.",
          recommendation: "Remove the repeated node and keep the path acyclic.",
        })
      );
    }
    seen.add(nodeId);
  }
};

const hasApprovedEdge = (
  context: SemanticValidationInput["context"],
  from: string,
  to: string
): boolean => {
  return context.edges.some(
    (edge) => edge.prerequisiteId === from && edge.successorId === to
  );
};

const isDeclaredEdge = (
  input: SemanticValidationInput,
  path: NonNullable<SemanticValidationInput["path"]>,
  previous: string,
  current: string
): boolean => {
  return path.direction === "forward"
    ? hasApprovedEdge(input.context, previous, current)
    : hasApprovedEdge(input.context, current, previous);
};

const validatePathEdges = (
  input: SemanticValidationInput,
  path: NonNullable<SemanticValidationInput["path"]>,
  findings: SemanticValidationFinding[]
): void => {
  for (let index = 1; index < path.nodeIds.length; index += 1) {
    const previous = path.nodeIds[index - 1];
    const current = path.nodeIds[index];
    if (
      !previous ||
      !current ||
      isDeclaredEdge(input, path, previous, current)
    ) {
      continue;
    }

    findings.push(
      finding("curriculum", curriculumValidatorVersion, {
        verdict: "block",
        code: "INVALID_PATH_EDGE",
        field: PATH_NODE_IDS_FIELD,
        nodeId: current,
        reason:
          "The learning path contains an edge that is not approved in its declared direction.",
        recommendation:
          "Use the pinned graph edge direction for every adjacent path step.",
      })
    );
  }
};

const validatePathScreenPurposes = (
  input: SemanticValidationInput,
  path: NonNullable<SemanticValidationInput["path"]>,
  findings: SemanticValidationFinding[]
): void => {
  if (!path.screenPurposeIds) {
    return;
  }

  if (path.screenPurposeIds.length !== path.nodeIds.length) {
    findings.push(
      finding("curriculum", curriculumValidatorVersion, {
        verdict: "block",
        code: "PATH_SCREEN_PURPOSE_MISMATCH",
        field: "path.screenPurposeIds",
        reason:
          "Every learning-path step must reference exactly one approved screen purpose.",
        recommendation:
          "Attach one approved screen purpose to each ordered path step.",
      })
    );
    return;
  }

  for (const [index, screenPurposeId] of path.screenPurposeIds.entries()) {
    const nodeId = path.nodeIds[index];
    const node = input.context.nodes.find(
      (candidate) => candidate.id === nodeId
    );
    if (node && node.screenPurposeId === screenPurposeId) {
      continue;
    }

    findings.push(
      finding("curriculum", curriculumValidatorVersion, {
        verdict: "block",
        code: "UNAPPROVED_SCREEN_PURPOSE",
        field: "path.screenPurposeIds",
        ...(nodeId && { nodeId }),
        reason:
          "The learning path references a screen purpose that is not approved for its curriculum node.",
        recommendation:
          "Use the pinned screen purpose for each approved prerequisite step.",
      })
    );
  }
};

const validatePathTarget = (
  input: SemanticValidationInput,
  path: NonNullable<SemanticValidationInput["path"]>,
  findings: SemanticValidationFinding[]
): void => {
  const targetNode =
    path.direction === "forward" ? path.nodeIds.at(-1) : path.nodeIds.at(0);
  if (targetNode === input.context.targetNodeId) {
    return;
  }

  findings.push(
    finding("curriculum", curriculumValidatorVersion, {
      verdict: "block",
      code: "PATH_TARGET_MISMATCH",
      field: PATH_NODE_IDS_FIELD,
      nodeId: targetNode,
      reason:
        "The learning path does not terminate at the requested lesson target.",
      recommendation:
        "Pin the path to the approved target node for this lesson.",
    })
  );
};

const validatePath = (
  input: SemanticValidationInput,
  nodeIds: ReadonlySet<string>,
  findings: SemanticValidationFinding[]
): void => {
  const { path } = input;
  if (!path) {
    return;
  }

  if (path.nodeIds.length < 2) {
    findings.push(
      finding("curriculum", curriculumValidatorVersion, {
        verdict: "block",
        code: "PATH_TOO_SHORT",
        field: PATH_NODE_IDS_FIELD,
        reason:
          "A learning path needs at least one approved prerequisite edge.",
        recommendation:
          "Provide an ordered path through the approved curriculum graph.",
      })
    );
    return;
  }

  validatePathNodes(path, nodeIds, findings);
  validatePathEdges(input, path, findings);
  validatePathScreenPurposes(input, path, findings);
  validatePathTarget(input, path, findings);
};

const validateRelationships = (
  variants: readonly ProviderVariant[],
  findings: SemanticValidationFinding[]
): void => {
  for (const variant of variants) {
    const sourceItems = new Map(
      variant.sourceItems.map((item) => [item.id, item.label])
    );
    const targetItems = new Map(
      variant.targetItems.map((item) => [item.id, item.label])
    );

    for (const relationship of variant.relationships) {
      const source = sourceItems.get(relationship.sourceId);
      const target = targetItems.get(relationship.targetId);
      const sourceFraction = source ? fractionValue(source) : undefined;
      const targetFraction = target ? fractionValue(target) : undefined;

      if (
        sourceFraction &&
        targetFraction &&
        !areRelationshipsEquivalent(sourceFraction, targetFraction)
      ) {
        findings.push(
          finding("curriculum", curriculumValidatorVersion, {
            verdict: "block",
            code: "ANSWER_MISMATCH",
            field: "relationships",
            variantId: variant.id,
            reason:
              "A matching relationship conflicts with the approved equivalent-fractions rule.",
            recommendation:
              "Review the matching relationship against the approved curriculum before continuing.",
          })
        );
      } else if (!sourceFraction || !targetFraction) {
        findings.push(
          finding("curriculum", curriculumValidatorVersion, {
            verdict: "warning",
            code: "ANSWER_RELATIONSHIP_UNVERIFIED",
            field: "relationships",
            variantId: variant.id,
            reason:
              "The validator could not verify this relationship with the pinned curriculum rule.",
            recommendation:
              "Have a teacher review the relationship before accepting the variant.",
          })
        );
      }
    }
  }
};

export const reviewCurriculum = (
  input: SemanticValidationInput
): SemanticValidatorReview => {
  const findings: SemanticValidationFinding[] = [];
  const nodeIds = new Set(input.context.nodes.map((node) => node.id));

  for (const [field, value] of [
    ["curriculum.tenantId", input.context.tenantId],
    ["curriculum.standardId", input.context.standardId],
    ["curriculum.standardCode", input.context.standardCode],
    ["curriculum.graphVersion", input.context.graphVersion],
  ] as const) {
    if (!value.trim()) {
      findings.push(
        finding("curriculum", curriculumValidatorVersion, {
          verdict: "block",
          code: "CURRICULUM_CONTEXT_INVALID",
          field,
          reason: "The versioned curriculum context is incomplete.",
          recommendation:
            "Load a complete approved curriculum context before reviewing the draft.",
        })
      );
    }
  }

  if (!nodeIds.has(input.context.targetNodeId)) {
    findings.push(
      finding("curriculum", curriculumValidatorVersion, {
        verdict: "block",
        code: "UNKNOWN_TARGET_NODE",
        field: "curriculum.targetNodeId",
        nodeId: input.context.targetNodeId,
        reason:
          "The requested lesson target is not in the approved curriculum graph.",
        recommendation:
          "Select an approved target from the current curriculum pack.",
      })
    );
  }

  for (const edge of input.context.edges) {
    if (!nodeIds.has(edge.prerequisiteId)) {
      findings.push(
        finding("curriculum", curriculumValidatorVersion, {
          verdict: "block",
          code: "UNKNOWN_GRAPH_NODE",
          field: CURRICULUM_EDGES_FIELD,
          nodeId: edge.prerequisiteId,
          reason: "The approved graph contains an edge from an unknown node.",
          recommendation:
            "Repair the pinned curriculum graph before reviewing this draft.",
        })
      );
    }
    if (!nodeIds.has(edge.successorId)) {
      findings.push(
        finding("curriculum", curriculumValidatorVersion, {
          verdict: "block",
          code: "UNKNOWN_GRAPH_NODE",
          field: CURRICULUM_EDGES_FIELD,
          nodeId: edge.successorId,
          reason: "The approved graph contains an edge to an unknown node.",
          recommendation:
            "Repair the pinned curriculum graph before reviewing this draft.",
        })
      );
    }
  }

  if (hasGraphCycle(input.context)) {
    findings.push(
      finding("curriculum", curriculumValidatorVersion, {
        verdict: "block",
        code: "GRAPH_CYCLE",
        field: CURRICULUM_EDGES_FIELD,
        reason:
          "The pinned curriculum graph contains a cycle and cannot define prerequisites safely.",
        recommendation:
          "Remove the cycle from the approved graph version before continuing.",
      })
    );
  }

  validatePath(input, nodeIds, findings);
  validateRelationships(input.draft.variants, findings);
  return createReview("curriculum", curriculumValidatorVersion, findings);
};
