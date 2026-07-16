import { randomUUID } from 'node:crypto'

import { lessonGenerationInputSchema } from '@/shared/generation-contract'
import type { LessonDifficulty } from '@/shared/generation-contract'

import { assertTenantAccess, canAccess } from '@/server/demo/policy'
import { demoSeed } from '@/server/seed-data'

import { toPublicGenerationResult } from './projection'
import { LessonProviderError } from './provider'
import type {
  LessonDraftProvider,
  NormalizedGenerationRequest,
  ProviderProvenance,
} from './provider'
import type {
  GenerationCommand,
  GenerationDiagnostic,
  GenerationPersistence,
  GenerationServiceResult,
  GenerationState,
  GenerationAttemptRecord,
  LessonGenerationRecord,
  ProviderLessonDraft,
} from './types'
import { validateProviderDraft } from './validation'

export class GenerationInputError extends Error {
  constructor() {
    super('Generation input is invalid.')
    this.name = 'GenerationInputError'
  }
}

export class GenerationRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GenerationRequestError'
  }
}

export interface ContentSafetyResult {
  allowed: boolean
}

export interface ContentSafety {
  checkPrompt: (prompt: string) => ContentSafetyResult
  checkGeneratedContent: (content: unknown) => ContentSafetyResult
}

export interface GenerationServiceOptions {
  persistence: GenerationPersistence
  provider: LessonDraftProvider
  safety?: ContentSafety
  now?: () => string
  requestIdFactory?: () => string
}

interface NormalizedCommandInput extends NormalizedGenerationRequest {
  idempotencyKey: string
  retryOfRequestId?: string
}

const unsafeContentPattern =
  /<\s*\/?(?:script|iframe|object|embed)|javascript\s*:|ignore\s+(?:all|any|the|previous)\s+instructions|\b(?:api|secret|access)\s+key\b/i

const supportedStandardIds: ReadonlySet<string> = new Set([
  demoSeed.standard.id,
  demoSeed.standard.code,
])

function hashForIdempotency(value: string): string {
  let hash = 2_166_136_261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16_777_619)
  }
  return Math.abs(hash).toString(36)
}

function createImplicitIdempotencyKey(
  input: Pick<
    NormalizedCommandInput,
    'prompt' | 'grade' | 'standardId' | 'language' | 'difficulty'
  >,
  retryOfRequestId?: string,
): string {
  return `implicit-${hashForIdempotency(
    JSON.stringify({ ...input, retryOfRequestId }),
  )}`
}

export function normalizeGenerationInput(
  input: unknown,
): NormalizedCommandInput {
  const parsed = lessonGenerationInputSchema.safeParse(input)
  if (!parsed.success) throw new GenerationInputError()

  const grade =
    typeof parsed.data.grade === 'number'
      ? parsed.data.grade
      : Number(parsed.data.grade)
  if (!Number.isInteger(grade) || grade < 3 || grade > 6) {
    throw new GenerationInputError()
  }

  if (!supportedStandardIds.has(parsed.data.standardId)) {
    throw new GenerationInputError()
  }

  const standardId =
    parsed.data.standardId === demoSeed.standard.code
      ? demoSeed.standard.id
      : parsed.data.standardId
  const difficulty: LessonDifficulty = parsed.data.difficulty ?? 'on-level'
  const retryOfRequestId = parsed.data.retryOfRequestId
  const normalized = {
    prompt: parsed.data.prompt,
    grade,
    standardId,
    language: parsed.data.language,
    difficulty,
  }

  return {
    ...normalized,
    idempotencyKey:
      parsed.data.idempotencyKey ??
      createImplicitIdempotencyKey(normalized, retryOfRequestId),
    ...(retryOfRequestId ? { retryOfRequestId } : {}),
  }
}

export function createDefaultContentSafety(): ContentSafety {
  return {
    checkPrompt(prompt) {
      return { allowed: !unsafeContentPattern.test(prompt) }
    },
    checkGeneratedContent(content) {
      let text: string
      try {
        text = JSON.stringify(content)
      } catch {
        return { allowed: false }
      }
      return { allowed: !unsafeContentPattern.test(text) }
    },
  }
}

function diagnostic(
  code: string,
  message: string,
  severity: GenerationDiagnostic['severity'] = 'error',
): GenerationDiagnostic {
  return { severity, code, message }
}

function providerFailureDiagnostic(
  error: LessonProviderError,
): GenerationDiagnostic {
  const codeByKind: Record<LessonProviderError['kind'], string> = {
    timeout: 'PROVIDER_TIMEOUT',
    'rate-limit': 'PROVIDER_RATE_LIMIT',
    transient: 'PROVIDER_UNAVAILABLE',
    terminal: 'PROVIDER_REJECTED',
  }

  return diagnostic(codeByKind[error.kind], error.safeMessage)
}

function stateForProviderFailure(
  kind: LessonProviderError['kind'],
): GenerationState {
  return kind === 'timeout' || kind === 'rate-limit' || kind === 'transient'
    ? 'failed-retryable'
    : 'failed-terminal'
}

function nowValue(now: () => string): string {
  return now()
}

