import { createFileRoute } from "@tanstack/react-router";

import { authRoute, handleMembership } from "@/server/identity/api.server";

export const Route = createFileRoute("/api/auth/membership")({
  server: { handlers: { POST: authRoute(handleMembership) } },
});
