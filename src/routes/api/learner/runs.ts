import { createFileRoute } from "@tanstack/react-router";

import { handleStartRunRequest } from "@/server/learner/delivery.server";

const handlePost = ({ request }: { request: Request }) =>
  handleStartRunRequest(request);

export const Route = createFileRoute("/api/learner/runs")({
  server: { handlers: { POST: handlePost } },
});
