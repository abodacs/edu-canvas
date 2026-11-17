import { createFileRoute } from "@tanstack/react-router";

import {
  handleOpenReviewRequest,
  handleReadReviewRequest,
} from "@/server/publication/delivery.server";

const handlePost = async ({ request }: { request: Request }) =>
  await handleOpenReviewRequest(request);

const handleGet = async ({ request }: { request: Request }) =>
  await handleReadReviewRequest(request);

export const Route = createFileRoute("/api/publications/review")({
  server: { handlers: { POST: handlePost, GET: handleGet } },
});
