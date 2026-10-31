import { createFileRoute } from "@tanstack/react-router";

import { handleApproveRequest } from "@/server/publication/delivery.server";

const handlePost = ({ request }: { request: Request }) =>
  handleApproveRequest(request);

export const Route = createFileRoute("/api/publications/approvals")({
  server: { handlers: { POST: handlePost } },
});
