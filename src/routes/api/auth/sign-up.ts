import { createFileRoute } from "@tanstack/react-router";

import { handleSignUp, resolveAuthOrError } from "@/server/identity/api.server";

const handlePost = async ({ request }: { request: Request }) => {
  const resolved = await resolveAuthOrError();
  return resolved.ok
    ? handleSignUp(request, resolved.dependencies)
    : resolved.response;
};

export const Route = createFileRoute("/api/auth/sign-up")({
  server: { handlers: { POST: handlePost } },
});
