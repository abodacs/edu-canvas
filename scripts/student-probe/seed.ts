/**
#9 student probe seed. Runs as a child process against the scratch database
only (the parent sets DATABASE_URL). It composes the same services the
delivery seams use, with the deterministic lesson provider, and publishes one
English and one Arabic pack to the synthetic learner. It prints the learner
links as one JSON line on stdout.
*/
import postgres from "postgres";

import { readServerConfig } from "@/server/config";
import { resolveCurriculumContext } from "@/server/generation/draft-acceptance";
import { createDeterministicLessonDraftProvider } from "@/server/generation/provider";
import { createGenerationService } from "@/server/generation/service";
import { createSourceService } from "@/server/grounding/source-service";
import { buildConfiguredIdentity } from "@/server/identity/composition.server";
import { syntheticPasswordForTests } from "@/server/identity/synthetic-fixture";
import { createDefaultContentSafety } from "@/server/moderation/content-safety";
import {
  createFoundationPersistence,
  createIdentityPersistence,
  createPackPersistence,
  createRecordPersistence,
} from "@/server/persistence";
import { createPublicationService } from "@/server/publication/service";
import { syntheticSeed } from "@/server/seed-data";

import type { TeacherActor } from "@/server/identity/types";
import type { LessonLanguage } from "@/shared/generation-contract";

const learnerId = "learner_omar";

const sourceText =
  "Equivalent fractions name the same part of a whole. Multiplying the numerator and the denominator by the same number keeps the value: 1/2 = 2/4 = 3/6.";

const config = readServerConfig();
const teacherEmail = "amira.north@example.test";
const teacherMembership = "membership_amira_demo";

/**
Publishing writes learner records, and the record store re-checks the actor against a live session row. The probe signs the synthetic teacher in through the identity service, exactly as the sign-in route does, so the actor it publishes with is a real session, not a hand-built one.
*/
const signInTeacher = async (): Promise<TeacherActor> => {
  // The fixture provisions its entries concurrently, and two entries can race
  // to insert the same tenant on an empty database. Composition is idempotent,
  // so a second pass completes whatever the first one lost.
  const identityPersistence = createIdentityPersistence(config);
  let identity: Awaited<ReturnType<typeof buildConfiguredIdentity>>;
  try {
    identity = await buildConfiguredIdentity(config, identityPersistence);
  } catch {
    identity = await buildConfiguredIdentity(config, identityPersistence);
  }
  const sourceAddress = "127.0.0.1";
  const signedIn = await identity.service.signIn({
    email: teacherEmail,
    password: syntheticPasswordForTests,
    sourceAddress,
  });
  const active =
    signedIn.status === "active"
      ? signedIn
      : await identity.service.selectMembership({
          pendingCredential: signedIn.pendingCredential,
          membershipId: teacherMembership,
          sourceAddress,
        });
  if (active.actor.role !== "teacher") {
    throw new Error("The synthetic teacher did not resolve as a teacher.");
  }
  return active.actor;
};

const teacher = await signInTeacher();

const foundation = createFoundationPersistence(config);
const sources = createSourceService({
  persistence: foundation,
  safety: createDefaultContentSafety(),
  resolveStandardPack: (standardId, tenantId) => {
    return (
      resolveCurriculumContext(
        {
          prompt: "",
          grade: 4,
          standardId,
          language: "en",
          difficulty: "on-level",
        },
        tenantId,
        {}
      ) !== undefined
    );
  },
});
const generation = createGenerationService({
  persistence: foundation,
  provider: createDeterministicLessonDraftProvider(),
});
const publication = createPublicationService({
  generation: foundation,
  packs: createPackPersistence(config),
  records: createRecordPersistence(config),
});

/**
Known defect, flagged to the generation lane: `runAttempt` rebuilds the record
input without `sourceSnapshotId` (src/server/generation/service.ts), so the
claimed request row loses its reviewed source and publish never bridges a
learner assignment. The probe restores the link on its own scratch row so the
learner path can be exercised; it changes nothing outside the scratch database.
Remove this once the generation service keeps the field.
*/
const restoreSourceLink = async (
  requestId: string,
  snapshotId: string
): Promise<void> => {
  const sql = postgres(config.databaseUrl ?? "", { max: 1 });
  // eslint-disable-next-line unicorn/prefer-dispose -- postgres.js exposes `end()`, not Symbol.asyncDispose.
  try {
    await sql`
      update lesson_draft_requests
      set source_snapshot_id = ${snapshotId}
      where id = ${requestId} and source_snapshot_id is null
    `;
  } finally {
    await sql.end();
  }
};

const publishPack = async (language: LessonLanguage) => {
  const snapshot = await sources.addCorrectedText({
    actor: teacher,
    correctedText: sourceText,
  });
  await sources.review({
    actor: teacher,
    snapshotId: snapshot.id,
    input: { requiredSkillsConfirmed: true, alignmentAcknowledged: true },
  });
  const generated = await generation.generate({
    actor: teacher,
    input: {
      prompt: "equivalent fractions for grade 4",
      grade: 4,
      standardId: syntheticSeed.standard.id,
      language,
      difficulty: "on-level",
      idempotencyKey: `student-probe-${language}`,
      sourceSnapshotId: snapshot.id,
    },
  });
  const { requestId, state } = generated.record;
  if (state !== "ready-for-review") {
    throw new Error(`The ${language} draft ended in ${state}.`);
  }
  await restoreSourceLink(requestId, snapshot.id);
  const review = await publication.openReview(teacher, requestId);
  const acknowledged = review.version.findings
    .filter((finding) => finding.verdict === "warning")
    .map((finding) => finding.code);
  await Promise.all(
    review.draft.variants.map((variant) => {
      return publication.approve(teacher, {
        requestId,
        versionId: review.version.id,
        targetKind: "variant",
        targetId: variant.id,
        acknowledgedFindingCodes: acknowledged,
        operationKey: `probe-approve-${language}-${variant.id}`,
      });
    })
  );
  await publication.approve(teacher, {
    requestId,
    versionId: review.version.id,
    targetKind: "reverse-path",
    targetId: "learning-path",
    acknowledgedFindingCodes: acknowledged,
    operationKey: `probe-approve-${language}-path`,
  });
  const published = await publication.publish(teacher, {
    requestId,
    versionId: review.version.id,
    expectedArtifactHash: review.version.artifactHash,
    learnerId,
    operationKey: `probe-publish-${language}`,
  });
  if (!published.learnerAssignmentId || !published.learnerVariantId) {
    throw new Error(`The ${language} pack published without a learner link.`);
  }
  return {
    assignment: published.learnerAssignmentId,
    variant: published.learnerVariantId,
  };
};

const links = {
  en: await publishPack("en"),
  ar: await publishPack("ar"),
};
process.stdout.write(`${JSON.stringify(links)}\n`);
process.exit(0);
