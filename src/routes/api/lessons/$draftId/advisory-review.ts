import { createFileRoute } from "@tanstack/react-router";

import {
  handleReadAdvisoryReview,
  handleRequestAdvisoryReview,
} from "@/server/generation/delivery.server";

const handlePost = async ({
  request,
  params,
}: {
  request: Request;
  params: { draftId: string };
}) => await handleRequestAdvisoryReview(request, params.draftId);

const handleGet = async ({
  request,
  params,
}: {
  request: Request;
  params: { draftId: string };
}) => await handleReadAdvisoryReview(request, params.draftId);

export const Route = createFileRoute("/api/lessons/$draftId/advisory-review")({
  server: { handlers: { POST: handlePost, GET: handleGet } },
});
