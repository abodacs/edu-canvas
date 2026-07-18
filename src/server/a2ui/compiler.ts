import type { LessonLanguage } from '@/shared/generation-contract'
import {
  A2UI_CATALOG_ID,
  A2UI_CATALOG_VERSION,
  A2UI_PROTOCOL_VERSION,
  validateA2UIMessage,
} from '@/shared/a2ui-contract'
import type {
  A2UIComponent,
  A2UIMessage,
  A2UIPreviewDataModel,
} from '@/shared/a2ui-contract'

import type { ProviderLessonDraft, ProviderVariant } from '../generation/types'

const purposeLabels = [
  'Teach the model',
  'Independent practice',
  'Guided practice',
  'Review and challenge',
] as const

const scaffoldLabels = {
  standard: 'Core matching scaffold',
  scaffold: 'Extra guided support',
  challenge: 'Higher reasoning demand',
} as const

export interface LessonPreviewCompileInput {
  requestId: string
  grade: number
  standardId: string
  language: LessonLanguage
  draft: ProviderLessonDraft
}

export interface CompiledLessonPreview {
  protocolVersion: typeof A2UI_PROTOCOL_VERSION
  catalogId: typeof A2UI_CATALOG_ID
  catalogVersion: typeof A2UI_CATALOG_VERSION
  messages: A2UIMessage[]
}

export class LessonPreviewCompileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LessonPreviewCompileError'
  }
}

function assertComponentId(value: string, label: string): string {
  if (!/^[A-Za-z0-9:_./-]{1,120}$/u.test(value)) {
    throw new LessonPreviewCompileError(
      `The lesson preview contains an invalid ${label}.`,
    )
  }

  return value
}

function text(
  id: string,
  value: string,
  variant: Extract<A2UIComponent, { component: 'Text' }>['variant'],
): Extract<A2UIComponent, { component: 'Text' }> {
  return {
    id,
    component: 'Text',
    text: value,
    ...(variant ? { variant } : {}),
  }
}

function action(
  name: Extract<
    Extract<A2UIComponent, { component: 'MatchCard' }>['action'],
    { event: unknown }
  >['event']['name'],
  surfaceId: string,
  itemId?: string,
) {
  return {
    event: {
      name,
      context: {
        surfaceId,
        ...(itemId ? { itemId } : {}),
      },
    },
  }
}

function matchCard(
  surfaceId: string,
  item: { id: string; label: string },
  group: 'source' | 'target',
  description: string,
): Extract<A2UIComponent, { component: 'MatchCard' }> {
  return {
    id: `${group}-card-${assertComponentId(item.id, 'item id')}`,
    component: 'MatchCard',
    itemId: assertComponentId(item.id, 'item id'),
    label: item.label,
    group,
    description,
    action: action(
      group === 'source' ? 'selectSource' : 'selectTarget',
      surfaceId,
      item.id,
    ),
  }
}

