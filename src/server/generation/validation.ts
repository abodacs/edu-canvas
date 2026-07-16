import { z } from 'zod'

import { variantKindValues } from './types'
import type {
  GenerationDiagnostic,
  ProviderVariant,
  ValidationResult,
} from './types'

export const validatorVersion = 'lesson-validator-v1'

const plainTextSchema = z.string().trim().min(1).max(400)

const itemSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    label: plainTextSchema,
  })
  .strict()

const relationshipSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    sourceId: z.string().trim().min(1).max(80),
    targetId: z.string().trim().min(1).max(80),
  })
  .strict()

const providerVariantSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    kind: z.enum(variantKindValues),
    title: plainTextSchema,
    instructions: plainTextSchema,
    sourceItems: z.array(itemSchema).min(3).max(8),
    targetItems: z.array(itemSchema).min(1),
    distractorItems: z.array(itemSchema).max(2),
    relationships: z.array(relationshipSchema).min(1),
    hints: z.array(plainTextSchema).min(1).max(3),
    feedback: z
      .object({
        correct: plainTextSchema,
        incorrect: plainTextSchema,
      })
      .strict(),
    languageMetadata: z
      .object({
        language: z.enum(['en', 'ar']),
        direction: z.enum(['ltr', 'rtl']),
        locale: z.string().trim().min(2).max(20),
      })
      .strict(),
    accessibilityMetadata: z
      .object({
        instructions: plainTextSchema,
        sourceGroupLabel: plainTextSchema,
        targetGroupLabel: plainTextSchema,
      })
      .strict(),
  })
  .strict()

const providerDraftSchema = z
  .object({
    variants: z.array(providerVariantSchema).length(4),
  })
  .strict()

const executableContentPattern =
  /<\s*\/?(?:script|iframe|object|embed|style|svg)|javascript\s*:|on[a-z]+\s*=/i

function pathToField(path: PropertyKey[]): string | undefined {
  const field = path.at(-1)
  return typeof field === 'string' ? field : undefined
}

function variantIdAt(value: unknown, path: PropertyKey[]): string | undefined {
  if (!Array.isArray(value) || typeof path[0] !== 'string') return undefined
  if (path[0] !== 'variants' || typeof path[1] !== 'number') return undefined

  const variant = value[path[1]]
  if (
    typeof variant === 'object' &&
    variant !== null &&
    'id' in variant &&
    typeof variant.id === 'string'
  ) {
    return variant.id
  }

  return undefined
}

function collectExecutableContent(
  value: unknown,
  path: PropertyKey[] = [],
  diagnostics: GenerationDiagnostic[] = [],
  root: unknown = value,
): GenerationDiagnostic[] {
  if (typeof value === 'string' && executableContentPattern.test(value)) {
    diagnostics.push({
      severity: 'error',
      code: 'EXECUTABLE_CONTENT',
      message: 'Generated content contains executable markup or a script URL.',
      variantId: variantIdAt(root, path),
      field: pathToField(path),
    })
    return diagnostics
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectExecutableContent(entry, [...path, index], diagnostics, root),
    )
    return diagnostics
  }

  if (typeof value === 'object' && value !== null) {
    Object.entries(value).forEach(([key, entry]) =>
      collectExecutableContent(entry, [...path, key], diagnostics, root),
    )
  }

  return diagnostics
}

function parseDiagnostics(
  input: unknown,
  error: z.ZodError,
): GenerationDiagnostic[] {
  return error.issues.map((issue) => {
    const path = issue.path
    const variantId = variantIdAt(input, path)
    const field = pathToField(path)

    return {
      severity: 'error' as const,
      code:
        issue.code === 'unrecognized_keys'
          ? 'UNTRUSTED_FIELD'
          : 'INVALID_CONTRACT',
      message:
        issue.code === 'unrecognized_keys'
          ? `Generated content contains an unknown field: ${issue.keys.join(', ')}.`
          : `Generated content is invalid at ${path.join('.') || 'root'}: ${issue.message}`,
      ...(variantId ? { variantId } : {}),
      ...(field ? { field } : {}),
    }
  })
}

function addDiagnostic(
  diagnostics: GenerationDiagnostic[],
  diagnostic: GenerationDiagnostic,
): void {
  diagnostics.push(diagnostic)
}

