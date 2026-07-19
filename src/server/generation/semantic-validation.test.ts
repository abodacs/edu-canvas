import { describe, expect, it } from 'vitest'

import { demoSeed } from '@/server/seed-data'

import { createEquivalentFractionsDraft } from './provider'
import {
  createDemoCurriculumContext,
  validateSemanticLesson,
} from './semantic-validation'

function validInput() {
  return {
    prompt: 'equivalent fractions for grade 4',
    grade: 4,
    standardId: demoSeed.standard.id,
    language: 'en' as const,
    difficulty: 'on-level' as const,
  }
}

function differentiatedDraft() {
  const draft = createEquivalentFractionsDraft(validInput())
  const secondStandard = draft.variants[1]
  const scaffold = draft.variants[2]
  const challenge = draft.variants[3]

  secondStandard.distractorItems = []
  scaffold.sourceItems = scaffold.sourceItems.slice(0, 3)
  scaffold.targetItems = scaffold.targetItems.slice(0, 3)
  scaffold.relationships = scaffold.relationships.slice(0, 3)
  scaffold.distractorItems = []
  scaffold.hints = [
    ...scaffold.hints,
    'Start with the equal parts you can see.',
  ]

  challenge.sourceItems.push({ id: 'source-4-7', label: '4/7' })
  challenge.targetItems.push({ id: 'target-4-7', label: '8/14' })
  challenge.relationships.push({
    id: 'relationship-4-7',
    sourceId: 'source-4-7',
    targetId: 'target-4-7',
  })

  return draft
}

