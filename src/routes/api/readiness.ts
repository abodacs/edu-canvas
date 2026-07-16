import { createFileRoute } from '@tanstack/react-router'

import { getReadinessPayload } from '@/server/health.server'

function jsonResponse(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      'cache-control': 'no-store',
    },
  })
}

export const Route = createFileRoute('/api/readiness')({
  server: {
    handlers: {
      GET: async () => {
        const payload = await getReadinessPayload()
        return jsonResponse(payload, payload.status === 'ready' ? 200 : 503)
      },
    },
  },
})
