import { A2UI_CATALOG_VERSION } from '@/shared/a2ui-contract'

import type { ProviderProvenance } from './provider'
import type {
  NormalizedReasoningPath,
  VersionedCurriculumContext,
} from './semantic-validation'
import type { ProviderLearningPath, ValidatedLearningPath } from './types'

const unsafePathCopyPattern =
  /<\s*\/?(?:script|iframe|object|embed|style)|javascript\s*:|answer\s*key|api\s*key|secret|chain[- ]of[- ]thought|student\s+identity/i

export class LearningPathBuildError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LearningPathBuildError'
  }
}

export function toNormalizedReasoningPath(
  proposal: ProviderLearningPath,
): NormalizedReasoningPath {
  return {
    direction: proposal.direction,
    nodeIds: proposal.steps.map((step) => step.nodeId),
    screenPurposeIds: proposal.steps.map((step) => step.screenPurposeId),
  }
}

function assertSafePathCopy(value: string, field: string): void {
  const normalized = value.trim().replaceAll(/\s+/g, ' ')
  if (
    !normalized ||
    normalized.length > 240 ||
    unsafePathCopyPattern.test(value)
  ) {
    throw new LearningPathBuildError(
      `The learning path contains unsafe or unusable ${field} copy.`,
    )
  }
}

function assertForwardEdge(
  context: VersionedCurriculumContext,
  previousNodeId: string,
  currentNodeId: string,
): void {
  if (
    !context.edges.some(
      (edge) =>
        edge.prerequisiteId === previousNodeId &&
        edge.successorId === currentNodeId,
    )
  ) {
    throw new LearningPathBuildError(
      'The learning path contains an unapproved prerequisite edge.',
    )
  }
}

export function buildValidatedLearningPath(input: {
  proposal: ProviderLearningPath
  context: VersionedCurriculumContext
  draftId: string
  provenance: ProviderProvenance
  validatorVersion: string
}): ValidatedLearningPath {
  const { proposal, context } = input

  if (proposal.direction !== 'forward') {
    throw new LearningPathBuildError(
      'Only forward prerequisite paths can enter the teacher preview.',
    )
  }

  if (proposal.steps.length < 2) {
    throw new LearningPathBuildError(
      'A learning path needs at least one approved prerequisite edge.',
    )
  }

  assertSafePathCopy(proposal.rationale, 'rationale')
  assertSafePathCopy(proposal.nextScreenRationale, 'next-screen rationale')

  const seen = new Set<string>()
  const steps = proposal.steps.map((proposalStep, index) => {
    if (seen.has(proposalStep.nodeId)) {
      throw new LearningPathBuildError(
        'The learning path repeats a node and cannot be shown safely.',
      )
    }
    seen.add(proposalStep.nodeId)

    const node = context.nodes.find(
      (candidate) => candidate.id === proposalStep.nodeId,
    )
    if (!node) {
      throw new LearningPathBuildError(
        'The learning path references an unknown curriculum node.',
      )
    }

    if (node.screenPurposeId !== proposalStep.screenPurposeId) {
      throw new LearningPathBuildError(
        'The learning path references an unapproved screen purpose.',
      )
    }

    if (index > 0) {
      const previousNodeId = proposal.steps[index - 1]?.nodeId
      if (!previousNodeId) {
        throw new LearningPathBuildError(
          'The learning path contains an invalid ordered step.',
        )
      }
      assertForwardEdge(context, previousNodeId, proposalStep.nodeId)
    }

    return {
      nodeId: node.id,
      label:
        context.language === 'ar' ? (node.labelAr ?? node.label) : node.label,
      role:
        index === proposal.steps.length - 1
          ? ('target' as const)
          : ('prerequisite' as const),
      screenPurposeId: node.screenPurposeId,
      screenPurpose:
        context.language === 'ar'
          ? (node.screenPurposeAr ?? node.screenPurpose)
          : node.screenPurpose,
    }
  })

  if (steps.at(-1)?.nodeId !== context.targetNodeId) {
    throw new LearningPathBuildError(
      'The learning path does not terminate at the requested lesson target.',
    )
  }

  return {
    direction: 'forward',
    steps,
    rationale: proposal.rationale.trim().replaceAll(/\s+/g, ' '),
    nextScreenRationale: proposal.nextScreenRationale
      .trim()
      .replaceAll(/\s+/g, ' '),
    versionPins: {
      draftId: input.draftId,
      graphVersion: context.graphVersion,
      catalogVersion: A2UI_CATALOG_VERSION,
      modelVersion: input.provenance.model,
      validatorVersion: input.validatorVersion,
    },
  }
}
