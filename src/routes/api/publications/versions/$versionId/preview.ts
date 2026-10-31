import { createFileRoute } from "@tanstack/react-router";

import { handleReviewPreviewRequest } from "@/server/publication/delivery.server";

const handleGet = ({
  request,
  params,
}: {
  request: Request;
  params: { versionId: string };
}) => handleReviewPreviewRequest(request, params.versionId);

export const Route = createFileRoute(
  "/api/publications/versions/$versionId/preview"
)({
  server: { handlers: { GET: handleGet } },
});
