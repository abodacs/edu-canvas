import { createFileRoute } from '@tanstack/react-router'

import { handleLessonPreviewRequest } from '@/server/a2ui/preview.server'

export const Route = createFileRoute('/api/a2ui/preview')({
  server: {
    handlers: {
      GET: ({ request }) => handleLessonPreviewRequest(request),
    },
  },
})
