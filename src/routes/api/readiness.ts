import { createFileRoute } from "@tanstack/react-router";

import { getReadinessPayload } from "@/server/health.server";
import { noStoreJson } from "@/server/http.server";

const handleGet = async () => {
  const payload = await getReadinessPayload();
  return noStoreJson(payload, payload.status === "ready" ? 200 : 503);
};

export const Route = createFileRoute("/api/readiness")({
  server: {
    handlers: {
      GET: handleGet,
    },
  },
});
