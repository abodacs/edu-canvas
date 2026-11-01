import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PublishConfirmation } from "@/components/studio/publish-confirmation";
import { ReviewGallery } from "@/components/studio/review-gallery";
import { VariantEditor } from "@/components/studio/variant-editor";
import { createDeterministicLessonDraftProvider } from "@/server/generation/provider";
import { createGenerationService } from "@/server/generation/service";
import {
  parseMembershipId,
  parseTenantId,
} from "@/server/identity/identifiers";
import { syntheticTeacherActor } from "@/server/identity/test-actors";
import {
  createSeededPackPersistence,
  createSeededPackStore,
} from "@/server/persistence/pack-seeded";
import { createSeededPersistence } from "@/server/persistence/seeded";
import { createPublicationService } from "@/server/publication/service";
import { syntheticSeed } from "@/server/seed-data";

import type { ReviewPack } from "@/shared/publication-contract";

const requestId = "draft_req_review_render";

const noop = vi.fn<() => void>();

const teacher = syntheticTeacherActor({
  tenantId: parseTenantId(syntheticSeed.tenant.id),
  membershipId: parseMembershipId("membership_amira_demo"),
});

const openReview = async (): Promise<ReviewPack> => {
  const persistence = createSeededPersistence();
  await createGenerationService({
    persistence,
    provider: createDeterministicLessonDraftProvider(),
    requestIdFactory: () => requestId,
  }).generate({
    actor: teacher,
    input: {
      prompt: "equivalent fractions for grade 4",
      grade: 4,
      standardId: syntheticSeed.standard.id,
      language: "en",
      difficulty: "on-level",
      idempotencyKey: "review-surface-test",
    },
  });

  const store = createSeededPackStore([
    {
      id: "learner_omar",
      displayName: "Omar Nabil",
      tenantId: syntheticSeed.tenant.id,
    },
  ]);
  const service = createPublicationService({
    generation: persistence,
    packs: createSeededPackPersistence({ store }),
    now: () => "2026-10-31T12:00:00.000Z",
  });
  return service.openReview(teacher, requestId);
};

const renderGallery = (review: ReviewPack): string => {
  return renderToStaticMarkup(
    createElement(ReviewGallery, {
      review,
      busy: false,
      headingRef: createRef<HTMLHeadingElement>(),
      onOpenVariant: noop,
      onApproveReverse: noop,
      onContinue: noop,
    })
  );
};

describe("review surfaces", () => {
  it("distinguishes pedagogical purpose from cosmetic variation", async () => {
    const review = await openReview();
    const markup = renderGallery(review);

    expect(markup).toContain("Teach the model");
    expect(markup).toContain("Independent practice");
    expect(markup).toContain("Guided practice");
    expect(markup).toContain("Review and challenge");
    expect(markup).toContain("Core matching");
  });

  it("shows approval state per screen and for the forward flow", async () => {
    const review = await openReview();
    const markup = renderGallery(review);

    expect(markup).toContain("0 of 5 approvals");
    expect(markup).toContain("Not approved");
    expect(markup).toContain("Reverse reasoning path");
    expect(markup).toContain("Publish gate");
    expect(markup).toContain("Continue to publish");
  });

  it("offers a screen edit and revalidation control", async () => {
    const review = await openReview();
    const variantId = review.draft.variants[0]?.id ?? "";
    const markup = renderToStaticMarkup(
      createElement(VariantEditor, {
        review,
        variantId,
        busy: false,
        onBack: noop,
        onApprove: noop,
        onSave: noop,
      })
    );

    expect(markup).toContain("Source 1");
    expect(markup).toContain("Target 1");
    expect(markup).toContain("First hint");
    expect(markup).toContain("Save edits and revalidate");
    expect(markup).toContain("Approve this screen");
  });

  it("summarizes the approved sequence and immutable revision", async () => {
    const review = await openReview();
    const markup = renderToStaticMarkup(
      createElement(PublishConfirmation, {
        review,
        busy: false,
        published: null,
        onBack: noop,
        onPublish: noop,
        onClose: noop,
      })
    );

    expect(markup).toContain("Approved screen sequence");
    expect(markup).toContain(review.version.artifactHash.slice(0, 12));
    expect(markup).toContain("Assign to learner");
    expect(markup).toContain("Publish and assign");
    expect(markup).toContain("Omar Nabil");
  });
});
