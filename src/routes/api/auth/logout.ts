import { createFileRoute } from "@tanstack/react-router";

import { authRoute, handleLogout } from "@/server/identity/api.server";

export const Route = createFileRoute("/api/auth/logout")({
  server: { handlers: { POST: authRoute(handleLogout) } },
});
