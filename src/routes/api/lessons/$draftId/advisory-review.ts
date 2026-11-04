import { createFileRoute } from "@tanstack/react-router";

import {
  handleReadAdvisoryReview,
  handleRequestAdvisoryReview,
} from "@/server/generation/delivery.server";

const handlePost = ({
  request,
  params,
}: {
  request: Request;
  params: { draftId: string };
}) => handleRequestAdvisoryReview(request, params.draftId);

const handleGet = ({
  request,
  params,
}: {
  request: Request;
  params: { draftId: string };
}) => handleReadAdvisoryReview(request, params.draftId);

export const Route = createFileRoute("/api/lessons/$draftId/advisory-review")({
  server: { handlers: { POST: handlePost, GET: handleGet } },
});
