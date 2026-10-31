import { describe, expect, it } from "vitest";

import { createDeterministicLessonDraftProvider } from "@/server/generation/provider";
import { createGenerationService } from "@/server/generation/service";
import {
  parseActorId,
  parseMembershipId,
  parseTenantId,
} from "@/server/identity/identifiers";
import { syntheticTeacherActor } from "@/server/identity/test-actors";
import {
  createSeededPackPersistence,
  createSeededPackStore,
} from "@/server/persistence/pack-seeded";
import { createSeededPersistence } from "@/server/persistence/seeded";
import { demoSeed } from "@/server/seed-data";
import { createPublicationService } from "./service";
import { PublicationError } from "./errors";

import type {
  SeededPackLearner,
  SeededPackStore,
} from "@/server/persistence/pack-seeded";
import type { TeacherActor } from "@/server/identity/types";
import type { ReviewPack } from "@/shared/publication-contract";

const requestId = "draft_req_publication_owner";
const fixedNow = "2026-10-31T12:00:00.000Z";

const teacherActor = syntheticTeacherActor({
  tenantId: parseTenantId(demoSeed.tenant.id),
  membershipId: parseMembershipId("membership_amira_demo"),
});

const otherTeacher = syntheticTeacherActor({
  actorId: parseActorId("actor_teacher_bilal"),
  displayName: "Bilal Nasser",
  tenantId: parseTenantId(demoSeed.tenant.id),
  membershipId: parseMembershipId("membership_bilal_demo"),
});

const northTeacher = syntheticTeacherActor({
  tenantId: parseTenantId("tenant_school_north"),
  membershipId: parseMembershipId("membership_amira_north"),
});

const demoLearner: SeededPackLearner = {
  id: "learner_omar",
  displayName: "Omar Nabil",
  tenantId: demoSeed.tenant.id,
};

interface Fixture {
  teacher: TeacherActor;
  open: () => Promise<ReviewPack>;
  store: SeededPackStore;
  publishService: ReturnType<typeof createPublicationService>;
}

const createFixture = async (): Promise<Fixture> => {
  const persistence = createSeededPersistence();
  await createGenerationService({
    persistence,
    provider: createDeterministicLessonDraftProvider(),
    requestIdFactory: () => requestId,
  }).generate({
    actor: teacherActor,
    input: {
      prompt: "equivalent fractions for grade 4",
      grade: 4,
      standardId: demoSeed.standard.id,
      language: "en",
      difficulty: "on-level",
      idempotencyKey: "publication-service-test",
    },
  });

  const store = createSeededPackStore([demoLearner]);
  const packs = createSeededPackPersistence({ store });
  const publishService = createPublicationService({
    generation: persistence,
    packs,
    now: () => fixedNow,
  });

  return {
    teacher: teacherActor,
    open: () => publishService.openReview(teacherActor, requestId),
    store,
    publishService,
  };
};

const expectPublicationError = async (
  work: () => Promise<unknown>,
  code: string
): Promise<PublicationError> => {
  const failure = await (async () => {
    try {
      await work();
    } catch (error) {
      return error;
    }
    return null;
  })();

  expect(failure).not.toBeNull();
  expect(failure).toBeInstanceOf(PublicationError);
  expect((failure as PublicationError).code).toBe(code);

  return failure as PublicationError;
};

const approveAll = async (
  fixture: Fixture,
  review: ReviewPack
): Promise<ReviewPack> => {
  const acknowledged = review.version.findings
    .filter((finding) => finding.verdict === "warning")
    .map((finding) => finding.code);

  await Promise.all(
    review.draft.variants.map((variant) => {
      return fixture.publishService.approve(fixture.teacher, {
        requestId,
        versionId: review.version.id,
        targetKind: "variant",
        targetId: variant.id,
        acknowledgedFindingCodes: acknowledged,
        operationKey: `approve-${variant.id}`,
      });
    })
  );
  return fixture.publishService.approve(fixture.teacher, {
    requestId,
    versionId: review.version.id,
    targetKind: "reverse-path",
    targetId: "learning-path",
    acknowledgedFindingCodes: acknowledged,
    operationKey: "approve-reverse-path",
  });
};

const publishAll = (fixture: Fixture, review: ReviewPack) => {
  return fixture.publishService.publish(fixture.teacher, {
    requestId,
    versionId: review.version.id,
    expectedArtifactHash: review.version.artifactHash,
    learnerId: demoLearner.id,
    operationKey: "publish-key-0001",
  });
};

