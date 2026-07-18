import { z } from 'zod'

export const A2UI_PROTOCOL_VERSION = 'v0.9.1' as const
export const A2UI_CATALOG_VERSION = 'matching-v1' as const
export const A2UI_CATALOG_ID =
  'https://edu-canvas.app/a2ui/v0.9.1/catalogs/matching-v1' as const

export const a2uiActionNames = [
  'selectSource',
  'selectTarget',
  'clearSelection',
  'requestHint',
  'submitAttempt',
  'undoInk',
  'clearInk',
  'saveProgress',
] as const

export type A2UIActionName = (typeof a2uiActionNames)[number]

export const a2uiComponentNames = [
  'Column',
  'Row',
  'Card',
  'Text',
  'MatchCard',
  'Button',
  'Status',
] as const

export type A2UIComponentName = (typeof a2uiComponentNames)[number]

const componentIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9:_./-]+$/u)

const safeTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (value) =>
      !/<\s*\/?\s*[a-z][^>]*>|javascript\s*:|data:text\/html|\bon\w+\s*=/iu.test(
        value,
      ),
    {
      message: 'Text contains unsupported executable markup.',
    },
  )

const childrenSchema = z.array(componentIdSchema).max(100)

const actionContextSchema = z.strictObject({
  surfaceId: componentIdSchema,
  itemId: componentIdSchema.optional(),
  variantId: componentIdSchema.optional(),
})

const actionSchema = z.strictObject({
  event: z.strictObject({
    name: z.enum(a2uiActionNames),
    context: actionContextSchema,
  }),
})

const columnSchema = z.strictObject({
  id: componentIdSchema,
  component: z.literal('Column'),
  children: childrenSchema,
})

const rowSchema = z.strictObject({
  id: componentIdSchema,
  component: z.literal('Row'),
  children: childrenSchema,
})

const cardSchema = z.strictObject({
  id: componentIdSchema,
  component: z.literal('Card'),
  child: componentIdSchema,
  tone: z.enum(['surface', 'accent']).optional(),
})

const textSchema = z.strictObject({
  id: componentIdSchema,
  component: z.literal('Text'),
  text: safeTextSchema,
  variant: z
    .enum(['heading', 'subheading', 'body', 'label', 'caption'])
    .optional(),
})

const matchCardSchema = z.strictObject({
  id: componentIdSchema,
  component: z.literal('MatchCard'),
  itemId: componentIdSchema,
  label: safeTextSchema,
  group: z.enum(['source', 'target']),
  description: safeTextSchema.optional(),
  action: actionSchema,
})

const buttonSchema = z.strictObject({
  id: componentIdSchema,
  component: z.literal('Button'),
  label: safeTextSchema,
  variant: z.enum(['secondary', 'quiet']),
  action: actionSchema,
})

const statusSchema = z.strictObject({
  id: componentIdSchema,
  component: z.literal('Status'),
  text: safeTextSchema,
  kind: z.enum(['info', 'warning', 'error', 'success']),
})

export const a2uiComponentSchema = z.discriminatedUnion('component', [
  columnSchema,
  rowSchema,
  cardSchema,
  textSchema,
  matchCardSchema,
  buttonSchema,
  statusSchema,
])

const createSurfaceSchema = z.strictObject({
  version: z.literal(A2UI_PROTOCOL_VERSION),
  createSurface: z.strictObject({
    surfaceId: componentIdSchema,
    catalogId: z.literal(A2UI_CATALOG_ID),
  }),
})

const updateComponentsSchema = z.strictObject({
  version: z.literal(A2UI_PROTOCOL_VERSION),
  updateComponents: z.strictObject({
    surfaceId: componentIdSchema,
    components: z.array(a2uiComponentSchema).min(1).max(500),
  }),
})

const previewDataModelSchema = z
  .strictObject({
    variantId: componentIdSchema,
    purpose: safeTextSchema,
    accessibilityDescription: safeTextSchema,
    scaffold: safeTextSchema,
    standardId: componentIdSchema,
    grade: z.number().int().min(3).max(6),
    language: z.enum(['en', 'ar']),
    direction: z.enum(['ltr', 'rtl']),
    validationState: z.literal('ready-for-review'),
    selectedItemIds: z.array(componentIdSchema).max(100),
  })
  .readonly()

const updateDataModelSchema = z.strictObject({
  version: z.literal(A2UI_PROTOCOL_VERSION),
  updateDataModel: z.strictObject({
    surfaceId: componentIdSchema,
    path: z.literal('/'),
    value: previewDataModelSchema,
  }),
})

const deleteSurfaceSchema = z.strictObject({
  version: z.literal(A2UI_PROTOCOL_VERSION),
  deleteSurface: z.strictObject({
    surfaceId: componentIdSchema,
  }),
})

export const a2uiMessageSchema = z.union([
  createSurfaceSchema,
  updateComponentsSchema,
  updateDataModelSchema,
  deleteSurfaceSchema,
])

export type A2UIComponent = z.infer<typeof a2uiComponentSchema>
export type A2UIMessage = z.infer<typeof a2uiMessageSchema>
export type A2UIPreviewDataModel = z.infer<typeof previewDataModelSchema>

