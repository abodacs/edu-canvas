import { createFileRoute } from "@tanstack/react-router";

import { handleApproveRequest } from "@/server/publication/delivery.server";

const handlePost = async ({ request }: { request: Request }) =>
  await handleApproveRequest(request);

export const Route = createFileRoute("/api/publications/approvals")({
  server: { handlers: { POST: handlePost } },
});
