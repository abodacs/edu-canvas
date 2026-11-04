/**
Synthetic learner progress for the seeded dashboard (#8, #197).

`pnpm db:seed` used to write only the legacy activity and attempt rows, so a
fresh database showed the teacher an empty `/dashboard`. This seed runs the
same services the delivery seams use, with the deterministic provider, to
publish one reviewed lesson and leave four learners at different points in the
loop:

- Ethan answers incorrectly, then retries correctly. His first response keeps
  the scaffold decision, so he appears under "Needs you".
- Ava answers correctly on her own. She routes to independent practice.
- Noah asks for a hint, then answers correctly. The assisted first response
  also routes to the scaffold.
- Grace opens the lesson but has not submitted yet. She shows as in progress.

Every write uses a stable operation key, so a second `pnpm db:seed` replays the
receipts instead of duplicating assignments, runs, hints, or attempts.
*/
/* eslint-disable no-await-in-loop -- learners are seeded one at a time so the record receipts and run revisions stay ordered. */
import postgres from "postgres";

import { createLearnerService } from "@/server/learner/service";
import { createRecordPersistence } from "@/server/persistence";
import { syntheticSeed } from "@/server/seed-data";

import {
  createSeedServices,
  createSyntheticSession,
} from "./student-probe/seed-services";
import { restoreSourceLink } from "./student-probe/source-link";
import { gateTeacher } from "./ui-gate/session";

import type { ServerConfig } from "@/server/config";
import type { RecordPersistence } from "@/server/persistence/records-commands";
import type { LearnerActor, TeacherActor } from "@/server/identity/types";
import type { ReviewPack } from "@/shared/publication-contract";

const scenario = "valid" as const;
const prompt = "equivalent fractions for grade 4";
const idempotencyKey = "dashboard-seed-en";

interface DashboardLearner {
  readonly learnerId: string;
  readonly email: string;
  readonly membershipId: string;
  readonly mode: "retry" | "standard" | "assisted" | "not-started";
}

const dashboardLearners: readonly DashboardLearner[] = [
  {
    learnerId: "learner_omar",
    email: "omar.demo@example.test",
    membershipId: "membership_omar_demo",
    mode: "retry",
  },
  {
    learnerId: "learner_maya",
    email: "maya.demo@example.test",
    membershipId: "membership_maya_demo",
    mode: "standard",
  },
  {
    learnerId: "learner_samir",
    email: "samir.demo@example.test",
    membershipId: "membership_samir_demo",
    mode: "assisted",
  },
  {
    learnerId: "learner_noor",
    email: "noor.demo@example.test",
    membershipId: "membership_noor_demo",
    mode: "not-started",
  },
];

const reusableSourceId = async (
  sources: ReturnType<typeof createSeedServices>["sources"],
  teacher: TeacherActor
): Promise<string | null> => {
  const now = new Date().toISOString();
  const existing = await sources.list(teacher);
  return (
    existing.find((snapshot) => {
      return (
        snapshot.state === "complete" &&
        snapshot.reviewedAt !== null &&
        snapshot.expiresAt > now
      );
    })?.id ?? null
  );
};

const publishLesson = async (
  config: ServerConfig,
  teacher: TeacherActor,
  services: ReturnType<typeof createSeedServices>
): Promise<{
  readonly publicationId: string;
  readonly variantId: string;
  readonly omarAssignmentId: string;
  readonly review: ReviewPack;
}> => {
  const snapshotId =
    (await reusableSourceId(services.sources, teacher)) ??
    (await services.reviewedSource(teacher));
  const generated = await services.generationFor(scenario).generate({
    actor: teacher,
    input: {
      prompt,
      grade: 4,
      standardId: syntheticSeed.standard.id,
      language: "en",
      difficulty: "on-level",
      idempotencyKey,
      sourceSnapshotId: snapshotId,
    },
  });
  const { requestId, state } = generated.record;
  if (state !== "ready-for-review") {
    throw new Error(`The dashboard seed draft ended in ${state}.`);
  }
  if (config.databaseUrl === undefined) {
    throw new Error("The dashboard seed needs DATABASE_URL.");
  }
  await restoreSourceLink(config.databaseUrl, requestId, snapshotId);
  const review = await services.approveEverything(
    teacher,
    requestId,
    "dashboard-seed-approve"
  );
  const published = await services.publication.publish(teacher, {
    requestId,
    versionId: review.version.id,
    expectedArtifactHash: review.version.artifactHash,
    learnerId: "learner_omar",
    operationKey: "dashboard-seed-publish",
  });
  if (
    !published.publicationId ||
    !published.learnerVariantId ||
    !published.learnerAssignmentId
  ) {
    throw new Error("The dashboard seed published without a learner link.");
  }
  return {
    publicationId: published.publicationId,
    variantId: published.learnerVariantId,
    omarAssignmentId: published.learnerAssignmentId,
    review,
  };
};

const submit = async (
  records: RecordPersistence,
  learner: LearnerActor,
  input: {
    readonly runId: string;
    readonly itemId: string;
    readonly expectedRunRevision: number;
    readonly priorAttemptId: string | null;
    readonly pairs: readonly {
      readonly sourceId: string;
      readonly targetId: string;
    }[];
    readonly assistanceEventIds: readonly string[];
    readonly operationKey: string;
  }
): Promise<string> => {
  const service = createLearnerService(records);
  const submitted = await service.submitAttempt(learner, {
    operationKey: input.operationKey,
    runId: input.runId,
    itemId: input.itemId,
    expectedRunRevision: input.expectedRunRevision,
    priorAttemptId: input.priorAttemptId,
    pairs: input.pairs,
    assistanceState: input.assistanceEventIds.length > 0 ? "hinted" : "none",
    assistanceEventIds: input.assistanceEventIds,
  });
  return submitted.attemptId;
};

