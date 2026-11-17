import { createFileRoute } from "@tanstack/react-router";

import { handleTeacherProgressRequest } from "@/server/learner/progress.server";

const handleGet = async ({ request }: { request: Request }) =>
  await handleTeacherProgressRequest(request);

export const Route = createFileRoute("/api/teacher/progress")({
  server: { handlers: { GET: handleGet } },
});
