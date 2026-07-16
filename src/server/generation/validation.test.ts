import { describe, expect, it } from 'vitest'

import { validateProviderDraft } from './validation'

function createVariant(
  kind: 'standard' | 'scaffold' | 'challenge',
  index: number,
) {
  const sourceItems = Array.from({ length: 6 }, (_, itemIndex) => ({
    id: `source-${index}-${itemIndex + 1}`,
    label: `${itemIndex + 1}/2`,
  }))
  const targetItems = sourceItems.map((_, itemIndex) => ({
    id: `target-${index}-${itemIndex + 1}`,
    label: `${itemIndex + 1}/${(itemIndex + 1) * 2}`,
  }))

  return {
    id: `variant-${index}`,
    kind,
    title: `${kind} equivalent fractions`,
    instructions: 'Match each fraction with another name for the same part.',
    sourceItems,
    targetItems,
    distractorItems: [{ id: `distractor-${index}`, label: '2/3' }],
    relationships: sourceItems.map((source, itemIndex) => ({
      id: `relationship-${index}-${itemIndex + 1}`,
      sourceId: source.id,
      targetId: targetItems[itemIndex]?.id,
    })),
    hints: ['Look for fractions that name the same portion of a whole.'],
    feedback: {
      correct: 'These fractions name the same part of a whole.',
      incorrect: 'Try comparing the equal parts in each fraction.',
    },
    languageMetadata: {
      language: 'en',
      direction: 'ltr',
      locale: 'en-US',
    },
    accessibilityMetadata: {
      instructions: 'Instructions for matching equivalent fractions',
      sourceGroupLabel: 'Fractions to match',
      targetGroupLabel: 'Possible equivalent fractions',
    },
  }
}

function createValidProviderDraft() {
  return {
    variants: [
      createVariant('standard', 1),
      createVariant('standard', 2),
      createVariant('scaffold', 3),
      createVariant('challenge', 4),
    ],
  }
}

describe('lesson draft validation', () => {
  it('accepts the four-variant equivalent-fractions contract', () => {
    const result = validateProviderDraft(createValidProviderDraft())

    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([])

    if (result.ok) {
      expect(result.draft.variants).toHaveLength(4)
      expect(result.draft.variants.map((variant) => variant.kind)).toEqual([
        'standard',
        'standard',
        'scaffold',
        'challenge',
      ])
    }
  })

  it('blocks a relationship that reuses a target for another source', () => {
    const draft = structuredClone(createValidProviderDraft())
    const firstVariant = draft.variants[0]

    firstVariant.relationships[1] = {
      ...firstVariant.relationships[1],
      targetId: firstVariant.relationships[0].targetId,
    }

    const result = validateProviderDraft(draft)

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'TARGET_REUSED',
          variantId: 'variant-1',
          field: 'relationships',
        }),
      ]),
    )
  })

  it('keeps quality warnings visible without blocking a valid draft', () => {
    const draft = createValidProviderDraft()
    draft.variants[0].instructions = 'x'.repeat(161)

    const result = validateProviderDraft(draft)

    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          code: 'CONTENT_TOO_LONG',
          variantId: 'variant-1',
          field: 'instructions',
        }),
      ]),
    )
  })

  it('blocks executable content and untrusted fields from model output', () => {
    const draft = createValidProviderDraft() as Record<string, unknown>
    const variants = draft.variants as Array<Record<string, unknown>>
    const firstVariant = variants[0]

    firstVariant.instructions = '<script>alert(1)</script>'
    firstVariant.untrustedField = 'must not be accepted'

    const result = validateProviderDraft(draft)

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'EXECUTABLE_CONTENT',
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'UNTRUSTED_FIELD',
        }),
      ]),
    )
  })

  it('requires the exact standard, scaffold, and challenge variant mix', () => {
    const draft = createValidProviderDraft()
    draft.variants[2].kind = 'standard'

    const result = validateProviderDraft(draft)

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MISSING_VARIANT_KIND',
          field: 'variants',
        }),
      ]),
    )
  })

  it('enforces the distractor limit and required accessibility metadata', () => {
    const distractorDraft = createValidProviderDraft() as Record<
      string,
      unknown
    >
    const distractorVariants = distractorDraft.variants as Array<
      Record<string, unknown>
    >
    const firstVariant = distractorVariants[0]
    firstVariant.distractorItems = [
      ...(firstVariant.distractorItems as Array<Record<string, string>>),
      { id: 'distractor-extra', label: '5/7' },
    ]

    const distractorResult = validateProviderDraft(distractorDraft)

    expect(distractorResult.ok).toBe(false)
    expect(distractorResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DISTRACTOR_LIMIT' }),
      ]),
    )

    const metadataDraft = createValidProviderDraft() as Record<string, unknown>
    const metadataVariants = metadataDraft.variants as Array<
      Record<string, unknown>
    >
    delete metadataVariants[0].accessibilityMetadata
    const metadataResult = validateProviderDraft(metadataDraft)

    expect(metadataResult.ok).toBe(false)
    expect(metadataResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_CONTRACT' }),
      ]),
    )
  })
})