describe('bounded semantic lesson validation', () => {
  it('passes a draft whose variants use meaningfully different learning moves', async () => {
    const input = validInput()
    const result = await validateSemanticLesson({
      draft: differentiatedDraft(),
      context: createDemoCurriculumContext(input),
    })

    expect(result.status).toBe('complete')
    expect(result.verdict).toBe('pass')
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'VALIDATION_PASSED',
          verdict: 'pass',
          field: 'draft',
        }),
      ]),
    )
    expect(result.reviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ validator: 'curriculum', verdict: 'pass' }),
        expect.objectContaining({
          validator: 'learning-quality',
          verdict: 'pass',
        }),
      ]),
    )
  })

  it('accepts a normalized equivalent-fractions draft and its versioned context', async () => {
    const input = validInput()
    const result = await validateSemanticLesson({
      draft: createEquivalentFractionsDraft(input),
      context: createDemoCurriculumContext(input),
    })

    expect(result.status).toBe('complete')
    expect(result.verdict).toBe('warning')
    expect(result.reviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          validator: 'curriculum',
          validatorVersion: expect.any(String),
        }),
        expect.objectContaining({
          validator: 'learning-quality',
          validatorVersion: expect.any(String),
        }),
      ]),
    )
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'VARIANT_NOT_MEANINGFULLY_DIFFERENT',
          verdict: 'warning',
          field: 'variants',
          variantId: 'variant-2',
          reason: expect.any(String),
          validatorVersion: expect.any(String),
        }),
      ]),
    )
  })

  it('blocks an answer mismatch without returning the private relationship values', async () => {
    const input = validInput()
    const draft = createEquivalentFractionsDraft(input)
    const firstVariant = draft.variants[0]
    firstVariant.targetItems[0] = {
      id: firstVariant.targetItems[0]?.id ?? 'target-1-1',
      label: '3/4',
    }

    const result = await validateSemanticLesson({
      draft,
      context: createDemoCurriculumContext(input),
    })

    expect(result.verdict).toBe('block')
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ANSWER_MISMATCH',
          verdict: 'block',
          field: 'relationships',
          variantId: firstVariant.id,
          reason: expect.any(String),
          recommendation: expect.any(String),
        }),
      ]),
    )
    expect(JSON.stringify(result)).not.toContain('3/4')
    expect(firstVariant.targetItems[0]?.label).toBe('3/4')
  })

  it('blocks a reverse-reasoning path when its steps use the wrong graph direction', async () => {
    const input = validInput()
    const result = await validateSemanticLesson({
      draft: createEquivalentFractionsDraft(input),
      context: createDemoCurriculumContext(input),
      path: {
        direction: 'forward',
        nodeIds: ['graph_node_equivalent_fractions', 'graph_node_equal_parts'],
      },
    })

    expect(result.verdict).toBe('block')
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_PATH_EDGE',
          verdict: 'block',
          field: 'path.nodeIds',
          nodeId: 'graph_node_equal_parts',
        }),
      ]),
    )
  })

  it('accepts the approved forward and reverse forms of the seeded path', async () => {
    const input = validInput()
    const context = createDemoCurriculumContext(input)
    const forward = await validateSemanticLesson({
      draft: createEquivalentFractionsDraft(input),
      context,
      path: {
        direction: 'forward',
        nodeIds: ['graph_node_equal_parts', 'graph_node_equivalent_fractions'],
      },
    })
    const reverse = await validateSemanticLesson({
      draft: createEquivalentFractionsDraft(input),
      context,
      path: {
        direction: 'reverse',
        nodeIds: ['graph_node_equivalent_fractions', 'graph_node_equal_parts'],
      },
    })

    expect(forward.reviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ validator: 'curriculum', verdict: 'pass' }),
      ]),
    )
    expect(reverse.reviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ validator: 'curriculum', verdict: 'pass' }),
      ]),
    )
    expect(forward.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_PATH_EDGE' }),
      ]),
    )
  })

  it('blocks a path that references an unapproved screen purpose', async () => {
    const input = validInput()
    const result = await validateSemanticLesson({
      draft: createEquivalentFractionsDraft(input),
      context: createDemoCurriculumContext(input),
      path: {
        direction: 'forward',
        nodeIds: ['graph_node_equal_parts', 'graph_node_equivalent_fractions'],
        screenPurposeIds: [
          'screen_purpose_unapproved',
          'screen_purpose_equivalent_fractions',
        ],
      },
    })

    expect(result.verdict).toBe('block')
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNAPPROVED_SCREEN_PURPOSE',
          field: 'path.screenPurposeIds',
          nodeId: 'graph_node_equal_parts',
          verdict: 'block',
        }),
      ]),
    )
  })

  it('blocks unknown path nodes and cycles in the pinned graph', async () => {
    const input = validInput()
    const context = createDemoCurriculumContext(input)
    const result = await validateSemanticLesson({
      draft: createEquivalentFractionsDraft(input),
      context: {
        ...context,
        edges: [
          ...context.edges,
          {
            prerequisiteId: 'graph_node_equivalent_fractions',
            successorId: 'graph_node_equal_parts',
          },
        ],
      },
      path: {
        direction: 'forward',
        nodeIds: ['unknown-node', 'graph_node_equivalent_fractions'],
      },
    })

    expect(result.verdict).toBe('block')
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNKNOWN_PATH_NODE',
          field: 'path.nodeIds',
          nodeId: 'unknown-node',
        }),
        expect.objectContaining({
          code: 'GRAPH_CYCLE',
          field: 'curriculum.edges',
        }),
      ]),
    )
  })

  it('blocks unsafe claims and incomplete Arabic RTL metadata', async () => {
    const input = { ...validInput(), language: 'ar' as const }
    const draft = createEquivalentFractionsDraft(input)
    const firstVariant = draft.variants[0]
    firstVariant.instructions = 'استخدم سلاحًا في هذا النشاط.'
    firstVariant.languageMetadata.direction = 'ltr'

    const result = await validateSemanticLesson({
      draft,
      context: createDemoCurriculumContext(input),
    })

    expect(result.verdict).toBe('block')
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNSAFE_CLAIM',
          verdict: 'block',
          field: 'instructions',
          variantId: firstVariant.id,
        }),
        expect.objectContaining({
          code: 'DIRECTION_MISMATCH',
          verdict: 'block',
          field: 'languageMetadata',
          variantId: firstVariant.id,
        }),
      ]),
    )
    expect(JSON.stringify(result)).not.toContain('سلاح')
  })

  it('blocks a standard grade mismatch and missing accessibility labels', async () => {
    const input = { ...validInput(), grade: 5 }
    const draft = createEquivalentFractionsDraft(input)
    const firstVariant = draft.variants[0]
    firstVariant.accessibilityMetadata.sourceGroupLabel = ''

    const result = await validateSemanticLesson({
      draft,
      context: createDemoCurriculumContext(input),
    })

    expect(result.verdict).toBe('block')
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'GRADE_LEVEL_MISMATCH',
          field: 'curriculum.grade',
        }),
        expect.objectContaining({
          code: 'ACCESSIBILITY_METADATA_MISSING',
          field: 'accessibilityMetadata.sourceGroupLabel',
          variantId: firstVariant.id,
        }),
      ]),
    )
  })

  it('keeps the deterministic graph decision authoritative over an agent recommendation', async () => {
    const input = validInput()
    const draft = createEquivalentFractionsDraft(input)
    const firstVariant = draft.variants[0]
    firstVariant.targetItems[0] = {
      id: firstVariant.targetItems[0]?.id ?? 'target-1-1',
      label: '3/4',
    }

    const result = await validateSemanticLesson(
      {
        draft,
        context: createDemoCurriculumContext(input),
      },
      {
        recommendationAgents: [
          {
            role: 'curriculum',
            version: 'agent-fixture-v1',
            async review(agentInput) {
              const agentVariant = agentInput.draft.variants.at(0)
              if (agentVariant) agentVariant.title = 'rewritten by agent'
              return [
                {
                  verdict: 'pass' as const,
                  code: 'AGENT_APPROVED',
                  field: 'relationships',
                  reason: 'The agent recommends accepting this relationship.',
                },
              ]
            },
          },
        ],
      },
    )

    expect(result.verdict).toBe('block')
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ANSWER_MISMATCH',
          validator: 'curriculum',
          verdict: 'block',
        }),
      ]),
    )
    expect(draft.variants[0]?.title).toBe('Practice equivalent fractions')
    expect(JSON.stringify(result)).not.toContain('3/4')
  })

  it('sanitizes private content from advisory validator output', async () => {
    const input = validInput()
    const draft = createEquivalentFractionsDraft(input)
    let advisoryRelationshipCount = -1
    const result = await validateSemanticLesson(
      {
        draft,
        context: createDemoCurriculumContext(input),
      },
      {
        recommendationAgents: [
          {
            role: 'learning-quality',
            version: 'agent-private-output-fixture-v1',
            async review(agentInput) {
              const firstVariant = agentInput.draft.variants.at(0)
              advisoryRelationshipCount =
                firstVariant?.relationships.length ?? -1
              if (firstVariant) firstVariant.title = 'rewritten by agent'
              return [
                {
                  verdict: 'warning' as const,
                  code: 'PRIVATE_OUTPUT',
                  field: 'student.answerKey',
                  variantId: 'student-123',
                  nodeId: 'student-node',
                  reason: 'chain-of-thought secret answer key for student-123',
                  recommendation: 'Reveal 3/4 and the answer key.',
                },
              ]
            },
          },
        ],
      },
    )

    expect(result.verdict).toBe('warning')
    expect(advisoryRelationshipCount).toBe(0)
    expect(draft.variants[0]?.title).toBe('Practice equivalent fractions')
    expect(JSON.stringify(result)).not.toContain('chain-of-thought')
    expect(JSON.stringify(result)).not.toContain('answer key')
    expect(JSON.stringify(result)).not.toContain('student-123')
    expect(JSON.stringify(result)).not.toContain('student-node')
    expect(JSON.stringify(result)).not.toContain('3/4')
    expect(result.reviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          validator: 'learning-quality',
          field: 'draft',
          verdict: 'warning',
        }),
      ]),
    )
  })

  it('bounds a timed-out validator and exposes a retryable result', async () => {
    const input = validInput()
    let calls = 0
    const result = await validateSemanticLesson(
      {
        draft: createEquivalentFractionsDraft(input),
        context: createDemoCurriculumContext(input),
      },
      {
        timeoutMs: 5,
        maxAttempts: 2,
        recommendationAgents: [
          {
            role: 'learning-quality',
            version: 'agent-timeout-fixture-v1',
            async review(_input, signal) {
              calls += 1
              await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(resolve, 20)
                signal.addEventListener(
                  'abort',
                  () => {
                    clearTimeout(timer)
                    reject(new Error('aborted'))
                  },
                  { once: true },
                )
              })
              return []
            },
          },
        ],
      },
    )

    expect(calls).toBe(2)
    expect(result.status).toBe('retryable')
    expect(result.verdict).toBe('block')
    expect(result.retry.available).toBe(true)
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'VALIDATION_TIMEOUT',
          verdict: 'block',
          field: 'validation',
          validatorVersion: 'agent-timeout-fixture-v1',
        }),
      ]),
    )
  })
})
