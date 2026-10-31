import { createFileRoute } from "@tanstack/react-router";

import { handleReviseRequest } from "@/server/publication/delivery.server";

const handlePost = ({ request }: { request: Request }) =>
  handleReviseRequest(request);

export const Route = createFileRoute("/api/publications/revisions")({
  server: { handlers: { POST: handlePost } },
});
