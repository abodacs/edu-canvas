import { createFileRoute } from "@tanstack/react-router";

import { handleSourceCancelRequest } from "@/server/grounding/delivery.server";

const handlePost = async ({
  request,
  params,
}: {
  request: Request;
  params: { sourceId: string };
}) => await handleSourceCancelRequest(request, params.sourceId);

export const Route = createFileRoute("/api/lessons/sources/$sourceId/cancel")({
  server: { handlers: { POST: handlePost } },
});
