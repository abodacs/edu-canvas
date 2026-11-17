import { createFileRoute } from "@tanstack/react-router";

import { handleGenerateLessonRequest } from "@/server/generation/delivery.server";

const handlePost = async ({ request }: { request: Request }) =>
  await handleGenerateLessonRequest(request);

export const Route = createFileRoute("/api/lessons/generate")({
  server: { handlers: { POST: handlePost } },
});