/**
The publish result names the pack publication and the bridged learner
assignment, not the records publication that the other learners join. Read that
id from the assignment once, inside the tenant scope the RLS policy expects.
*/
const publicationIdForAssignment = async (
  databaseUrl: string,
  tenantId: string,
  assignmentId: string
): Promise<string> => {
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
  try {
    return await sql.begin(async (transaction) => {
      await transaction`select set_config('app.tenant_id', ${tenantId}, true)`;
      const [row] = await transaction<{ publication_id: string }[]>`
        select publication_id from assignments where id = ${assignmentId}
      `;
      if (!row?.publication_id) {
        throw new Error("The dashboard seed assignment has no publication.");
      }
      return row.publication_id;
    });
  } finally {
    await sql.end({ timeout: 3 });
  }
};

/**
Seed four dashboard rows. Returns a short summary for the operator entry point;
the records themselves are the evidence.
*/
export const seedDashboardProgress = async (
  config: ServerConfig
): Promise<{ readonly runs: number }> => {
  const sessions = await createSyntheticSession(config);
  const teacherActor = await sessions.signInAs(
    gateTeacher.email,
    gateTeacher.membership
  );
  if (teacherActor.role !== "teacher") {
    throw new Error("The dashboard seed teacher did not resolve as a teacher.");
  }
  const teacher: TeacherActor = teacherActor;
  const services = createSeedServices(config);
  const records = createRecordPersistence(config);
  const published = await publishLesson(config, teacher, services);
  if (config.databaseUrl === undefined) {
    throw new Error("The dashboard seed needs DATABASE_URL.");
  }
  const recordsPublicationId = await publicationIdForAssignment(
    config.databaseUrl,
    teacher.tenantId,
    published.omarAssignmentId
  );

  const variant =
    published.review.draft.variants.find(
      (candidate) => candidate.id === published.variantId
    ) ?? published.review.draft.variants[0];
  const itemId = variant?.sourceItems[0]?.id;
  if (!itemId) {
    throw new Error("The dashboard seed published a lesson without an item.");
  }

  for (const plan of dashboardLearners) {
    const learnerActor = await sessions.signInAs(plan.email, plan.membershipId);
    if (learnerActor.role !== "student") {
      throw new Error(`${plan.email} did not resolve as a learner.`);
    }
    const learner: LearnerActor = learnerActor;
    let assignmentId = published.omarAssignmentId;
    if (plan.learnerId !== "learner_omar") {
      const assignment = await records.assign(teacher, {
        operationKey: `dashboard-seed-assign-${plan.learnerId}`,
        publicationId: recordsPublicationId,
        learnerId: plan.learnerId,
      });
      assignmentId = assignment.id;
    }
    const run = await records.startRun(learner, {
      operationKey: `dashboard-seed-run-${plan.learnerId}`,
      assignmentId,
      assignedVariantId: published.variantId,
    });
    if (plan.mode === "not-started") {
      continue;
    }

    const context = await records.readAttemptContext(learner, {
      runId: run.id,
      itemId,
    });
    const correctPairs = context.relationships.flatMap((relationship) => {
      const [targetId] = relationship.correctTargetIds;
      return targetId ? [{ sourceId: relationship.itemId, targetId }] : [];
    });
    if (correctPairs.length === 0) {
      throw new Error("The dashboard seed lesson has no answer relationship.");
    }
    const correctTargets = new Set(
      context.relationships.flatMap((relationship) => {
        return relationship.correctTargetIds;
      })
    );
    const wrongTargetId =
      context.section.items?.find((item) => {
        return item.role === "target" && !correctTargets.has(item.id);
      })?.id ?? "dashboard-seed-wrong-target";
    const wrongPairs = [
      { sourceId: correctPairs[0]?.sourceId ?? "", targetId: wrongTargetId },
      ...correctPairs.slice(1),
    ];

    if (plan.mode === "standard") {
      await submit(records, learner, {
        runId: run.id,
        itemId,
        expectedRunRevision: 0,
        priorAttemptId: null,
        pairs: correctPairs,
        assistanceEventIds: [],
        operationKey: `dashboard-seed-attempt-${plan.learnerId}`,
      });
      continue;
    }

    if (plan.mode === "assisted") {
      const hint = await records.recordHint(learner, {
        operationKey: `dashboard-seed-hint-${plan.learnerId}`,
        runId: run.id,
        itemId,
        expectedRunRevision: 0,
      });
      await submit(records, learner, {
        runId: run.id,
        itemId,
        expectedRunRevision: 1,
        priorAttemptId: null,
        pairs: correctPairs,
        assistanceEventIds: [hint.id],
        operationKey: `dashboard-seed-attempt-${plan.learnerId}`,
      });
      continue;
    }

    // retry: the first response is wrong, then the learner retries correctly.
    const firstAttemptId = await submit(records, learner, {
      runId: run.id,
      itemId,
      expectedRunRevision: 0,
      priorAttemptId: null,
      pairs: wrongPairs,
      assistanceEventIds: [],
      operationKey: `dashboard-seed-attempt-${plan.learnerId}`,
    });
    await submit(records, learner, {
      runId: run.id,
      itemId,
      expectedRunRevision: 1,
      priorAttemptId: firstAttemptId,
      pairs: correctPairs,
      assistanceEventIds: [],
      operationKey: `dashboard-seed-retry-${plan.learnerId}`,
    });
  }

  return { runs: dashboardLearners.length };
};
