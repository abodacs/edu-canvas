import { createFileRoute } from "@tanstack/react-router";

import { getHealthPayload } from "@/server/health.server";

const jsonResponse = (payload: unknown, status = 200) => {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
};

const handleGet = () => jsonResponse(getHealthPayload());

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: handleGet,
    },
  },
});
