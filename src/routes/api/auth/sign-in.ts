import { createFileRoute } from "@tanstack/react-router";

import { handleSignIn, resolveAuthOrError } from "@/server/identity/api.server";

const handlePost = async ({ request }: { request: Request }) => {
  const resolved = await resolveAuthOrError();
  return resolved.ok
    ? handleSignIn(request, resolved.dependencies)
    : resolved.response;
};

export const Route = createFileRoute("/api/auth/sign-in")({
  server: { handlers: { POST: handlePost } },
});
