import { createFileRoute } from "@tanstack/react-router";

import { handleLogout, resolveAuthOrError } from "@/server/identity/api.server";

const handlePost = async ({ request }: { request: Request }) => {
  const resolved = await resolveAuthOrError();
  return resolved.ok
    ? handleLogout(request, resolved.dependencies)
    : resolved.response;
};

export const Route = createFileRoute("/api/auth/logout")({
  server: { handlers: { POST: handlePost } },
});
