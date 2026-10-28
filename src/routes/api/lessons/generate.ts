import { createFileRoute } from "@tanstack/react-router";

import { handleGenerateLessonRequest } from "@/server/generation/delivery.server";

const handlePost = ({ request }: { request: Request }) =>
  handleGenerateLessonRequest(request);

export const Route = createFileRoute("/api/lessons/generate")({
  server: { handlers: { POST: handlePost } },
});
