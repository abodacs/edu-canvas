import { createFileRoute } from "@tanstack/react-router";

import {
  handleAuthContext,
  resolveAuthOrError,
} from "@/server/identity/api.server";

const handleGet = async ({ request }: { request: Request }) => {
  const resolved = await resolveAuthOrError();
  return resolved.ok
    ? handleAuthContext(request, resolved.dependencies)
    : resolved.response;
};

export const Route = createFileRoute("/api/auth/context")({
  server: { handlers: { GET: handleGet } },
});
