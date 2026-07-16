import { getDemoSession } from '@/server/demo/policy'
import { createDeterministicLessonDraftProvider } from '@/server/generation/provider'
import { createGenerationService } from '@/server/generation/service'
import { createSeededPersistence } from '@/server/persistence/seeded'
import { demoSeed } from '@/server/seed-data'

export {}

const baseUrl = process.env.SMOKE_URL ?? 'http://127.0.0.1:3000'
const requestTimeoutMs = 3_000
const paths = [
  '/',
  '/api/health',
  '/api/readiness',
  '/demo/teacher',
  '/demo/student',
]

const results = await Promise.all(
  paths.map(async (path) => {
    try {
      const response = await fetch(new URL(path, baseUrl), {
        signal: AbortSignal.timeout(requestTimeoutMs),
      })
      return { path, status: String(response.status), ok: response.ok }
    } catch (error) {
      return {
        path,
        status: 'ERROR',
        ok: false,
        reason: error instanceof Error ? error.name : 'UnknownError',
      }
    }
  }),
)

for (const result of results) {
  console.log(
    `${result.ok ? 'PASS' : 'FAIL'} ${result.status} ${result.path}${
      'reason' in result ? ` (${result.reason})` : ''
    }`,
  )
}

if (results.some((result) => !result.ok)) {
  process.exitCode = 1
}

const requestInput = {
  prompt: 'equivalent fractions for grade 4',
  grade: 4,
  standardId: demoSeed.standard.id,
  language: 'en' as const,
  difficulty: 'on-level' as const,
  idempotencyKey: 'smoke-generation-request',
}
const generationService = createGenerationService({
  persistence: createSeededPersistence(),
  provider: createDeterministicLessonDraftProvider(),
  requestIdFactory: () => 'draft_req_smoke_generation',
})
const generation = await generationService.generate({
  session: getDemoSession('teacher'),
  input: requestInput,
})
const generationPassed =
  generation.record.state === 'ready-for-review' &&
  generation.record.draft?.variants.length === 4
console.log(
  `${generationPassed ? 'PASS' : 'FAIL'} teacher generation returns four reviewable variants`,
)

const recoveryService = createGenerationService({
  persistence: createSeededPersistence(),
  provider: createDeterministicLessonDraftProvider('timeout'),
  requestIdFactory: () => 'draft_req_smoke_failure',
})
const recovery = await recoveryService.generate({
  session: getDemoSession('teacher'),
  input: { ...requestInput, idempotencyKey: 'smoke-generation-failure' },
})
const recoveryPassed =
  recovery.record.state === 'failed-retryable' &&
  recovery.publicResult.retry.available
console.log(
  `${recoveryPassed ? 'PASS' : 'FAIL'} forced provider failure exposes a retry state`,
)

if (!generationPassed || !recoveryPassed) {
  process.exitCode = 1
}
