import { createFileRoute } from "@tanstack/react-router";

import { authRoute, handleAuthContext } from "@/server/identity/api.server";

export const Route = createFileRoute("/api/auth/context")({
  server: { handlers: { GET: authRoute(handleAuthContext) } },
});
