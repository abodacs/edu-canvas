import type {
  LessonDifficulty,
  LessonLanguage,
} from '@/shared/generation-contract'

import { validatorVersion } from './validation'
import type {
  GenerationDiagnostic,
  ProviderLessonDraft,
  ProviderVariant,
  VariantKind,
} from './types'

export const promptTemplateVersion = 'lesson-prompt-v1'

export interface NormalizedGenerationRequest {
  prompt: string
  grade: number
  standardId: string
  language: LessonLanguage
  difficulty: LessonDifficulty
}

export interface ProviderProvenance {
  provider: string
  model: string
  promptTemplateVersion: string
  validatorVersion: string
  catalogVersion?: string
}

export interface ProviderGenerationContext {
  correctionAttempt: boolean
  diagnostics: readonly GenerationDiagnostic[]
}

export interface ProviderResponse {
  draft: unknown
}

export type ProviderFailureKind =
  'timeout' | 'rate-limit' | 'transient' | 'terminal'

export class LessonProviderError extends Error {
  readonly kind: ProviderFailureKind
  readonly safeMessage: string

  constructor(kind: ProviderFailureKind, safeMessage: string) {
    super(safeMessage)
    this.name = 'LessonProviderError'
    this.kind = kind
    this.safeMessage = safeMessage
  }
}

export interface LessonDraftProvider {
  readonly provenance: ProviderProvenance
  generate: (
    request: NormalizedGenerationRequest,
    context: ProviderGenerationContext,
  ) => Promise<ProviderResponse>
}

export interface OpenAILessonDraftProviderOptions {
  apiKey: string
  model: string
  baseUrl?: string
  fetchImplementation?: typeof fetch
}

function localizedText(
  language: LessonLanguage,
  english: string,
  arabic: string,
) {
  return language === 'ar' ? arabic : english
}

function createLearningPath(
  request: NormalizedGenerationRequest,
): NonNullable<ProviderLessonDraft['learningPath']> {
  return {
    direction: 'forward',
    steps: [
      {
        nodeId: 'graph_node_equal_parts',
        screenPurposeId: 'screen_purpose_equal_parts',
      },
      {
        nodeId: 'graph_node_equivalent_fractions',
        screenPurposeId: 'screen_purpose_equivalent_fractions',
      },
    ],
    rationale: localizedText(
      request.language,
      'Start with equal parts so the lesson can connect the same whole to different fraction names.',
      'نبدأ بالأجزاء المتساوية حتى يربط الدرس بين الكل نفسه وأسماء الكسور المختلفة.',
    ),
    nextScreenRationale: localizedText(
      request.language,
      'The matching screen makes that connection visible before teacher review.',
      'تجعل شاشة المطابقة هذا الارتباط واضحًا قبل مراجعة المعلم.',
    ),
  }
}

function createVariant(
  request: NormalizedGenerationRequest,
  kind: VariantKind,
  index: number,
): ProviderVariant {
  const sourceLabels = ['1/2', '2/3', '3/4', '1/3', '2/5', '3/5']
  const targetLabels = ['2/4', '4/6', '6/8', '2/6', '4/10', '6/10']
  const sourceItems = sourceLabels.map((label, itemIndex) => ({
    id: `source-${index}-${itemIndex + 1}`,
    label,
  }))
  const targetItems = targetLabels.map((label, itemIndex) => ({
    id: `target-${index}-${itemIndex + 1}`,
    label,
  }))
  const language = request.language

  return {
    id: `variant-${index}`,
    kind,
    title: localizedText(
      language,
      `${kind === 'scaffold' ? 'Guided' : kind === 'challenge' ? 'Review' : 'Practice'} equivalent fractions`,
      kind === 'scaffold'
        ? 'كسور مكافئة مع إرشاد'
        : kind === 'challenge'
          ? 'مراجعة الكسور المكافئة'
          : 'تدريب على الكسور المكافئة',
    ),
    instructions: localizedText(
      language,
      'Match each fraction with another name for the same part of a whole.',
      'طابق كل كسر مع اسم آخر للجزء نفسه من الكل.',
    ),
    sourceItems,
    targetItems,
    distractorItems: [{ id: `distractor-${index}`, label: '2/3' }],
    relationships: sourceItems.map((source, itemIndex) => ({
      id: `relationship-${index}-${itemIndex + 1}`,
      sourceId: source.id,
      targetId: targetItems[itemIndex].id,
    })),
    hints: [
      localizedText(
        language,
        'Compare how many equal parts are shaded in each fraction.',
        'قارن عدد الأجزاء المتساوية في كل كسر.',
      ),
    ],
    feedback: {
      correct: localizedText(
        language,
        'These fractions name the same part of a whole.',
        'هذه الكسور تسمي الجزء نفسه من الكل.',
      ),
      incorrect: localizedText(
        language,
        'Try comparing the equal parts in each fraction.',
        'حاول مقارنة الأجزاء المتساوية في كل كسر.',
      ),
    },
    languageMetadata: {
      language,
      direction: language === 'ar' ? 'rtl' : 'ltr',
      locale: language === 'ar' ? 'ar' : 'en-US',
    },
    accessibilityMetadata: {
      instructions: localizedText(
        language,
        'Instructions for matching equivalent fractions',
        'تعليمات لمطابقة الكسور المكافئة',
      ),
      sourceGroupLabel: localizedText(
        language,
        'Fractions to match',
        'الكسور المطلوب مطابقتها',
      ),
      targetGroupLabel: localizedText(
        language,
        'Possible equivalent fractions',
        'الكسور المكافئة المحتملة',
      ),
    },
  }
}

