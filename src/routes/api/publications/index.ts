import { createFileRoute } from "@tanstack/react-router";

import { handlePublishRequest } from "@/server/publication/delivery.server";

const handlePost = async ({ request }: { request: Request }) =>
  await handlePublishRequest(request);

export const Route = createFileRoute("/api/publications/")({
  server: { handlers: { POST: handlePost } },
});
