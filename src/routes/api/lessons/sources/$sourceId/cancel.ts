import { createFileRoute } from "@tanstack/react-router";

import { handleSourceCancelRequest } from "@/server/grounding/delivery.server";

const handlePost = ({
  request,
  params,
}: {
  request: Request;
  params: { sourceId: string };
}) => handleSourceCancelRequest(request, params.sourceId);

export const Route = createFileRoute("/api/lessons/sources/$sourceId/cancel")({
  server: { handlers: { POST: handlePost } },
});
