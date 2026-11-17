import { createFileRoute } from "@tanstack/react-router";

import { handleCancelGenerationRequest } from "@/server/generation/delivery.server";

const handlePost = async ({
  request,
  params,
}: {
  request: Request;
  params: { draftId: string };
}) => await handleCancelGenerationRequest(request, params.draftId);

export const Route = createFileRoute("/api/lessons/$draftId/cancel")({
  server: { handlers: { POST: handlePost } },
});
