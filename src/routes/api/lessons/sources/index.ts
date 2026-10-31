import { createFileRoute } from "@tanstack/react-router";

import {
  handleSourceListRequest,
  handleSourceUploadRequest,
} from "@/server/grounding/delivery.server";

const handlePost = ({ request }: { request: Request }) =>
  handleSourceUploadRequest(request);

const handleGet = ({ request }: { request: Request }) =>
  handleSourceListRequest(request);

export const Route = createFileRoute("/api/lessons/sources/")({
  server: { handlers: { POST: handlePost, GET: handleGet } },
});
