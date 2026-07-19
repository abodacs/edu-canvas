import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createEquivalentFractionsDraft } from '../generation/provider'
import { buildValidatedLearningPath } from '../generation/learning-path'
import { createDemoCurriculumContext } from '../generation/semantic-validation'
import { getDemoSeedCounts } from '../seed-data'
import type {
  GenerationAttemptRecord,
  LessonGenerationRecord,
} from '../generation/types'
import { createDrizzlePersistence } from './drizzle'
import { createPostgresPersistence } from './postgres'

const databaseUrl = process.env.DATABASE_URL
const databaseTestsEnabled = process.env.RUN_DATABASE_TESTS === 'true'
const runDatabaseTests = Boolean(databaseUrl && databaseTestsEnabled)
const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

interface TenantFixture {
  tenantId: string
  teacherId: string
  standardId: string
}

const adapters = [
  {
    name: 'postgres',
    create: () => createPostgresPersistence(databaseUrl!),
  },
  {
    name: 'drizzle',
    create: () => createDrizzlePersistence(databaseUrl!),
  },
] as const

let primaryTenant: TenantFixture
let secondaryTenant: TenantFixture

describe.skipIf(!runDatabaseTests)('PostgreSQL persistence parity', () => {
  beforeAll(async () => {
    primaryTenant = await createTenantFixture('primary')
    secondaryTenant = await createTenantFixture('secondary')
  })

  afterAll(async () => {
    const fixtures: Array<TenantFixture | undefined> = [
      primaryTenant,
      secondaryTenant,
    ]
    for (const fixture of fixtures) {
      if (fixture) await deleteTenantFixture(fixture)
    }
  })

  for (const adapter of adapters) {
    describe(`${adapter.name} adapter`, () => {
      it('reads the same seeded foundation counts', async () => {
        const persistence = adapter.create()

        await expect(persistence.readDemoCounts()).resolves.toEqual(
          getDemoSeedCounts(),
        )
      })

      it('keeps idempotency claims tenant-local and returns the winner', async () => {
        const persistence = adapter.create()
        const idempotencyKey = `issue-42-shared-key-${adapter.name}-${runId}`
        const first = createGeneratingRecord(
          primaryTenant,
          `${adapter.name}-winner`,
          1,
          '2026-07-18T00:10:00.000Z',
          idempotencyKey,
        )
        const duplicate = createGeneratingRecord(
          primaryTenant,
          `${adapter.name}-duplicate`,
          1,
          '2026-07-18T00:10:00.000Z',
          idempotencyKey,
        )
        const otherTenant = createGeneratingRecord(
          secondaryTenant,
          `${adapter.name}-other-tenant`,
          1,
          '2026-07-18T00:10:00.000Z',
          idempotencyKey,
        )

        const [firstClaim, duplicateClaim] = await Promise.all([
          persistence.claimGeneration(first),
          persistence.claimGeneration(duplicate),
        ])
        const claims = [firstClaim, duplicateClaim]
        expect(claims.filter((claim) => claim.claimed)).toHaveLength(1)
        expect(claims.filter((claim) => !claim.claimed)).toHaveLength(1)
        const winningClaim = claims.find((claim) => claim.claimed)
        const losingClaim = claims.find((claim) => !claim.claimed)
        if (!winningClaim || !losingClaim) {
          throw new Error('Expected exactly one concurrent claim winner.')
        }
        expect(losingClaim.record.requestId).toBe(winningClaim.record.requestId)
        await expect(
          persistence.findGenerationByIdempotencyKey(
            primaryTenant.tenantId,
            idempotencyKey,
          ),
        ).resolves.toMatchObject({
          requestId: winningClaim.record.requestId,
        })

        await expect(persistence.claimGeneration(otherTenant)).resolves.toEqual(
          {
            claimed: true,
            record: otherTenant,
          },
        )
        await expect(
          persistence.findGenerationByIdempotencyKey(
            secondaryTenant.tenantId,
            idempotencyKey,
          ),
        ).resolves.toMatchObject({ requestId: otherTenant.requestId })
      })

      it('expires claims atomically and rejects stale worker writes', async () => {
        const persistence = adapter.create()
        const claimed = createGeneratingRecord(
          primaryTenant,
          `${adapter.name}-lease`,
          1,
          '2026-07-18T00:20:00.000Z',
        )

        await expect(persistence.claimGeneration(claimed)).resolves.toEqual({
          claimed: true,
          record: claimed,
        })

        const expired = await persistence.expireGenerationClaim(
          claimed.tenantId,
          claimed.requestId,
          claimed.updatedAt,
          '2026-07-18T00:21:00.000Z',
        )
        expect(expired).toMatchObject({
          requestId: claimed.requestId,
          state: 'failed-retryable',
          attempt: 1,
        })
        expect(expired?.attempts).toHaveLength(1)
        expect(expired?.attempts[0]).toMatchObject({
          state: 'failed-retryable',
          diagnostics: [
            expect.objectContaining({ code: 'GENERATION_CLAIM_EXPIRED' }),
          ],
        })
        await expect(
          persistence.expireGenerationClaim(
            claimed.tenantId,
            claimed.requestId,
            claimed.updatedAt,
            '2026-07-18T00:22:00.000Z',
          ),
        ).resolves.toBeUndefined()

        if (!expired) throw new Error('Expected the active claim to expire.')
        const expiredAttempt = expired.attempts[0]
        const retryAttempt: GenerationAttemptRecord = {
          ...expiredAttempt,
          attemptNumber: 2,
          idempotencyKey: `${expiredAttempt.idempotencyKey}-retry`,
          state: 'generating',
          diagnostics: [],
          createdAt: '2026-07-18T00:23:00.000Z',
        }
        const retry: LessonGenerationRecord = {
          ...claimed,
          attempt: 2,
          state: 'generating',
          diagnostics: [],
          updatedAt: '2026-07-18T00:23:00.000Z',
          attempts: [expiredAttempt, retryAttempt],
        }

        await expect(persistence.claimGeneration(retry)).resolves.toEqual({
          claimed: true,
          record: retry,
        })
        await expect(
          persistence.saveGeneration(claimed, {
            attempt: claimed.attempt,
            updatedAt: claimed.updatedAt,
          }),
        ).resolves.toBe(false)

        const provenance = {
          provider: 'deterministic-fixture',
          model: 'issue-42-contract-v1',
          promptTemplateVersion: 'lesson-prompt-v1',
          validatorVersion: 'lesson-validator-v2',
        } as const
        const generatedDraft = createEquivalentFractionsDraft(retry.input)
        const learningPath = buildValidatedLearningPath({
          proposal: generatedDraft.learningPath!,
          context: createDemoCurriculumContext(retry.input),
          draftId: retry.requestId,
          provenance,
          validatorVersion: 'semantic-validation-runner-v1',
        })
        const completed: LessonGenerationRecord = {
          ...retry,
          state: 'ready-for-review',
          updatedAt: '2026-07-18T00:24:00.000Z',
          provenance,
          draft: {
            ...generatedDraft,
            learningPath,
            requestId: retry.requestId,
            input: retry.input,
            provenance,
            createdAt: retry.createdAt,
          },
          diagnostics: [
            {
              severity: 'warning',
              code: 'PARITY_TEST',
              message: 'The shared adapter contract preserved the retry.',
            },
          ],
          attempts: [
            expiredAttempt,
            {
              ...retryAttempt,
              state: 'ready-for-review',
              diagnostics: [],
            },
          ],
        }

        await expect(
          persistence.saveGeneration(completed, {
            attempt: retry.attempt,
            updatedAt: retry.updatedAt,
          }),
        ).resolves.toBe(true)

        const stored = await persistence.readGeneration(
          retry.tenantId,
          retry.requestId,
        )
        expect(
          stored?.attempts.map((attempt) => attempt.attemptNumber),
        ).toEqual([1, 2])
        expect(stored).toMatchObject({
          state: 'ready-for-review',
          diagnostics: completed.diagnostics,
          provenance: completed.provenance,
          draft: completed.draft,
          updatedAt: completed.updatedAt,
        })
      })
    })
  }
})

