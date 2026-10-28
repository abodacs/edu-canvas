/* eslint-disable no-inline-comments -- import-x requires an inline single-line chunk-name comment for dynamic imports. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDeterministicLessonDraftProvider } from "@/server/generation/provider";
import { createGenerationService } from "@/server/generation/service";
import {
  parseActorId,
  parseMembershipId,
  parseTenantId,
} from "@/server/identity/identifiers";
import {
  syntheticLearnerActor,
  syntheticTeacherActor,
} from "@/server/identity/test-actors";
import { createSeededPersistence } from "@/server/persistence/seeded";
import { demoSeed } from "@/server/seed-data";

import { handleLessonPreviewRequest } from "./preview.server";

import type {
  IdentitySessionRecord,
  LearnerActor,
  SessionResolution,
  TeacherActor,
} from "@/server/identity/types";
import type { FoundationPersistence } from "@/server/persistence/types";

const draftRequestId = "draft_req_preview_owner";

const sessionState = vi.hoisted(() => ({ resolution: undefined as unknown }));

vi.mock(
  import(
    /* webpackChunkName: "identity-api-server" */ "@/server/identity/api.server"
  ),
  () => {
    return {
      resolveAuthDependencies: () => Promise.resolve({}),
      resolveRequestSession: () => Promise.resolve(sessionState.resolution),
    } as never;
  }
);

const persistenceState = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock(
  import(
    /* webpackChunkName: "foundation-persistence" */ "@/server/persistence"
  ),
  () => {
    return {
      createFoundationPersistence: () => persistenceState.current,
    } as never;
  }
);

const owningTeacher = syntheticTeacherActor({
  tenantId: parseTenantId(demoSeed.tenant.id),
});

const otherTeacher = syntheticTeacherActor({
  actorId: parseActorId("actor_teacher_bilal"),
  displayName: "Bilal Nasser",
  membershipId: parseMembershipId("membership_bilal_north"),
  tenantId: parseTenantId(demoSeed.tenant.id),
});

const sessionRecordFor = (
  actor: TeacherActor | LearnerActor
): IdentitySessionRecord => {
  return {
    sessionId: actor.sessionId,
    verifierHash: "verifier-hash",
    actorId: actor.actorId,
    membershipId: actor.membershipId,
    tenantId: actor.tenantId,
    providerSessionId: "provider-session",
    providerSubject: "subject_test",
    sessionGeneration: actor.sessionGeneration,
    authorizationRevision: actor.authorizationRevision,
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastActivityAt: "2026-01-01T00:00:00.000Z",
    absoluteExpiresAt: "2026-01-01T08:00:00.000Z",
  };
};

const activeSession = (
  actor: TeacherActor | LearnerActor
): SessionResolution => {
  return {
    status: "active",
    actor,
    session: sessionRecordFor(actor),
  };
};

const previewRequest = (cookie?: string): Request => {
  return new Request(
    `http://localhost/api/a2ui/preview?requestId=${encodeURIComponent(draftRequestId)}`,
    cookie ? { headers: { cookie } } : undefined
  );
};

const prepareOwnedDraft = async (): Promise<FoundationPersistence> => {
  const persistence = createSeededPersistence();
  await createGenerationService({
    persistence,
    provider: createDeterministicLessonDraftProvider(),
    requestIdFactory: () => draftRequestId,
  }).generate({
    actor: owningTeacher,
    input: {
      prompt: "equivalent fractions for grade 4",
      grade: 4,
      standardId: demoSeed.standard.id,
      language: "en",
      difficulty: "on-level",
      idempotencyKey: "preview-route-test",
    },
  });
  return persistence;
};

const requestOwnedPreview = async () => {
  sessionState.resolution = activeSession(owningTeacher);
  const response = await handleLessonPreviewRequest(
    previewRequest("edu_canvas_session=owner-credential")
  );
  return { body: await response.text(), response };
};

describe("teacher lesson preview delivery seam", () => {
  beforeAll(async () => {
    persistenceState.current = await prepareOwnedDraft();
  });

  beforeEach(() => {
    sessionState.resolution = { status: "unauthenticated" };
  });

  it("rejects an unsupported catalog before resolving the session", async () => {
    const response = await handleLessonPreviewRequest(
      new Request(
        "http://localhost/api/a2ui/preview?requestId=draft_req_test&catalogVersion=old-v1"
      )
    );

    expect(response.status).toBe(406);
    await expect(response.json()).resolves.toMatchObject({
      code: "UNSUPPORTED_CATALOG",
    });
  });

  it("returns 401 for an unauthenticated caller with no session cookie", async () => {
    const response = await handleLessonPreviewRequest(previewRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("returns 403 for an authenticated learner session", async () => {
    sessionState.resolution = activeSession(syntheticLearnerActor());

    const response = await handleLessonPreviewRequest(
      previewRequest("edu_canvas_session=learner-credential")
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns 403 for a teacher who does not own the draft", async () => {
    sessionState.resolution = activeSession(otherTeacher);

    const response = await handleLessonPreviewRequest(
      previewRequest("edu_canvas_session=other-credential")
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("streams the owning teacher's ready-for-review draft as twelve A2UI messages", async () => {
    const { body, response } = await requestOwnedPreview();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body.match(/event: a2ui/gu)).toHaveLength(12);
    expect(body).toContain('"surfaceCount":4');
  });

  it("carries the learning path and model version pins", async () => {
    const { body } = await requestOwnedPreview();

    expect(body).toContain('"component":"LearningPath"');
    expect(body).toContain('"graphVersion":"equivalent-fractions-v1"');
    expect(body).toContain('"modelVersion":"equivalent-fractions-fixture-v1"');
  });

  it("keeps private draft fields out of the stream", async () => {
    const { body } = await requestOwnedPreview();

    expect(body).not.toContain("answerKey");
    expect(body).not.toContain("relationship-");
    expect(body).not.toContain("provenance");
  });
});