describe("publication service", () => {
  it("opens one immutable revision with four screens and a reverse path", async () => {
    const fixture = await createFixture();
    const review = await fixture.open();

    expect({
      revision: review.version.revision,
      state: review.version.state,
      variants: review.draft.variants.length,
      hasPath: (review.learningPath?.steps.length ?? 0) > 0,
      canPublish: review.canPublish,
      missingApprovals: review.publishBlockers.filter((blocker) =>
        blocker.startsWith("MISSING_")
      ).length,
      learners: review.availableLearners,
    }).toStrictEqual({
      revision: 1,
      state: "ready-for-review",
      variants: 4,
      hasPath: true,
      canPublish: false,
      missingApprovals: 5,
      learners: [{ id: "learner_omar", displayName: "Omar Nabil" }],
    });

    const uniqueBlockers = new Set(review.publishBlockers);

    expect(uniqueBlockers.size).toBe(review.publishBlockers.length);

    const reopened = await fixture.open();

    expect(reopened.version.id).toBe(review.version.id);
  });

  it("never exposes private answer relationships or an answer key", async () => {
    const fixture = await createFixture();
    const review = await fixture.open();
    const wire = JSON.stringify(review);

    expect(wire).not.toContain("relationships");
    expect(wire).not.toContain("answerKey");
    expect(wire).not.toContain("privateAnswers");
    expect(wire).not.toContain("sourceId");
  });

  it("requires every screen and the reverse path before publishing", async () => {
    const fixture = await createFixture();
    const review = await fixture.open();

    const error = await expectPublicationError(
      () => publishAll(fixture, review),
      "MISSING_APPROVAL"
    );

    expect(error.detail).toContain(
      `MISSING_VARIANT_APPROVAL:${review.draft.variants[0]?.id ?? ""}`
    );
    expect(error.detail).toContain("MISSING_REVERSE_PATH_APPROVAL");
  });

  it("publishes after all five approvals and assigns the seeded student", async () => {
    const fixture = await createFixture();
    const review = await fixture.open();
    const approved = await approveAll(fixture, review);

    const outcome = await publishAll(fixture, approved);

    expect({
      canPublish: approved.canPublish,
      blockers: approved.publishBlockers,
      artifactHash: outcome.review.publication?.artifactHash,
      assignment: outcome.review.assignment,
      published: outcome.review.canPublish,
      alreadyPublished:
        outcome.review.publishBlockers.includes("ALREADY_PUBLISHED"),
    }).toStrictEqual({
      canPublish: true,
      blockers: [],
      artifactHash: approved.version.artifactHash,
      assignment: {
        id: outcome.assignmentId,
        learnerId: "learner_omar",
        learnerDisplayName: "Omar Nabil",
      },
      published: false,
      alreadyPublished: true,
    });
  });

  it("returns the same publication on a duplicate click and a second key", async () => {
    const fixture = await createFixture();
    const review = await fixture.open();
    const approved = await approveAll(fixture, review);
    const first = await publishAll(fixture, approved);
    const replay = await publishAll(fixture, approved);

    expect(replay.publicationId).toBe(first.publicationId);
    expect(replay.assignmentId).toBe(first.assignmentId);

    const secondKey = await fixture.publishService.publish(fixture.teacher, {
      requestId,
      versionId: approved.version.id,
      expectedArtifactHash: approved.version.artifactHash,
      learnerId: demoLearner.id,
      operationKey: "publish-key-0002",
    });

    expect(secondKey.publicationId).toBe(first.publicationId);
    expect(secondKey.assignmentId).toBe(first.assignmentId);
  });

  it("rejects an operation key reused with a different payload", async () => {
    const fixture = await createFixture();

    expect.hasAssertions();

    const review = await fixture.open();
    const approved = await approveAll(fixture, review);
    await publishAll(fixture, approved);

    await expectPublicationError(() => {
      return fixture.publishService.publish(fixture.teacher, {
        requestId,
        versionId: approved.version.id,
        expectedArtifactHash: approved.version.artifactHash,
        learnerId: "learner_missing",
        operationKey: "publish-key-0001",
      });
    }, "IDEMPOTENCY_CONFLICT");
  });

  it("creates a new revision on edit and resets approvals", async () => {
    const fixture = await createFixture();
    const review = await fixture.open();
    await approveAll(fixture, review);

    const revised = await fixture.publishService.revise(fixture.teacher, {
      requestId,
      versionId: review.version.id,
      expectedArtifactHash: review.version.artifactHash,
      edits: [
        {
          variantId: review.draft.variants[0]?.id ?? "",
          field: "hint",
          index: 0,
          value: "A freshly rewritten hint.",
        },
      ],
      operationKey: "revise-key-0001",
    });

    expect({
      revision: revised.version.revision,
      newVersion: revised.version.id !== review.version.id,
      newHash: revised.version.artifactHash !== review.version.artifactHash,
      approvals: revised.version.approvals,
      canPublish: revised.canPublish,
      hint: revised.draft.variants[0]?.hints[0],
    }).toStrictEqual({
      revision: 2,
      newVersion: true,
      newHash: true,
      approvals: [],
      canPublish: false,
      hint: "A freshly rewritten hint.",
    });
  });

  it("rejects a stale revision hash", async () => {
    const fixture = await createFixture();

    expect.hasAssertions();

    const review = await fixture.open();

    await expectPublicationError(() => {
      return fixture.publishService.revise(fixture.teacher, {
        requestId,
        versionId: review.version.id,
        expectedArtifactHash: "a".repeat(64),
        edits: [
          {
            variantId: review.draft.variants[0]?.id ?? "",
            field: "feedbackCorrect",
            value: "Nice work.",
          },
        ],
        operationKey: "revise-key-stale",
      });
    }, "REVIEW_STALE");
  });

  it("blocks approving a warning that was not acknowledged", async () => {
    const fixture = await createFixture();
    const review = await fixture.open();
    const [stored] = fixture.store.versions.values().toArray();

    expect(stored).toBeDefined();

    if (!stored) {
      throw new Error("The fixture did not store a version.");
    }
    stored.validationResult = {
      ...(stored.validationResult as Record<string, unknown>),
      findings: [
        {
          validator: "learning-quality",
          validatorVersion: "semantic-validator-v1",
          verdict: "warning",
          code: "HINT_TONE_SOFT",
          field: "hints",
          reason: "A hint could be phrased more directly.",
          recovery: "edit",
        },
      ],
    };

    await expectPublicationError(() => {
      return fixture.publishService.approve(fixture.teacher, {
        requestId,
        versionId: review.version.id,
        targetKind: "variant",
        targetId: review.draft.variants[0]?.id ?? "",
        acknowledgedFindingCodes: [],
        operationKey: "approve-warning-0001",
      });
    }, "WARNINGS_UNACKNOWLEDGED");

    const approved = await fixture.publishService.approve(fixture.teacher, {
      requestId,
      versionId: review.version.id,
      targetKind: "variant",
      targetId: review.draft.variants[0]?.id ?? "",
      acknowledgedFindingCodes: ["HINT_TONE_SOFT"],
      operationKey: "approve-warning-0002",
    });

    expect(approved.version.approvals).toHaveLength(1);
  });

  it("keeps a different teacher and another tenant out of the review", async () => {
    const fixture = await createFixture();

    expect.hasAssertions();

    const review = await fixture.open();

    await expectPublicationError(
      () => fixture.publishService.readReview(otherTeacher, requestId),
      "PUBLICATION_NOT_FOUND"
    );
    await expectPublicationError(
      () => fixture.publishService.readReview(northTeacher, requestId),
      "PUBLICATION_NOT_FOUND"
    );
    await expectPublicationError(() => {
      return fixture.publishService.approve(otherTeacher, {
        requestId,
        versionId: review.version.id,
        targetKind: "variant",
        targetId: review.draft.variants[0]?.id ?? "",
        acknowledgedFindingCodes: [],
        operationKey: "approve-other-teacher",
      });
    }, "PUBLICATION_FORBIDDEN");
  });

  it("rejects a learner that is not an active student in the tenant", async () => {
    const fixture = await createFixture();

    expect.hasAssertions();

    const review = await fixture.open();
    const approved = await approveAll(fixture, review);

    await expectPublicationError(() => {
      return fixture.publishService.publish(fixture.teacher, {
        requestId,
        versionId: approved.version.id,
        expectedArtifactHash: approved.version.artifactHash,
        learnerId: "learner_missing",
        operationKey: "publish-key-missing",
      });
    }, "PUBLICATION_FORBIDDEN");
  });
});
