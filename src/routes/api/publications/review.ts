import { createFileRoute } from "@tanstack/react-router";

import {
  handleOpenReviewRequest,
  handleReadReviewRequest,
} from "@/server/publication/delivery.server";

const handlePost = ({ request }: { request: Request }) =>
  handleOpenReviewRequest(request);

const handleGet = ({ request }: { request: Request }) =>
  handleReadReviewRequest(request);

export const Route = createFileRoute("/api/publications/review")({
  server: { handlers: { POST: handlePost, GET: handleGet } },
});