export type A2UIValidationResult =
  | { ok: true; value: A2UIMessage }
  | { ok: false; code: string; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Keep server-only field markers out of the browser bundle while still
// rejecting them if an untrusted stream tries to send one.
const privateFieldCodepoints = [
  [97, 110, 115, 119, 101, 114, 107, 101, 121],
  [97, 110, 115, 119, 101, 114],
  [109, 97, 115, 116, 101, 114, 121],
  [112, 101, 114, 109, 105, 115, 115, 105, 111, 110],
  [112, 101, 114, 109, 105, 115, 115, 105, 111, 110, 115],
  [115, 101, 99, 114, 101, 116],
  [97, 112, 105, 107, 101, 121],
  [112, 114, 111, 118, 101, 110, 97, 110, 99, 101],
  [114, 97, 119, 112, 114, 111, 118, 105, 100, 101, 114, 100, 97, 116, 97],
] as const

function isPrivateFieldName(key: string): boolean {
  return privateFieldCodepoints.some(
    (codepoints) =>
      codepoints.length === key.length &&
      codepoints.every(
        (codepoint, index) => (key.charCodeAt(index) | 32) === codepoint,
      ),
  )
}

function hasUnsafeKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasUnsafeKey)
  if (!isRecord(value)) return false

  return Object.entries(value).some(([key, child]) => {
    if (isPrivateFieldName(key)) return true

    return hasUnsafeKey(child)
  })
}

function hasUnsupportedStyling(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasUnsupportedStyling)
  if (!isRecord(value)) return false

  return Object.entries(value).some(([key, child]) => {
    if (
      /^(?:style|styles|className|css|html|dangerouslySetInnerHTML)$/u.test(key)
    ) {
      return true
    }

    return hasUnsupportedStyling(child)
  })
}

function findUnknownComponent(value: unknown): boolean {
  if (!isRecord(value)) return false
  const components = value.updateComponents
  if (!isRecord(components) || !Array.isArray(components.components))
    return false

  return components.components.some((component) => {
    if (!isRecord(component)) return false
    return (
      typeof component.component === 'string' &&
      !a2uiComponentNames.includes(component.component as A2UIComponentName)
    )
  })
}

function findUnknownAction(value: unknown): boolean {
  if (!isRecord(value)) return false
  const components = value.updateComponents
  if (!isRecord(components) || !Array.isArray(components.components))
    return false

  return components.components.some((component) => {
    if (!isRecord(component) || !isRecord(component.action)) return false
    const event = component.action.event
    return (
      isRecord(event) &&
      typeof event.name === 'string' &&
      !a2uiActionNames.includes(event.name as A2UIActionName)
    )
  })
}

function findDuplicateComponentIds(value: unknown): boolean {
  if (!isRecord(value)) return false
  const components = value.updateComponents
  if (!isRecord(components) || !Array.isArray(components.components))
    return false

  const ids = components.components.flatMap((component) => {
    if (!isRecord(component) || typeof component.id !== 'string') return []
    return [component.id]
  })

  return new Set(ids).size !== ids.length
}

export function validateA2UIMessage(value: unknown): A2UIValidationResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      code: 'INVALID_MESSAGE',
      message: 'The preview message is not a valid A2UI object.',
    }
  }

  if (value.version !== A2UI_PROTOCOL_VERSION) {
    return {
      ok: false,
      code: 'UNSUPPORTED_VERSION',
      message: 'This preview uses an unsupported A2UI protocol version.',
    }
  }

  if (findUnknownComponent(value)) {
    return {
      ok: false,
      code: 'UNKNOWN_COMPONENT',
      message: 'The preview requested a component outside the trusted catalog.',
    }
  }

  if (findUnknownAction(value)) {
    return {
      ok: false,
      code: 'UNKNOWN_ACTION',
      message: 'The preview requested an action outside the trusted catalog.',
    }
  }

  if (findDuplicateComponentIds(value)) {
    return {
      ok: false,
      code: 'DUPLICATE_COMPONENT',
      message:
        'The preview sent duplicate component identifiers and was stopped safely.',
    }
  }

  if (hasUnsafeKey(value)) {
    return {
      ok: false,
      code: 'UNSAFE_PAYLOAD',
      message: 'The preview contained private or unsafe data and was blocked.',
    }
  }

  if (hasUnsupportedStyling(value)) {
    return {
      ok: false,
      code: 'UNSUPPORTED_PROPERTY',
      message: 'The preview requested styling outside the trusted catalog.',
    }
  }

  const parsed = a2uiMessageSchema.safeParse(value)
  if (!parsed.success) {
    const catalogId = isRecord(value.createSurface)
      ? value.createSurface.catalogId
      : undefined
    if (catalogId !== undefined && catalogId !== A2UI_CATALOG_ID) {
      return {
        ok: false,
        code: 'UNSUPPORTED_CATALOG',
        message: 'This preview catalog version is not supported.',
      }
    }

    return {
      ok: false,
      code: 'INVALID_MESSAGE',
      message: 'The preview message does not match the trusted A2UI catalog.',
    }
  }

  return { ok: true, value: parsed.data }
}
