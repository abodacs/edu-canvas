/**
#9 student probe seed. Runs as a child process against the scratch database
only (the parent sets DATABASE_URL). It composes the same services the
delivery seams use (scripts/student-probe/seed-services.ts), with the
deterministic lesson provider, and publishes one English and one Arabic pack to
the synthetic learner. It prints the learner links as one JSON line on stdout.
*/
import { readServerConfig } from "@/server/config";
import { syntheticSeed } from "@/server/seed-data";

import { createSeedServices, signInGateTeacher } from "./seed-services";
import { gateTeacher } from "../ui-gate/session";
import { restoreSourceLink } from "./source-link";

import type { LessonLanguage } from "@/shared/generation-contract";

const learnerId = "learner_omar";

const config = readServerConfig();
const { databaseUrl } = config;
if (databaseUrl === undefined) {
  throw new Error(
    "scripts/student-probe/seed.ts needs DATABASE_URL: it writes only to the scratch database the probe creates."
  );
}
const teacher = await signInGateTeacher(config, gateTeacher.membership);
const services = createSeedServices(config);
const generation = services.generationFor("valid");

const publishPack = async (language: LessonLanguage) => {
  const snapshotId = await services.reviewedSource(teacher);
  const generated = await generation.generate({
    actor: teacher,
    input: {
      prompt: "equivalent fractions for grade 4",
      grade: 4,
      standardId: syntheticSeed.standard.id,
      language,
      difficulty: "on-level",
      idempotencyKey: `student-probe-${language}`,
      sourceSnapshotId: snapshotId,
    },
  });
  const { requestId, state } = generated.record;
  if (state !== "ready-for-review") {
    throw new Error(`The ${language} draft ended in ${state}.`);
  }
  await restoreSourceLink(databaseUrl, requestId, snapshotId);
  const review = await services.approveEverything(
    teacher,
    requestId,
    `probe-approve-${language}`
  );
  const published = await services.publication.publish(teacher, {
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
