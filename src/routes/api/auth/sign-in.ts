import { createFileRoute } from "@tanstack/react-router";

import { authRoute, handleSignIn } from "@/server/identity/api.server";

export const Route = createFileRoute("/api/auth/sign-in")({
  server: { handlers: { POST: authRoute(handleSignIn) } },
});
