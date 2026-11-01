import { createFileRoute } from "@tanstack/react-router";

import { handleSubmitAttemptRequest } from "@/server/learner/delivery.server";

const handlePost = ({ request }: { request: Request }) =>
  handleSubmitAttemptRequest(request);

export const Route = createFileRoute("/api/learner/attempts")({
  server: { handlers: { POST: handlePost } },
});
