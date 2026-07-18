import { describe, expect, it } from 'vitest'

import { getDemoSession } from '@/server/demo/policy'
import { demoSeed } from '@/server/seed-data'

import {
  createDeterministicLessonDraftProvider,
  createEquivalentFractionsDraft,
  LessonProviderError,
} from './provider'
import type { LessonDraftProvider } from './provider'
import { createSeededPersistence } from '../persistence/seeded'
import { createGenerationService, normalizeGenerationInput } from './service'
import { validateSemanticLesson } from './semantic-validation'
import type { LessonGenerationRecord } from './types'

const validInput = {
  prompt: 'equivalent fractions for grade 4',
  grade: 4,
  standardId: demoSeed.standard.id,
  language: 'en' as const,
  difficulty: 'on-level' as const,
  idempotencyKey: 'request-equivalent-fractions-1',
}

function teacherCommand(input: Record<string, unknown> = validInput) {
  return {
    session: getDemoSession('teacher'),
    input,
  }
}

function generatingRecord(
  requestId: string,
  idempotencyKey: string,
  updatedAt: string,
): LessonGenerationRecord {
  const provenance = {
    provider: 'deterministic-fixture',
    model: 'equivalent-fractions-fixture-v1',
    promptTemplateVersion: 'lesson-prompt-v1',
    validatorVersion: 'lesson-validator-v2',
  }
  return {
    requestId,
    tenantId: demoSeed.tenant.id,
    teacherId: 'identity_demo_teacher',
    input: {
      prompt: validInput.prompt,
      grade: validInput.grade,
      standardId: demoSeed.standard.id,
      language: validInput.language,
      difficulty: validInput.difficulty,
    },
    state: 'generating',
    attempt: 1,
    diagnostics: [],
    provenance,
    attempts: [
      {
        attemptNumber: 1,
        idempotencyKey,
        state: 'generating',
        correctionAttempted: false,
        diagnostics: [],
        provenance,
        createdAt: updatedAt,
      },
    ],
    createdAt: updatedAt,
    updatedAt,
  }
}

