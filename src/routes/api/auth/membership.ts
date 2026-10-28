import { createFileRoute } from "@tanstack/react-router";

import {
  handleMembership,
  resolveAuthOrError,
} from "@/server/identity/api.server";

const handlePost = async ({ request }: { request: Request }) => {
  const resolved = await resolveAuthOrError();
  return resolved.ok
    ? handleMembership(request, resolved.dependencies)
    : resolved.response;
};

export const Route = createFileRoute("/api/auth/membership")({
  server: { handlers: { POST: handlePost } },
});
