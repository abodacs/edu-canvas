import { createFileRoute } from "@tanstack/react-router";

import { authRoute, handleContinue } from "@/server/identity/api.server";

export const Route = createFileRoute("/api/auth/continue")({
  server: { handlers: { POST: authRoute(handleContinue) } },
});
