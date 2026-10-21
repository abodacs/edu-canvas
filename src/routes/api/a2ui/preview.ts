import { createFileRoute } from "@tanstack/react-router";

import { handleLessonPreviewRequest } from "@/server/a2ui/preview.server";

const handleGet = ({ request }: { request: Request }) =>
  handleLessonPreviewRequest(request);

export const Route = createFileRoute("/api/a2ui/preview")({
  server: {
    handlers: {
      GET: handleGet,
    },
  },
});
