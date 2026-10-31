import { createFileRoute } from "@tanstack/react-router";

import { handleSourceReviewRequest } from "@/server/grounding/delivery.server";

const handlePost = ({
  request,
  params,
}: {
  request: Request;
  params: { sourceId: string };
}) => handleSourceReviewRequest(request, params.sourceId);

export const Route = createFileRoute("/api/lessons/sources/$sourceId/review")({
  server: { handlers: { POST: handlePost } },
});