async function createTenantFixture(suffix: string): Promise<TenantFixture> {
  const tenantId = `tenant_issue_42_${suffix}_${runId}`
  const teacherId = `identity_issue_42_${suffix}_${runId}`
  const standardId = `standard_issue_42_${suffix}_${runId}`
  const sql = postgres(databaseUrl!, {
    max: 1,
    prepare: false,
  })

  try {
    await sql.begin(async (transaction) => {
      await transaction`select set_config('app.tenant_id', ${tenantId}, true)`
      await transaction`
        insert into tenants (id, slug, name, synthetic_data_only)
        values (${tenantId}, ${tenantId}, ${'Issue 42 contract fixture'}, true)
      `
      await transaction`
        insert into identities (
          id,
          tenant_id,
          role,
          display_name,
          demo_handle
        )
        values (
          ${teacherId},
          ${tenantId},
          'teacher',
          ${'Issue 42 fixture teacher'},
          ${`${teacherId}.demo`}
        )
      `
      await transaction`
        insert into standards (
          id,
          tenant_id,
          code,
          name,
          subject,
          grade_band
        )
        values (
          ${standardId},
          ${tenantId},
          ${`ISSUE42-${suffix}`},
          ${'Issue 42 contract standard'},
          ${'Mathematics'},
          ${'Grade 4'}
        )
      `
    })
  } finally {
    await sql.end({ timeout: 3 })
  }

  return { tenantId, teacherId, standardId }
}

async function deleteTenantFixture(fixture: TenantFixture): Promise<void> {
  const sql = postgres(databaseUrl!, {
    max: 1,
    prepare: false,
  })

  try {
    await sql.begin(async (transaction) => {
      await transaction`select set_config('app.tenant_id', ${fixture.tenantId}, true)`
      await transaction`
        delete from lesson_generation_attempts
        where tenant_id = ${fixture.tenantId}
      `
      await transaction`
        delete from lesson_draft_requests
        where tenant_id = ${fixture.tenantId}
      `
      await transaction`
        delete from standards
        where tenant_id = ${fixture.tenantId}
      `
      await transaction`
        delete from identities
        where tenant_id = ${fixture.tenantId}
      `
      await transaction`
        delete from tenants
        where id = ${fixture.tenantId}
      `
    })
  } finally {
    await sql.end({ timeout: 3 })
  }
}

function createGeneratingRecord(
  fixture: TenantFixture,
  suffix: string,
  attemptNumber: number,
  updatedAt: string,
  idempotencyKey = `issue-42-${suffix}-${runId}`,
): LessonGenerationRecord {
  const requestId = `draft_issue_42_${suffix}_${runId}`
  const createdAt = '2026-07-18T00:00:00.000Z'
  const input = {
    prompt: 'Equivalent fractions',
    grade: 4,
    standardId: fixture.standardId,
    language: 'en' as const,
    difficulty: 'on-level' as const,
  }

  return {
    requestId,
    tenantId: fixture.tenantId,
    teacherId: fixture.teacherId,
    input,
    state: 'generating',
    attempt: attemptNumber,
    diagnostics: [],
    attempts: [
      {
        attemptNumber,
        idempotencyKey,
        state: 'generating',
        correctionAttempted: false,
        diagnostics: [],
        createdAt,
      },
    ],
    createdAt,
    updatedAt,
  }
}
