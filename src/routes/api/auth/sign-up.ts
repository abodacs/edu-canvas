import { createFileRoute } from "@tanstack/react-router";

import { authRoute, handleSignUp } from "@/server/identity/api.server";

export const Route = createFileRoute("/api/auth/sign-up")({
  server: { handlers: { POST: authRoute(handleSignUp) } },
});
