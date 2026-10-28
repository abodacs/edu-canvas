import { createFileRoute } from "@tanstack/react-router";

import {
  handleContinue,
  resolveAuthOrError,
} from "@/server/identity/api.server";

const handlePost = async ({ request }: { request: Request }) => {
  const resolved = await resolveAuthOrError();
  return resolved.ok
    ? handleContinue(request, resolved.dependencies)
    : resolved.response;
};

export const Route = createFileRoute("/api/auth/continue")({
  server: { handlers: { POST: handlePost } },
});
