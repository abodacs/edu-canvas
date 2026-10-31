import { createFileRoute } from "@tanstack/react-router";

import { handlePublishRequest } from "@/server/publication/delivery.server";

const handlePost = ({ request }: { request: Request }) =>
  handlePublishRequest(request);

export const Route = createFileRoute("/api/publications/")({
  server: { handlers: { POST: handlePost } },
});
