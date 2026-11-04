/**
The service composition both browser-gate seeds share
(scripts/student-probe/seed.ts and scripts/ui-gate/seed.ts). Each seed runs as
a child process against a scratch database only; the parent sets
DATABASE_URL. The seeds compose the same services the delivery seams use, with
the deterministic lesson provider, so every fixture is produced by the real
domain rules rather than written as rows.
*/
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
import { createSeededGenerationLimitStore } from "@/server/persistence/limits-seeded";
import { createPublicationService } from "@/server/publication/service";

import { gateTeacher } from "../ui-gate/session";

import type { ServerConfig } from "@/server/config";
import type { DeterministicProviderScenario } from "@/server/generation/provider";
import type {
  Actor,
  LearnerActor,
  TeacherActor,
} from "@/server/identity/types";
import type { ReviewPack } from "@/shared/publication-contract";

const sourceText =
  "Equivalent fractions name the same part of a whole. Multiplying the numerator and the denominator by the same number keeps the value: 1/2 = 2/4 = 3/6.";

/**
Publishing writes learner records, and the record store re-checks the actor
against a live session row. The seed signs the synthetic teacher in through the
identity service, exactly as the sign-in route does, so the actor it acts with
is a real session, not a hand-built one.
*/
export interface SyntheticSession {
  readonly signInAs: (email: string, membershipId: string) => Promise<Actor>;
}

/**
Build the deterministic identity once for a seed that signs several actors in.
The fixture provisioning pass is the expensive part of a sign-in; one pass is
enough for the whole seed, and every later sign-in is a provider check plus a
session row.
*/
export const createSyntheticSession = async (
  config: ServerConfig
): Promise<SyntheticSession> => {
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
  return {
    signInAs: async (email, membershipId) => {
      const signedIn = await identity.service.signIn({
        email,
        password: syntheticPasswordForTests,
        sourceAddress,
      });
      const active =
        signedIn.status === "active"
          ? signedIn
          : await identity.service.selectMembership({
              pendingCredential: signedIn.pendingCredential,
              membershipId,
              sourceAddress,
            });
      return active.actor;
    },
  };
};

export const signInSyntheticActor = async (
  config: ServerConfig,
  email: string,
  membershipId: string
): Promise<Actor> => {
  const session = await createSyntheticSession(config);
  return session.signInAs(email, membershipId);
};

export const signInGateTeacher = async (
  config: ServerConfig,
  membershipId: string
): Promise<TeacherActor> => {
  const actor = await signInSyntheticActor(
    config,
    gateTeacher.email,
    membershipId
  );
  if (actor.role !== "teacher") {
    throw new Error("The synthetic teacher did not resolve as a teacher.");
  }
  return actor;
};

export const signInSyntheticLearner = async (
  config: ServerConfig,
  email: string,
  membershipId: string
): Promise<LearnerActor> => {
  const actor = await signInSyntheticActor(config, email, membershipId);
  if (actor.role !== "student") {
    throw new Error(`${email} did not resolve as a learner.`);
  }
  return actor;
};

export const createSeedServices = (config: ServerConfig) => {
  const foundation = createFoundationPersistence(config);
  // One limit store for the whole seed, so sequential drafts share one
  // hourly budget exactly as one teacher's requests would.
  const limits = createSeededGenerationLimitStore();
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
  const generationFor = (scenario: DeterministicProviderScenario = "valid") =>
    createGenerationService({
      persistence: foundation,
      provider: createDeterministicLessonDraftProvider(scenario),
      limits,
    });
  const publication = createPublicationService({
    generation: foundation,
    packs: createPackPersistence(config),
    records: createRecordPersistence(config),
  });

  /** A reviewed source snapshot, so a published pack can bridge a learner assignment. */
  const reviewedSource = async (teacher: TeacherActor): Promise<string> => {
    const snapshot = await sources.addCorrectedText({
      actor: teacher,
      correctedText: sourceText,
    });
    await sources.review({
      actor: teacher,
      snapshotId: snapshot.id,
      input: { requiredSkillsConfirmed: true, alignmentAcknowledged: true },
    });
    return snapshot.id;
  };

  /**
  Approve every variant and the reverse path on the current revision,
  acknowledging each warning, so the publish gate opens. Returns the review the
  approvals were pinned to.
  */
  const approveEverything = async (
    teacher: TeacherActor,
    requestId: string,
    operationPrefix: string,
    options: { readonly skipReversePath?: boolean } = {}
  ): Promise<ReviewPack> => {
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
          operationKey: `${operationPrefix}-${variant.id}`,
        });
      })
    );
    if (!options.skipReversePath) {
      await publication.approve(teacher, {
        requestId,
        versionId: review.version.id,
        targetKind: "reverse-path",
        targetId: "learning-path",
        acknowledgedFindingCodes: acknowledged,
        operationKey: `${operationPrefix}-path`,
      });
    }
    return review;
  };

  return {
    sources,
    generationFor,
    publication,
    reviewedSource,
    approveEverything,
  };
};