describe('lesson generation service', () => {
  it('returns four safe variants for a seeded teacher', async () => {
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider: createDeterministicLessonDraftProvider(),
      requestIdFactory: () => 'draft_req_test_1',
    })

    const result = await service.generate(teacherCommand())

    expect(result.record.state).toBe('ready-for-review')
    expect(result.record.draft?.variants).toHaveLength(4)
    expect(result.record.attempts).toHaveLength(1)
    expect(result.publicResult.draft?.variants[0]).not.toHaveProperty(
      'relationships',
    )
    expect(JSON.stringify(result.publicResult)).not.toContain('targetId')
    expect(result.publicResult.provenance).toMatchObject({
      provider: 'deterministic-fixture',
      validatorVersion: 'lesson-validator-v2',
    })
  })

  it('keeps semantic quality warnings visible with validator provenance', async () => {
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider: createDeterministicLessonDraftProvider(),
      requestIdFactory: () => 'draft_req_semantic_warning',
    })

    const result = await service.generate(
      teacherCommand({
        ...validInput,
        idempotencyKey: 'request-semantic-warning',
      }),
    )

    expect(result.record.state).toBe('ready-for-review')
    expect(result.publicResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'VARIANT_NOT_MEANINGFULLY_DIFFERENT',
          severity: 'warning',
          validator: 'learning-quality',
          verdict: 'warning',
          validatorVersion: 'learning-quality-validator-v1',
          recommendation: expect.any(String),
        }),
      ]),
    )
  })

  it('keeps a semantically blocked draft out of the public preview seam', async () => {
    const provider = {
      provenance: {
        provider: 'semantic-fixture',
        model: 'equivalent-fractions-fixture-v1',
        promptTemplateVersion: 'lesson-prompt-v1',
        validatorVersion: 'lesson-validator-v2',
      },
      async generate(request: Parameters<LessonDraftProvider['generate']>[0]) {
        const draft = createEquivalentFractionsDraft(request)
        const firstVariant = draft.variants[0]
        firstVariant.targetItems[0] = {
          id: firstVariant.targetItems[0]?.id ?? 'target-1-1',
          label: '3/4',
        }
        return { draft }
      },
    }
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      requestIdFactory: () => 'draft_req_semantic_block',
    })

    const result = await service.generate(
      teacherCommand({
        ...validInput,
        idempotencyKey: 'request-semantic-block',
      }),
    )

    expect(result.record.state).toBe('blocked-by-validation')
    expect(result.record.draft).toBeUndefined()
    expect(result.publicResult.draft).toBeNull()
    expect(result.publicResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ANSWER_MISMATCH',
          severity: 'error',
          validator: 'curriculum',
          verdict: 'block',
          validatorVersion: expect.any(String),
        }),
      ]),
    )
    expect(JSON.stringify(result.publicResult)).not.toContain('targetId')
  })

  it('keeps semantic timeout retryable and allows one explicit retry', async () => {
    let validationCalls = 0
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider: createDeterministicLessonDraftProvider(),
      requestIdFactory: () => 'draft_req_semantic_retry',
      semanticValidation: async (input) => {
        validationCalls += 1
        if (validationCalls === 1) {
          return {
            status: 'retryable',
            verdict: 'block',
            reviews: [],
            findings: [
              {
                validator: 'learning-quality',
                validatorVersion: 'agent-timeout-fixture-v1',
                verdict: 'block',
                code: 'VALIDATION_TIMEOUT',
                field: 'validation',
                reason:
                  'The semantic validator timed out before completing. Try this draft again.',
              },
            ],
            retry: {
              available: true,
              message:
                'Validation did not finish safely. Try this draft again.',
            },
          }
        }
        return validateSemanticLesson(input)
      },
    })

    const first = await service.generate(
      teacherCommand({
        ...validInput,
        idempotencyKey: 'request-semantic-timeout',
      }),
    )

    expect(first.record.state).toBe('failed-retryable')
    expect(first.publicResult.draft).toBeNull()
    expect(first.publicResult.retry.available).toBe(true)

    const second = await service.generate(
      teacherCommand({
        ...validInput,
        idempotencyKey: 'request-semantic-retry-success',
        retryOfRequestId: first.record.requestId,
      }),
    )

    expect(second.record.state).toBe('ready-for-review')
    expect(second.publicResult.draft?.variants).toHaveLength(4)
    expect(validationCalls).toBe(2)
  })

  it('does not duplicate a draft when the same idempotency key is retried', async () => {
    const provider = createDeterministicLessonDraftProvider()
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      requestIdFactory: () => 'draft_req_test_2',
    })

    const first = await service.generate(teacherCommand())
    const second = await service.generate(teacherCommand())

    expect(second.record.requestId).toBe(first.record.requestId)
    expect(second.record.attempts).toHaveLength(1)
    expect(provider.calls).toBe(1)
  })

  it('does not invoke the provider twice for concurrent duplicate submissions', async () => {
    const provider = createDeterministicLessonDraftProvider()
    let requestNumber = 0
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      requestIdFactory: () => `draft_req_concurrent_${++requestNumber}`,
    })

    const [first, second] = await Promise.all([
      service.generate(teacherCommand()),
      service.generate(teacherCommand()),
    ])

    expect(provider.calls).toBe(1)
    expect(second.record.requestId).toBe(first.record.requestId)
    expect(second.record.attempts).toHaveLength(1)
  })

  it('expires an abandoned generation claim into an explicit retry state', async () => {
    const provenance = {
      provider: 'deterministic-fixture',
      model: 'equivalent-fractions-fixture-v1',
      promptTemplateVersion: 'lesson-prompt-v1',
      validatorVersion: 'lesson-validator-v2',
    }
    const staleRecord: LessonGenerationRecord = {
      requestId: 'draft_req_stale_claim',
      tenantId: demoSeed.tenant.id,
      teacherId: 'identity_demo_teacher',
      input: {
        prompt: validInput.prompt,
        grade: validInput.grade,
        standardId: demoSeed.standard.id,
        language: validInput.language,
        difficulty: validInput.difficulty,
      },
      state: 'generating',
      attempt: 1,
      diagnostics: [],
      provenance,
      attempts: [
        {
          attemptNumber: 1,
          idempotencyKey: 'request-stale-claim',
          state: 'generating',
          correctionAttempted: false,
          diagnostics: [],
          provenance,
          createdAt: '2020-01-01T00:00:00.000Z',
        },
      ],
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    }
    const generationStore = new Map([
      [`${staleRecord.tenantId}:${staleRecord.requestId}`, staleRecord],
    ])
    const provider = createDeterministicLessonDraftProvider()
    const service = createGenerationService({
      persistence: createSeededPersistence({ generationStore }),
      provider,
      now: () => '2026-07-18T00:00:00.000Z',
    })

    const result = await service.generate(
      teacherCommand({
        ...validInput,
        idempotencyKey: 'request-stale-claim',
      }),
    )

    expect(result.record.state).toBe('failed-retryable')
    expect(result.record.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'GENERATION_CLAIM_EXPIRED' }),
      ]),
    )
    expect(result.publicResult.retry.available).toBe(true)
    expect(provider.calls).toBe(0)
  })

  it('returns the current record when another worker wins claim expiry', async () => {
    const provenance = {
      provider: 'deterministic-fixture',
      model: 'equivalent-fractions-fixture-v1',
      promptTemplateVersion: 'lesson-prompt-v1',
      validatorVersion: 'lesson-validator-v2',
    }
    const staleRecord: LessonGenerationRecord = {
      requestId: 'draft_req_cas_loser',
      tenantId: demoSeed.tenant.id,
      teacherId: 'identity_demo_teacher',
      input: {
        prompt: validInput.prompt,
        grade: validInput.grade,
        standardId: demoSeed.standard.id,
        language: validInput.language,
        difficulty: validInput.difficulty,
      },
      state: 'generating',
      attempt: 1,
      diagnostics: [],
      provenance,
      attempts: [
        {
          attemptNumber: 1,
          idempotencyKey: 'request-cas-loser',
          state: 'generating',
          correctionAttempted: false,
          diagnostics: [],
          provenance,
          createdAt: '2020-01-01T00:00:00.000Z',
        },
      ],
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    }
    const currentRecord: LessonGenerationRecord = {
      ...staleRecord,
      state: 'failed-retryable',
      diagnostics: [
        {
          severity: 'error',
          code: 'GENERATION_CLAIM_EXPIRED',
          message: 'The previous generation attempt expired.',
        },
      ],
      updatedAt: '2026-07-18T00:00:00.000Z',
      attempts: [
        {
          ...staleRecord.attempts[0],
          state: 'failed-retryable',
        },
      ],
    }
    const basePersistence = createSeededPersistence({
      generationStore: new Map([
        [`${staleRecord.tenantId}:${staleRecord.requestId}`, staleRecord],
      ]),
    })
    const persistence = {
      ...basePersistence,
      async expireGenerationClaim() {
        return undefined
      },
      async readGeneration() {
        return structuredClone(currentRecord)
      },
    }
    const service = createGenerationService({
      persistence,
      provider: createDeterministicLessonDraftProvider(),
      now: () => '2026-07-18T00:00:00.000Z',
    })

    const result = await service.generate(
      teacherCommand({
        ...validInput,
        idempotencyKey: 'request-cas-loser',
      }),
    )

    expect(result.record.state).toBe('failed-retryable')
    expect(result.record.diagnostics[0]?.code).toBe('GENERATION_CLAIM_EXPIRED')
  })

  it('stores configured provenance on the attempt before provider work', async () => {
    const provenance = {
      provider: 'test-provider',
      model: 'test-model',
      promptTemplateVersion: 'test-prompt-v1',
      validatorVersion: 'lesson-validator-v2',
    }
    const basePersistence = createSeededPersistence()
    let claimedRecord: LessonGenerationRecord | undefined
    const persistence = {
      ...basePersistence,
      async claimGeneration(record: LessonGenerationRecord) {
        claimedRecord = structuredClone(record)
        return basePersistence.claimGeneration(record)
      },
    }
    const service = createGenerationService({
      persistence,
      provider: {
        provenance,
        async generate() {
          throw new Error('socket closed')
        },
      },
      requestIdFactory: () => 'draft_req_claim_provenance',
    })

    await service.generate(
      teacherCommand({
        ...validInput,
        idempotencyKey: 'request-claim-provenance',
      }),
    )

    expect(claimedRecord?.provenance).toEqual(provenance)
    expect(claimedRecord?.attempts[0]?.provenance).toEqual(provenance)
  })

  it('does not let an expired worker overwrite a later retry attempt', async () => {
    const currentRecord = generatingRecord(
      'draft_req_stale_worker',
      'request-retry-attempt-2',
      '2026-07-18T00:00:01.000Z',
    )
    currentRecord.attempt = 2
    currentRecord.attempts = [
      {
        ...currentRecord.attempts[0],
        state: 'failed-retryable',
      },
      {
        ...currentRecord.attempts[0],
        attemptNumber: 2,
        idempotencyKey: 'request-retry-attempt-2',
      },
    ]
    const staleWorkerRecord: LessonGenerationRecord = {
      ...currentRecord,
      state: 'ready-for-review',
      attempt: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    }
    const persistence = createSeededPersistence({
      generationStore: new Map([
        [`${currentRecord.tenantId}:${currentRecord.requestId}`, currentRecord],
      ]),
    })

    const saved = await persistence.saveGeneration(staleWorkerRecord, {
      attempt: 1,
      updatedAt: staleWorkerRecord.updatedAt,
    })
    const stored = await persistence.readGeneration(
      currentRecord.tenantId,
      currentRecord.requestId,
    )

    expect(saved).toBe(false)
    expect(stored?.attempt).toBe(2)
    expect(stored?.state).toBe('generating')
  })

  it('makes exactly one correction attempt and keeps a corrected draft reviewable', async () => {
    const provider =
      createDeterministicLessonDraftProvider('invalid-then-valid')
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      requestIdFactory: () => 'draft_req_test_3',
    })

    const result = await service.generate(teacherCommand())

    expect(result.record.state).toBe('ready-for-review')
    expect(result.record.attempt).toBe(1)
    expect(result.record.attempts[0]?.correctionAttempted).toBe(true)
    expect(provider.calls).toBe(2)
  })

  it('blocks a draft after the correction attempt is also invalid', async () => {
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider: createDeterministicLessonDraftProvider('invalid-then-invalid'),
      requestIdFactory: () => 'draft_req_test_4',
    })

    const result = await service.generate(teacherCommand())

    expect(result.record.state).toBe('blocked-by-validation')
    expect(result.record.draft).toBeUndefined()
    expect(result.publicResult.retry.available).toBe(true)
  })

  it('blocks output whose language direction does not match the teacher request', async () => {
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider: {
        provenance: {
          provider: 'test-provider',
          model: 'test-model',
          promptTemplateVersion: 'test-prompt-v1',
          validatorVersion: 'lesson-validator-v2',
        },
        async generate(request) {
          return {
            draft: createEquivalentFractionsDraft({
              ...request,
              language: 'en',
            }),
          }
        },
      },
      requestIdFactory: () => 'draft_req_test_language_mismatch',
    })

    const result = await service.generate(
      teacherCommand({
        ...validInput,
        language: 'ar',
        idempotencyKey: 'request-language-mismatch',
      }),
    )

    expect(result.record.state).toBe('blocked-by-validation')
    expect(result.record.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'LANGUAGE_MISMATCH',
          field: 'languageMetadata',
        }),
        expect.objectContaining({
          code: 'DIRECTION_MISMATCH',
          field: 'languageMetadata',
        }),
      ]),
    )
    expect(result.record.attempts[0]?.correctionAttempted).toBe(true)
    expect(result.publicResult.draft).toBeNull()
  })

  it('retains a retryable provider failure and allows one explicit teacher retry', async () => {
    let calls = 0
    const provider = {
      provenance: {
        provider: 'test-provider',
        model: 'test-model',
        promptTemplateVersion: 'test-prompt-v1',
        validatorVersion: 'lesson-validator-v1',
      },
      async generate(
        request: Parameters<typeof createEquivalentFractionsDraft>[0],
      ) {
        calls += 1
        if (calls === 1) {
          throw new LessonProviderError(
            'timeout',
            'The lesson provider timed out. Try again.',
          )
        }
        return {
          draft: createEquivalentFractionsDraft(request),
        }
      },
    }
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      requestIdFactory: () => 'draft_req_test_5',
    })

    const first = await service.generate(teacherCommand())
    const retry = await service.generate(
      teacherCommand({
        ...validInput,
        idempotencyKey: 'request-equivalent-fractions-retry',
        retryOfRequestId: first.record.requestId,
      }),
    )

    expect(first.record.state).toBe('failed-retryable')
    expect(retry.record.state).toBe('ready-for-review')
    expect(retry.record.attempt).toBe(2)
    expect(retry.record.attempts).toHaveLength(2)
    expect(calls).toBe(2)
  })

  it('persists configured provider provenance for an initial retryable failure', async () => {
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider: createDeterministicLessonDraftProvider('timeout'),
      requestIdFactory: () => 'draft_req_test_initial_provenance_failure',
    })

    const result = await service.generate(
      teacherCommand({
        ...validInput,
        idempotencyKey: 'request-initial-provenance-failure',
      }),
    )

    expect(result.record.state).toBe('failed-retryable')
    expect(result.record.provenance).toEqual({
      provider: 'deterministic-fixture',
      model: 'equivalent-fractions-fixture-v1',
      promptTemplateVersion: 'lesson-prompt-v1',
      validatorVersion: 'lesson-validator-v2',
    })
    expect(result.record.attempts[0]?.provenance).toEqual(
      result.record.provenance,
    )
  })

  it('persists configured provenance when the provider fails unexpectedly', async () => {
    const provenance = {
      provider: 'test-provider',
      model: 'test-model',
      promptTemplateVersion: 'test-prompt-v1',
      validatorVersion: 'lesson-validator-v2',
    }
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider: {
        provenance,
        async generate() {
          throw new Error('socket closed')
        },
      },
      requestIdFactory: () => 'draft_req_test_unexpected_failure',
    })

    const result = await service.generate(
      teacherCommand({
        ...validInput,
        idempotencyKey: 'request-unexpected-provider-failure',
      }),
    )

    expect(result.record.state).toBe('failed-terminal')
    expect(result.record.provenance).toEqual(provenance)
    expect(result.record.attempts[0]?.provenance).toEqual(provenance)
  })

  it('retains known provider provenance when correction fails retryably', async () => {
    let calls = 0
    const provenance = {
      provider: 'test-provider',
      model: 'test-model',
      promptTemplateVersion: 'test-prompt-v1',
      validatorVersion: 'lesson-validator-v1',
    }
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider: {
        provenance,
        async generate(request) {
          calls += 1
          if (calls === 1) {
            const draft = createEquivalentFractionsDraft(request)
            draft.variants[0].relationships[0].targetId = 'missing-target'
            return { draft }
          }

          throw new LessonProviderError(
            'timeout',
            'The lesson provider timed out. Try again.',
          )
        },
      },
      requestIdFactory: () => 'draft_req_test_provenance_failure',
    })

    const result = await service.generate(
      teacherCommand({
        ...validInput,
        idempotencyKey: 'request-provenance-failure',
      }),
    )

    expect(result.record.state).toBe('failed-retryable')
    expect(result.record.provenance).toEqual(provenance)
    expect(result.record.attempts[0]?.provenance).toEqual(provenance)
  })

  it('rejects students, cross-tenant sessions, invalid metadata, and client provider settings', async () => {
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider: createDeterministicLessonDraftProvider(),
    })

    await expect(
      service.generate({
        session: getDemoSession('student'),
        input: validInput,
      }),
    ).rejects.toThrow('Only a seeded teacher can generate lesson drafts.')

    await expect(
      service.generate({
        session: {
          ...getDemoSession('teacher'),
          tenantId: 'tenant_other_school',
        },
        input: validInput,
      }),
    ).rejects.toThrow('Tenant access denied.')

    expect(() => normalizeGenerationInput({ ...validInput, grade: 9 })).toThrow(
      'Generation input is invalid.',
    )
    expect(() =>
      normalizeGenerationInput({ ...validInput, provider: 'client-selected' }),
    ).toThrow('Generation input is invalid.')
  })

  it('blocks unsafe teacher prompts before calling the provider', async () => {
    const provider = createDeterministicLessonDraftProvider()
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      requestIdFactory: () => 'draft_req_test_moderated_prompt',
    })

    const result = await service.generate(
      teacherCommand({
        ...validInput,
        prompt: '<script>do not run</script>',
        idempotencyKey: 'request-moderated-prompt',
      }),
    )

    expect(result.record.state).toBe('blocked-by-moderation')
    expect(result.publicResult.draft).toBeNull()
    expect(result.publicResult.diagnostics[0]?.message).not.toContain(
      '<script>',
    )
    expect(provider.calls).toBe(0)
  })

  it('blocks unsafe provider output without exposing it or correcting it', async () => {
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider: {
        provenance: {
          provider: 'test-provider',
          model: 'test-model',
          promptTemplateVersion: 'test-prompt-v1',
          validatorVersion: 'lesson-validator-v1',
        },
        async generate() {
          return {
            draft: { unsafe: '<script>model output</script>' },
          }
        },
      },
      requestIdFactory: () => 'draft_req_test_moderated_output',
    })

    const result = await service.generate(
      teacherCommand({
        ...validInput,
        idempotencyKey: 'request-moderated-output',
      }),
    )

    expect(result.record.state).toBe('blocked-by-moderation')
    expect(result.publicResult.draft).toBeNull()
    expect(JSON.stringify(result.publicResult)).not.toContain('model output')
  })

  it('returns a retryable state for a rate-limited provider', async () => {
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider: createDeterministicLessonDraftProvider('rate-limit'),
      requestIdFactory: () => 'draft_req_test_rate_limit',
    })

    const result = await service.generate(
      teacherCommand({
        ...validInput,
        idempotencyKey: 'request-rate-limit',
      }),
    )

    expect(result.record.state).toBe('failed-retryable')
    expect(result.publicResult.retry).toEqual({
      available: true,
      message: 'Review the diagnostics, then try this draft again.',
    })
    expect(result.publicResult.diagnostics[0]?.code).toBe('PROVIDER_RATE_LIMIT')
  })
})
