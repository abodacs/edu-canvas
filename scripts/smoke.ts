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