export function createEquivalentFractionsDraft(
  request: NormalizedGenerationRequest,
): ProviderLessonDraft {
  return {
    learningPath: createLearningPath(request),
    variants: [
      createVariant(request, 'standard', 1),
      createVariant(request, 'standard', 2),
      createVariant(request, 'scaffold', 3),
      createVariant(request, 'challenge', 4),
    ],
  }
}

export type DeterministicProviderScenario =
  | 'valid'
  | 'invalid'
  | 'invalid-then-valid'
  | 'invalid-then-invalid'
  | 'timeout'
  | 'rate-limit'

export function createDeterministicLessonDraftProvider(
  scenario: DeterministicProviderScenario = 'valid',
): LessonDraftProvider & { readonly calls: number } {
  let calls = 0
  const provenance: ProviderProvenance = {
    provider: 'deterministic-fixture',
    model: 'equivalent-fractions-fixture-v1',
    promptTemplateVersion,
    validatorVersion,
  }

  return {
    provenance,
    get calls() {
      return calls
    },

    async generate(request) {
      calls += 1

      if (scenario === 'timeout') {
        throw new LessonProviderError(
          'timeout',
          'The lesson provider timed out. Try again.',
        )
      }

      if (scenario === 'rate-limit') {
        throw new LessonProviderError(
          'rate-limit',
          'The lesson provider is busy. Try again in a moment.',
        )
      }

      const shouldBeInvalid =
        scenario === 'invalid' ||
        (scenario === 'invalid-then-valid' && calls === 1) ||
        scenario === 'invalid-then-invalid'

      const draft = createEquivalentFractionsDraft(request)
      if (shouldBeInvalid) {
        draft.variants[0].relationships[0].targetId = 'missing-target'
      }

      return {
        draft,
      }
    },
  }
}

function buildPrompt(
  request: NormalizedGenerationRequest,
  context: ProviderGenerationContext,
): string {
  const correction = context.correctionAttempt
    ? ` Correct the previous draft using only these safe validation diagnostics: ${context.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join(' ')}`
    : ''

  return [
    'Create a structured lesson draft for Edu-Canvas equivalent-fractions matching.',
    'Return only the canonical JSON contract. Never return HTML, CSS, JavaScript, A2UI, URLs, or executable content.',
    `Teacher request: ${request.prompt}`,
    `Grade: ${request.grade}. Primary standard: ${request.standardId}. Language: ${request.language}. Difficulty: ${request.difficulty}.`,
    'Create exactly two standard variants, one scaffold variant, and one challenge variant. Each variant needs 3–8 sources, matching targets, at most two bounded distractors, stable ids, hints, deterministic feedback, language metadata, and accessibility metadata.',
    'Include one forward learningPath with 2–12 ordered graph steps. Each step must contain only the approved graph node id and screen-purpose id supplied by the curriculum context. Include concise learner-safe rationale and nextScreenRationale; do not include chain-of-thought or private learner data.',
    correction,
  ].join('\n')
}

function extractResponseDraft(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return undefined
  if ('output_text' in body && typeof body.output_text === 'string') {
    return JSON.parse(body.output_text) as unknown
  }

  if (!('output' in body) || !Array.isArray(body.output)) return undefined
  for (const item of body.output) {
    if (typeof item !== 'object' || item === null || !('content' in item)) {
      continue
    }
    if (!Array.isArray(item.content)) continue
    for (const content of item.content) {
      if (
        typeof content === 'object' &&
        content !== null &&
        'text' in content &&
        typeof content.text === 'string'
      ) {
        return JSON.parse(content.text) as unknown
      }
    }
  }

  return undefined
}

