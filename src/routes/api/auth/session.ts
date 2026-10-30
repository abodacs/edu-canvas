import { createFileRoute } from "@tanstack/react-router";

import { authRoute, handleSession } from "@/server/identity/api.server";

export const Route = createFileRoute("/api/auth/session")({
  server: { handlers: { GET: authRoute(handleSession) } },
});
