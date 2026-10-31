import { createFileRoute } from "@tanstack/react-router";

import { handleSourceReadRequest } from "@/server/grounding/delivery.server";

const handleGet = ({
  request,
  params,
}: {
  request: Request;
  params: { sourceId: string };
}) => handleSourceReadRequest(request, params.sourceId);

export const Route = createFileRoute("/api/lessons/sources/$sourceId/")({
  server: { handlers: { GET: handleGet } },
});