function validateVariant(
  variant: ProviderVariant,
  allIds: Set<string>,
  diagnostics: GenerationDiagnostic[],
): void {
  if (allIds.has(variant.id)) {
    addDiagnostic(diagnostics, {
      severity: 'error',
      code: 'DUPLICATE_ID',
      message: 'Variant identifiers must be unique across the draft.',
      variantId: variant.id,
      field: 'id',
    })
  }
  allIds.add(variant.id)

  const sourceIds = new Set<string>()
  const targetIds = new Set<string>()

  for (const source of variant.sourceItems) {
    if (allIds.has(source.id)) {
      addDiagnostic(diagnostics, {
        severity: 'error',
        code: 'DUPLICATE_ID',
        message: 'Item identifiers must be unique across the draft.',
        variantId: variant.id,
        field: 'sourceItems',
      })
    }
    allIds.add(source.id)
    sourceIds.add(source.id)
  }

  for (const target of variant.targetItems) {
    if (allIds.has(target.id)) {
      addDiagnostic(diagnostics, {
        severity: 'error',
        code: 'DUPLICATE_ID',
        message: 'Item identifiers must be unique across the draft.',
        variantId: variant.id,
        field: 'targetItems',
      })
    }
    allIds.add(target.id)
    targetIds.add(target.id)
  }

  for (const distractor of variant.distractorItems) {
    if (allIds.has(distractor.id)) {
      addDiagnostic(diagnostics, {
        severity: 'error',
        code: 'DUPLICATE_ID',
        message: 'Item identifiers must be unique across the draft.',
        variantId: variant.id,
        field: 'distractorItems',
      })
    }
    allIds.add(distractor.id)
  }

  const maximumDistractors = Math.floor(variant.sourceItems.length / 4)
  if (variant.distractorItems.length > maximumDistractors) {
    addDiagnostic(diagnostics, {
      severity: 'error',
      code: 'DISTRACTOR_LIMIT',
      message: `This variant may contain at most ${maximumDistractors} distractor(s) for ${variant.sourceItems.length} source items.`,
      variantId: variant.id,
      field: 'distractorItems',
    })
  }

  const relationshipsBySource = new Map<string, number>()
  const targetOwners = new Map<string, string>()
  const relationshipIds = new Set<string>()

  for (const relationship of variant.relationships) {
    if (relationshipIds.has(relationship.id) || allIds.has(relationship.id)) {
      addDiagnostic(diagnostics, {
        severity: 'error',
        code: 'DUPLICATE_ID',
        message: 'Relationship identifiers must be unique across the draft.',
        variantId: variant.id,
        field: 'relationships',
      })
    }
    relationshipIds.add(relationship.id)
    allIds.add(relationship.id)

    if (!sourceIds.has(relationship.sourceId)) {
      addDiagnostic(diagnostics, {
        severity: 'error',
        code: 'UNKNOWN_SOURCE',
        message:
          'Every relationship must refer to a source item in this variant.',
        variantId: variant.id,
        field: 'relationships',
      })
    }

    if (!targetIds.has(relationship.targetId)) {
      addDiagnostic(diagnostics, {
        severity: 'error',
        code: 'UNKNOWN_TARGET',
        message:
          'Every relationship must refer to a target item in this variant.',
        variantId: variant.id,
        field: 'relationships',
      })
    }

    relationshipsBySource.set(
      relationship.sourceId,
      (relationshipsBySource.get(relationship.sourceId) ?? 0) + 1,
    )

    const owner = targetOwners.get(relationship.targetId)
    if (owner && owner !== relationship.sourceId) {
      addDiagnostic(diagnostics, {
        severity: 'error',
        code: 'TARGET_REUSED',
        message: 'A target cannot be related to more than one source item.',
        variantId: variant.id,
        field: 'relationships',
      })
    }
    targetOwners.set(relationship.targetId, relationship.sourceId)
  }

  for (const source of variant.sourceItems) {
    if (!relationshipsBySource.has(source.id)) {
      addDiagnostic(diagnostics, {
        severity: 'error',
        code: 'SOURCE_WITHOUT_TARGET',
        message: 'Every source item needs at least one matching target.',
        variantId: variant.id,
        field: 'relationships',
      })
    }
  }

  for (const target of variant.targetItems) {
    if (!targetOwners.has(target.id)) {
      addDiagnostic(diagnostics, {
        severity: 'error',
        code: 'TARGET_WITHOUT_SOURCE',
        message:
          'Every target item must be used by a relationship or be a distractor.',
        variantId: variant.id,
        field: 'targetItems',
      })
    }
  }

  if (variant.instructions.length > 160) {
    addDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'CONTENT_TOO_LONG',
      message:
        'Instructions are long; a teacher should consider shortening them.',
      variantId: variant.id,
      field: 'instructions',
    })
  }
}

function validateVariantKinds(
  variants: ProviderVariant[],
  diagnostics: GenerationDiagnostic[],
): void {
  const counts = new Map<string, number>()
  for (const variant of variants) {
    counts.set(variant.kind, (counts.get(variant.kind) ?? 0) + 1)
  }

  const expected: Array<[ProviderVariant['kind'], number]> = [
    ['standard', 2],
    ['scaffold', 1],
    ['challenge', 1],
  ]

  for (const [kind, expectedCount] of expected) {
    if ((counts.get(kind) ?? 0) !== expectedCount) {
      diagnostics.push({
        severity: 'error',
        code: 'MISSING_VARIANT_KIND',
        message: `The draft must contain exactly ${expectedCount} ${kind} variant(s).`,
        field: 'variants',
      })
    }
  }
}

export function validateProviderDraft(input: unknown): ValidationResult {
  const diagnostics = collectExecutableContent(input)
  const parsed = providerDraftSchema.safeParse(input)

  if (!parsed.success) {
    diagnostics.push(...parseDiagnostics(input, parsed.error))
    return { ok: false, diagnostics }
  }

  validateVariantKinds(parsed.data.variants, diagnostics)
  const allIds = new Set<string>()
  for (const variant of parsed.data.variants) {
    validateVariant(variant, allIds, diagnostics)
  }

  const hasErrors = diagnostics.some(
    (diagnostic) => diagnostic.severity === 'error',
  )
  return hasErrors
    ? { ok: false, diagnostics }
    : { ok: true, draft: parsed.data, diagnostics }
}