export function createOpenAILessonDraftProvider(
  options: OpenAILessonDraftProviderOptions,
): LessonDraftProvider {
  const fetchImplementation = options.fetchImplementation ?? fetch
  const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1'
  const provenance: ProviderProvenance = {
    provider: 'openai',
    model: options.model,
    promptTemplateVersion,
    validatorVersion,
  }

  return {
    provenance,
    async generate(request, context) {
      let response: Response
      try {
        response = await fetchImplementation(
          `${baseUrl.replace(/\/$/, '')}/responses`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${options.apiKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: options.model,
              input: buildPrompt(request, context),
              text: {
                format: {
                  type: 'json_schema',
                  name: 'edu_canvas_lesson_draft',
                  strict: true,
                  schema: lessonDraftJsonSchema,
                },
              },
            }),
            signal: AbortSignal.timeout(15_000),
          },
        )
      } catch {
        throw new LessonProviderError(
          'timeout',
          'The lesson provider could not be reached. Try again.',
        )
      }

      if (!response.ok) {
        if (response.status === 408 || response.status === 504) {
          throw new LessonProviderError(
            'timeout',
            'The lesson provider timed out. Try again.',
          )
        }
        if (response.status === 429) {
          throw new LessonProviderError(
            'rate-limit',
            'The lesson provider is busy. Try again in a moment.',
          )
        }
        if (response.status >= 500) {
          throw new LessonProviderError(
            'transient',
            'The lesson provider is temporarily unavailable. Try again.',
          )
        }
        throw new LessonProviderError(
          'terminal',
          'The lesson provider rejected this generation request.',
        )
      }

      let body: unknown
      try {
        body = await response.json()
      } catch {
        throw new LessonProviderError(
          'terminal',
          'The lesson provider returned an unreadable response.',
        )
      }

      let draft: unknown
      try {
        draft = extractResponseDraft(body)
      } catch {
        throw new LessonProviderError(
          'terminal',
          'The lesson provider returned malformed lesson content.',
        )
      }

      if (!draft) {
        throw new LessonProviderError(
          'terminal',
          'The lesson provider returned no lesson content.',
        )
      }

      return {
        draft,
      }
    },
  }
}

const lessonDraftJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['variants', 'learningPath'],
  properties: {
    variants: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'kind',
          'title',
          'instructions',
          'sourceItems',
          'targetItems',
          'distractorItems',
          'relationships',
          'hints',
          'feedback',
          'languageMetadata',
          'accessibilityMetadata',
        ],
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: ['standard', 'scaffold', 'challenge'] },
          title: { type: 'string' },
          instructions: { type: 'string' },
          sourceItems: { type: 'array', items: { $ref: '#/$defs/item' } },
          targetItems: { type: 'array', items: { $ref: '#/$defs/item' } },
          distractorItems: { type: 'array', items: { $ref: '#/$defs/item' } },
          relationships: {
            type: 'array',
            items: { $ref: '#/$defs/relationship' },
          },
          hints: { type: 'array', items: { type: 'string' } },
          feedback: {
            type: 'object',
            additionalProperties: false,
            required: ['correct', 'incorrect'],
            properties: {
              correct: { type: 'string' },
              incorrect: { type: 'string' },
            },
          },
          languageMetadata: {
            type: 'object',
            additionalProperties: false,
            required: ['language', 'direction', 'locale'],
            properties: {
              language: { type: 'string', enum: ['en', 'ar'] },
              direction: { type: 'string', enum: ['ltr', 'rtl'] },
              locale: { type: 'string' },
            },
          },
          accessibilityMetadata: {
            type: 'object',
            additionalProperties: false,
            required: ['instructions', 'sourceGroupLabel', 'targetGroupLabel'],
            properties: {
              instructions: { type: 'string' },
              sourceGroupLabel: { type: 'string' },
              targetGroupLabel: { type: 'string' },
            },
          },
        },
      },
    },
    learningPath: {
      type: 'object',
      additionalProperties: false,
      required: ['direction', 'steps', 'rationale', 'nextScreenRationale'],
      properties: {
        direction: { type: 'string', enum: ['forward', 'reverse'] },
        steps: {
          type: 'array',
          minItems: 2,
          maxItems: 12,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['nodeId', 'screenPurposeId'],
            properties: {
              nodeId: { type: 'string' },
              screenPurposeId: { type: 'string' },
            },
          },
        },
        rationale: { type: 'string' },
        nextScreenRationale: { type: 'string' },
      },
    },
  },
  $defs: {
    item: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'label'],
      properties: {
        id: { type: 'string' },
        label: { type: 'string' },
      },
    },
    relationship: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'sourceId', 'targetId'],
      properties: {
        id: { type: 'string' },
        sourceId: { type: 'string' },
        targetId: { type: 'string' },
      },
    },
  },
} as const
