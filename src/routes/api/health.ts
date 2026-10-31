import { createFileRoute } from "@tanstack/react-router";

import { getHealthPayload } from "@/server/health.server";
import { noStoreJson } from "@/server/http.server";

const handleGet = () => noStoreJson(getHealthPayload());

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: handleGet,
    },
  },
});
