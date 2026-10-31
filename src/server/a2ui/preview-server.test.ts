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

/* eslint-disable func-style, unicorn/consistent-function-scoping -- vi.mock factories are hoisted and cannot reference module-scope helpers. */
// Mirrors the production seam: resolve the session, then require a teacher.
const seam = vi.hoisted(() => {
  function failure(code: string, status: number, message: string) {
    return { ok: false, error: { code, status, message } };
  }

  function resolveTeacherActor() {
    const resolution = sessionState.resolution as SessionResolution;
    if (resolution.status === "unavailable") {
      return Promise.resolve(
        failure(
          "AUTH_UNAVAILABLE",
          503,
          "Sign-in is temporarily unavailable. Try again in a moment."
        )
      );
    }
    if (resolution.status !== "active") {
      return Promise.resolve(
        failure("UNAUTHENTICATED", 401, "Sign in to continue.")
      );
    }
    if (resolution.actor.role !== "teacher") {
      return Promise.resolve(
        failure("FORBIDDEN", 403, "You do not have access to this resource.")
      );
    }
    return Promise.resolve({
      ok: true,
      actor: resolution.actor,
      sessionId: resolution.session.sessionId,
      dependencies: { config: { issues: [] } },
    });
  }

  return { resolveTeacherActor };
});

vi.mock(
  import(
    /* webpackChunkName: "identity-api-server" */ "@/server/identity/api.server"
  ),
  () => {
    return {
      resolveAuthDependencies: () => Promise.resolve({}),
      resolveRequestSession: () => Promise.resolve(sessionState.resolution),
      resolveTeacherActor: seam.resolveTeacherActor,
    } as never;
  }
);
/* eslint-enable func-style, unicorn/consistent-function-scoping */

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

  it("renders the forward story with the accepted path", async () => {
    const { body } = await requestOwnedPreview();

    expect(body).toContain('"id":"story-plan","component":"Column"');
    expect(body).toContain("Forward learner story");
    expect(body).toContain("Connection reveal");
  });

  it("never compiles a story for a blocked draft", async () => {
    const ownedRecord = await (
      persistenceState.current as FoundationPersistence
    ).readGeneration(owningTeacher.tenantId, draftRequestId);
    if (!ownedRecord) {
      throw new Error("Expected the owned draft to be persisted.");
    }
    const blockedRecord = {
      ...ownedRecord,
      state: "blocked-by-validation" as const,
    };
    // eslint-disable-next-line require-atomic-updates -- test seam, fixed fixture
    persistenceState.current = {
      readGeneration: () => blockedRecord,
    };

    const { body, response } = await requestOwnedPreview();

    expect(response.status).toBe(409);
    expect(body).toContain("PREVIEW_NOT_READY");
    expect(body).not.toContain("story-plan");
    expect(body).not.toContain("Forward learner story");
  });
});

describe("fractions-v2 preview negotiation", () => {
  const fractionRecord = {
    requestId: draftRequestId,
    tenantId: owningTeacher.tenantId,
    teacherId: owningTeacher.actorId,
    input: {
      prompt: "equivalent fractions",
      grade: 4,
      standardId: demoSeed.standard.id,
      language: "en",
      difficulty: "on-level",
      idempotencyKey: "fraction-preview-test",
    },
    state: "ready-for-review",
    attempt: 1,
    diagnostics: [],
    attempts: [],
    provenance: { catalogVersion: "fractions-v2" },
    fractionDraft: {
      requestId: draftRequestId,
      standardId: demoSeed.standard.id,
      grade: 4,
      language: "en",
      direction: "ltr",
      title: "Equivalent fractions",
      sections: [
        {
          sectionId: "section-equal-parts",
          purpose: "Recognize equal parts",
          stem: "\\frac{1}{2}",
          stemTextEquivalent: "One half.",
          diagramLabel: "Shade one half",
          denominator: 2,
          numerator: 1,
        },
        {
          sectionId: "section-equivalence",
          purpose: "Match equivalent names",
          stem: "\\frac{2}{4} = \\frac{1}{2}",
          diagramLabel: "Shade two quarters",
          denominator: 4,
          numerator: 2,
        },
      ],
    },
  };

  const fractionRequest = (catalogVersion?: string): Request => {
    const query = catalogVersion
      ? `?requestId=${draftRequestId}&catalogVersion=${catalogVersion}`
      : `?requestId=${draftRequestId}`;
    return new Request(`http://localhost/api/a2ui/preview${query}`, {
      headers: { cookie: "edu_canvas_session=owner-credential" },
    });
  };

  beforeEach(() => {
    sessionState.resolution = activeSession(owningTeacher);
  });

  it("refuses a request whose catalog does not match the pinned record", async () => {
    persistenceState.current = {
      readGeneration: () => fractionRecord,
    };

    const response = await handleLessonPreviewRequest(
      fractionRequest("matching-v1")
    );

    expect(response.status).toBe(406);
    await expect(response.json()).resolves.toMatchObject({
      code: "UNSUPPORTED_CATALOG",
    });
  });

  it("streams the fraction draft as one surface per section", async () => {
    persistenceState.current = {
      readGeneration: () => fractionRecord,
    };

    const response = await handleLessonPreviewRequest(
      fractionRequest("fractions-v2")
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-edu-canvas-catalog")).toBe("fractions-v2");
    expect(body).toContain('"component":"MathText"');
    expect(body).toContain('"component":"FractionDiagram"');
    expect(body).toContain('"surfaceCount":2');
  });

  it("blocks a pinned fraction record whose draft breaks the contract", async () => {
    persistenceState.current = {
      readGeneration: () => {
        return {
          ...fractionRecord,
          fractionDraft: { variants: [] },
        };
      },
    };

    const response = await handleLessonPreviewRequest(
      fractionRequest("fractions-v2")
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "PREVIEW_BLOCKED",
    });
  });
});
