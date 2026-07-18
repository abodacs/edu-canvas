import { describe, expect, it } from 'vitest'

import { getDemoSession } from '@/server/demo/policy'
import { demoSeed } from '@/server/seed-data'

import {
  createDeterministicLessonDraftProvider,
  createEquivalentFractionsDraft,
  LessonProviderError,
} from './provider'
import { createSeededPersistence } from '../persistence/seeded'
import { createGenerationService, normalizeGenerationInput } from './service'

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
      validatorVersion: 'lesson-validator-v1',
    })
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
        async generate(request) {
          return {
            draft: createEquivalentFractionsDraft({
              ...request,
              language: 'en',
            }),
            provenance: {
              provider: 'test-provider',
              model: 'test-model',
              promptTemplateVersion: 'test-prompt-v1',
              validatorVersion: 'lesson-validator-v1',
            },
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
          provenance: {
            provider: 'test-provider',
            model: 'test-model',
            promptTemplateVersion: 'test-prompt-v1',
            validatorVersion: 'lesson-validator-v1',
          },
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
        async generate(request) {
          calls += 1
          if (calls === 1) {
            const draft = createEquivalentFractionsDraft(request)
            draft.variants[0].relationships[0].targetId = 'missing-target'
            return { draft, provenance }
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
        async generate() {
          return {
            draft: { unsafe: '<script>model output</script>' },
            provenance: {
              provider: 'test-provider',
              model: 'test-model',
              promptTemplateVersion: 'test-prompt-v1',
              validatorVersion: 'lesson-validator-v1',
            },
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