function updateAttempt(
  record: LessonGenerationRecord,
  attemptNumber: number,
  patch: Partial<GenerationAttemptRecord>,
): GenerationAttemptRecord[] {
  return record.attempts.map((attempt) =>
    attempt.attemptNumber === attemptNumber
      ? { ...attempt, ...patch }
      : attempt,
  )
}

function isRetryableState(state: GenerationState): boolean {
  return state === 'failed-retryable' || state === 'blocked-by-validation'
}

function assertTeacherCanGenerate(command: GenerationCommand): void {
  assertTenantAccess(command.session, demoSeed.tenant.id)
  if (
    command.session.role !== 'teacher' ||
    command.session.identityId !== 'identity_demo_teacher' ||
    !canAccess(command.session, 'generate_lesson_draft')
  ) {
    throw new GenerationRequestError(
      'Only a seeded teacher can generate lesson drafts.',
    )
  }
}

export function createGenerationService(options: GenerationServiceOptions) {
  const safety = options.safety ?? createDefaultContentSafety()
  const now = options.now ?? (() => new Date().toISOString())
  const requestIdFactory =
    options.requestIdFactory ?? (() => `draft_req_${randomUUID()}`)

  async function persist(
    record: LessonGenerationRecord,
  ): Promise<GenerationServiceResult> {
    await options.persistence.saveGeneration(record)
    return {
      record,
      publicResult: toPublicGenerationResult(record),
    }
  }

  async function runAttempt(
    baseRecord: LessonGenerationRecord,
    input: NormalizedCommandInput,
  ): Promise<GenerationServiceResult> {
    const attemptNumber = baseRecord.attempt + 1
    const timestamp = nowValue(now)
    const attempt: GenerationAttemptRecord = {
      attemptNumber,
      idempotencyKey: input.idempotencyKey,
      state: 'generating',
      correctionAttempted: false,
      diagnostics: [],
      createdAt: timestamp,
    }
    let record: LessonGenerationRecord = {
      ...baseRecord,
      input: {
        prompt: input.prompt,
        grade: input.grade,
        standardId: input.standardId,
        language: input.language,
        difficulty: input.difficulty,
      },
      state: 'generating',
      attempt: attemptNumber,
      diagnostics: [],
      provenance: undefined,
      draft: undefined,
      attempts: [...baseRecord.attempts, attempt],
      updatedAt: timestamp,
    }
    await options.persistence.saveGeneration(record)

    if (!safety.checkPrompt(input.prompt).allowed) {
      const diagnostics = [
        diagnostic(
          'MODERATION_BLOCKED',
          'This request was blocked by safety review. Revise the request before trying again.',
        ),
      ]
      record = {
        ...record,
        state: 'blocked-by-moderation',
        diagnostics,
        updatedAt: nowValue(now),
        attempts: updateAttempt(record, attemptNumber, {
          state: 'blocked-by-moderation',
          diagnostics,
        }),
      }
      return persist(record)
    }

    let firstResponse: Awaited<ReturnType<LessonDraftProvider['generate']>>
    try {
      firstResponse = await options.provider.generate(input, {
        correctionAttempt: false,
        diagnostics: [],
      })
    } catch (error) {
      return persistProviderFailure(record, attemptNumber, error)
    }

    if (!safety.checkGeneratedContent(firstResponse.draft).allowed) {
      const diagnostics = [
        diagnostic(
          'MODERATION_BLOCKED',
          'The generated lesson was blocked by safety review and was not shown.',
        ),
      ]
      record = {
        ...record,
        state: 'blocked-by-moderation',
        diagnostics,
        provenance: firstResponse.provenance,
        updatedAt: nowValue(now),
        attempts: updateAttempt(record, attemptNumber, {
          state: 'blocked-by-moderation',
          diagnostics,
          provenance: firstResponse.provenance,
        }),
      }
      return persist(record)
    }

    const firstValidation = validateProviderDraft(firstResponse.draft)
    if (firstValidation.ok) {
      return persistReadyDraft(
        record,
        attemptNumber,
        input,
        firstValidation.draft,
        firstResponse.provenance,
        firstValidation.diagnostics,
        false,
      )
    }

    const correctionDiagnostics = firstValidation.diagnostics.filter(
      (entry) => entry.severity === 'error',
    )
    record = {
      ...record,
      attempts: updateAttempt(record, attemptNumber, {
        correctionAttempted: true,
        diagnostics: correctionDiagnostics,
        provenance: firstResponse.provenance,
      }),
    }
    await options.persistence.saveGeneration(record)

    let correctedResponse: Awaited<ReturnType<LessonDraftProvider['generate']>>
    try {
      correctedResponse = await options.provider.generate(input, {
        correctionAttempt: true,
        diagnostics: correctionDiagnostics,
      })
    } catch (error) {
      return persistProviderFailure(
        record,
        attemptNumber,
        error,
        correctionDiagnostics,
      )
    }

    if (!safety.checkGeneratedContent(correctedResponse.draft).allowed) {
      const diagnostics = [
        diagnostic(
          'MODERATION_BLOCKED',
          'The corrected lesson was blocked by safety review and was not shown.',
        ),
      ]
      record = {
        ...record,
        state: 'blocked-by-moderation',
        diagnostics,
        provenance: correctedResponse.provenance,
        updatedAt: nowValue(now),
        attempts: updateAttempt(record, attemptNumber, {
          state: 'blocked-by-moderation',
          diagnostics: [...correctionDiagnostics, ...diagnostics],
          provenance: correctedResponse.provenance,
        }),
      }
      return persist(record)
    }

    const correctedValidation = validateProviderDraft(correctedResponse.draft)
    if (correctedValidation.ok) {
      return persistReadyDraft(
        record,
        attemptNumber,
        input,
        correctedValidation.draft,
        correctedResponse.provenance,
        correctedValidation.diagnostics,
        true,
      )
    }

    const diagnostics = correctedValidation.diagnostics
    record = {
      ...record,
      state: 'blocked-by-validation',
      diagnostics,
      provenance: correctedResponse.provenance,
      updatedAt: nowValue(now),
      attempts: updateAttempt(record, attemptNumber, {
        state: 'blocked-by-validation',
        diagnostics: [...correctionDiagnostics, ...diagnostics],
        provenance: correctedResponse.provenance,
      }),
    }
    return persist(record)
  }

  async function persistReadyDraft(
    baseRecord: LessonGenerationRecord,
    attemptNumber: number,
    input: NormalizedCommandInput,
    providerDraft: ProviderLessonDraft,
    provenance: ProviderProvenance,
    diagnostics: GenerationDiagnostic[],
    correctionAttempted: boolean,
  ): Promise<GenerationServiceResult> {
    const timestamp = nowValue(now)
    const draft = {
      ...providerDraft,
      requestId: baseRecord.requestId,
      input: {
        prompt: input.prompt,
        grade: input.grade,
        standardId: input.standardId,
        language: input.language,
        difficulty: input.difficulty,
      },
      provenance,
      createdAt: timestamp,
    }
    const record: LessonGenerationRecord = {
      ...baseRecord,
      state: 'ready-for-review',
      diagnostics,
      provenance,
      draft,
      updatedAt: timestamp,
      attempts: updateAttempt(baseRecord, attemptNumber, {
        state: 'ready-for-review',
        correctionAttempted,
        diagnostics,
        provenance,
      }),
    }
    return persist(record)
  }

  async function persistProviderFailure(
    baseRecord: LessonGenerationRecord,
    attemptNumber: number,
    error: unknown,
    priorDiagnostics: GenerationDiagnostic[] = [],
  ): Promise<GenerationServiceResult> {
    const providerError =
      error instanceof LessonProviderError
        ? error
        : new LessonProviderError(
            'terminal',
            'The lesson provider failed unexpectedly. Try again later.',
          )
    const failureDiagnostic = providerFailureDiagnostic(providerError)
    const diagnostics = [...priorDiagnostics, failureDiagnostic]
    const state = stateForProviderFailure(providerError.kind)
    const record: LessonGenerationRecord = {
      ...baseRecord,
      state,
      diagnostics,
      updatedAt: nowValue(now),
      attempts: updateAttempt(baseRecord, attemptNumber, {
        state,
        diagnostics,
      }),
    }
    return persist(record)
  }

  return {
    async generate(
      command: GenerationCommand,
    ): Promise<GenerationServiceResult> {
      assertTeacherCanGenerate(command)
      const input = normalizeGenerationInput(command.input)
      const existing = await options.persistence.findGenerationByIdempotencyKey(
        command.session.tenantId,
        input.idempotencyKey,
      )
      if (existing) {
        return {
          record: existing,
          publicResult: toPublicGenerationResult(existing),
        }
      }

      if (input.retryOfRequestId) {
        const retryRecord = await options.persistence.readGeneration(
          command.session.tenantId,
          input.retryOfRequestId,
        )
        if (
          !retryRecord ||
          retryRecord.teacherId !== command.session.identityId
        ) {
          throw new GenerationRequestError('The requested draft was not found.')
        }
        if (!isRetryableState(retryRecord.state)) {
          throw new GenerationRequestError(
            'This draft is not in a state that can be retried.',
          )
        }
        if (
          retryRecord.input.prompt !== input.prompt ||
          retryRecord.input.grade !== input.grade ||
          retryRecord.input.standardId !== input.standardId ||
          retryRecord.input.language !== input.language ||
          retryRecord.input.difficulty !== input.difficulty
        ) {
          throw new GenerationRequestError(
            'A retry must keep the original lesson request metadata.',
          )
        }
        return runAttempt(retryRecord, input)
      }

      const timestamp = nowValue(now)
      const record: LessonGenerationRecord = {
        requestId: requestIdFactory(),
        tenantId: command.session.tenantId,
        teacherId: command.session.identityId,
        input: {
          prompt: input.prompt,
          grade: input.grade,
          standardId: input.standardId,
          language: input.language,
          difficulty: input.difficulty,
        },
        state: 'requested',
        attempt: 0,
        diagnostics: [],
        attempts: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await options.persistence.saveGeneration(record)
      return runAttempt(record, input)
    },
  }
}
