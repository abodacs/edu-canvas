import { createFileRoute } from "@tanstack/react-router";

import { handleReadGenerationRequest } from "@/server/generation/delivery.server";

const handleGet = async ({
  request,
  params,
}: {
  request: Request;
  params: { draftId: string };
}) => await handleReadGenerationRequest(request, params.draftId);

export const Route = createFileRoute("/api/lessons/$draftId/")({
  server: { handlers: { GET: handleGet } },
});