function previewMessagesForVariant(
  input: LessonPreviewCompileInput,
  variant: ProviderVariant,
  index: number,
): A2UIMessage[] {
  const variantId = assertComponentId(variant.id, 'variant id')
  const surfaceId = assertComponentId(
    `preview-${input.requestId}-${variantId}`,
    'surface id',
  )
  const purpose = purposeLabels[index] ?? 'Lesson practice'
  const sourceLabel = variant.accessibilityMetadata.sourceGroupLabel
  const targetLabel = variant.accessibilityMetadata.targetGroupLabel
  const sourceCards = variant.sourceItems.map((item) =>
    matchCard(surfaceId, item, 'source', sourceLabel),
  )
  const targetCards = [...variant.targetItems, ...variant.distractorItems].map(
    (item) => matchCard(surfaceId, item, 'target', targetLabel),
  )
  const sourceCardIds = sourceCards.map((card) => card.id)
  const targetCardIds = targetCards.map((card) => card.id)

  const components: A2UIComponent[] = [
    {
      id: 'root',
      component: 'Column',
      children: [
        'title',
        'purpose',
        'metadata',
        'instructions',
        'matching-board',
        'preview-actions',
        'preview-status',
      ],
    },
    text('title', variant.title, 'heading'),
    text('purpose', purpose, 'subheading'),
    text(
      'metadata',
      `Grade ${input.grade} · ${input.standardId} · ${variant.languageMetadata.language.toUpperCase()} · ${scaffoldLabels[variant.kind]}`,
      'label',
    ),
    text('instructions', variant.accessibilityMetadata.instructions, 'body'),
    {
      id: 'matching-board',
      component: 'Row',
      children: ['source-panel', 'target-panel'],
    },
    {
      id: 'source-panel',
      component: 'Card',
      child: 'source-column',
      tone: 'surface',
    },
    {
      id: 'source-column',
      component: 'Column',
      children: ['source-label', ...sourceCardIds],
    },
    text('source-label', sourceLabel, 'label'),
    ...sourceCards,
    {
      id: 'target-panel',
      component: 'Card',
      child: 'target-column',
      tone: 'accent',
    },
    {
      id: 'target-column',
      component: 'Column',
      children: ['target-label', ...targetCardIds],
    },
    text('target-label', targetLabel, 'label'),
    ...targetCards,
    {
      id: 'preview-actions',
      component: 'Row',
      children: ['clear-selection'],
    },
    {
      id: 'clear-selection',
      component: 'Button',
      label: 'Clear selection',
      variant: 'quiet',
      action: action('clearSelection', surfaceId),
    },
    {
      id: 'preview-status',
      component: 'Status',
      text: 'Teacher preview only. Nothing is published or submitted.',
      kind: 'info',
    },
  ]

  const dataModel: A2UIPreviewDataModel = {
    variantId,
    purpose,
    accessibilityDescription: variant.accessibilityMetadata.instructions,
    scaffold: scaffoldLabels[variant.kind],
    standardId: input.standardId,
    grade: input.grade,
    language: variant.languageMetadata.language,
    direction: variant.languageMetadata.direction,
    validationState: 'ready-for-review',
    selectedItemIds: [],
  }

  const messages: A2UIMessage[] = [
    {
      version: A2UI_PROTOCOL_VERSION,
      createSurface: {
        surfaceId,
        catalogId: A2UI_CATALOG_ID,
      },
    },
    {
      version: A2UI_PROTOCOL_VERSION,
      updateComponents: {
        surfaceId,
        components,
      },
    },
    {
      version: A2UI_PROTOCOL_VERSION,
      updateDataModel: {
        surfaceId,
        path: '/',
        value: dataModel,
      },
    },
  ]

  for (const message of messages) {
    const validation = validateA2UIMessage(message)
    if (!validation.ok) {
      throw new LessonPreviewCompileError(validation.message)
    }
  }

  return messages
}

export function compileLessonPreview(
  input: LessonPreviewCompileInput,
): CompiledLessonPreview {
  if (input.draft.variants.length !== 4) {
    throw new LessonPreviewCompileError(
      'Only a complete four-variant lesson can enter the preview.',
    )
  }

  if (
    new Set(input.draft.variants.map((variant) => variant.id)).size !==
    input.draft.variants.length
  ) {
    throw new LessonPreviewCompileError(
      'The lesson preview contains duplicate variant identifiers.',
    )
  }

  if (!Number.isInteger(input.grade) || input.grade < 3 || input.grade > 6) {
    throw new LessonPreviewCompileError('The lesson grade is not supported.')
  }

  const messages = input.draft.variants.flatMap((variant, index) =>
    previewMessagesForVariant(input, variant, index),
  )

  return {
    protocolVersion: A2UI_PROTOCOL_VERSION,
    catalogId: A2UI_CATALOG_ID,
    catalogVersion: A2UI_CATALOG_VERSION,
    messages,
  }
}
