import { createFileRoute } from "@tanstack/react-router";

import {
  handleSession,
  resolveAuthOrError,
} from "@/server/identity/api.server";

const handleGet = async ({ request }: { request: Request }) => {
  const resolved = await resolveAuthOrError();
  return resolved.ok
    ? handleSession(request, resolved.dependencies)
    : resolved.response;
};

export const Route = createFileRoute("/api/auth/session")({
  server: { handlers: { GET: handleGet } },
});
