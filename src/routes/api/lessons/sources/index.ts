import { createFileRoute } from "@tanstack/react-router";

import {
  handleSourceListRequest,
  handleSourceUploadRequest,
} from "@/server/grounding/delivery.server";

const handlePost = async ({ request }: { request: Request }) =>
  await handleSourceUploadRequest(request);

const handleGet = async ({ request }: { request: Request }) =>
  await handleSourceListRequest(request);

export const Route = createFileRoute("/api/lessons/sources/")({
  server: { handlers: { POST: handlePost, GET: handleGet } },
});
