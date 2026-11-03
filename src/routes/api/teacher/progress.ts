import { createFileRoute } from "@tanstack/react-router";

import { handleTeacherProgressRequest } from "@/server/learner/progress.server";

const handleGet = ({ request }: { request: Request }) =>
  handleTeacherProgressRequest(request);

export const Route = createFileRoute("/api/teacher/progress")({
  server: { handlers: { GET: handleGet } },
});
