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
import { deriveStoredArtifactGate } from "@/server/safety/artifact-enforcement";
import {
  gateArtifact,
  snapshotArtifactGateResult,
} from "@/server/safety/artifact-gate";

import {
  handleLessonPreviewRequest,
  previewRefusalSchema,
} from "./preview.server";

import type { LessonGenerationRecord } from "@/server/generation/types";

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

const useRecord = (record: unknown) => {
  persistenceState.current = {
    readGeneration: () => record,
  };
};

const fractionGate = (draft: unknown) => {
  return snapshotArtifactGateResult(
    gateArtifact({ kind: "fraction", draft: draft as never })
  );
};

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

describe("fractions-v2 preview negotiation", () => {
  const fractionDraft = {
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
  };

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
    fractionDraft,
    gate: fractionGate(fractionDraft),
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
    const brokenDraft = { variants: [] };
    persistenceState.current = {
      readGeneration: () => {
        return {
          ...fractionRecord,
          fractionDraft: brokenDraft,
          gate: fractionGate(brokenDraft),
        };
      },
    };

    const response = await handleLessonPreviewRequest(
      fractionRequest("fractions-v2")
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "PREVIEW_BLOCKED",
      verdict: "hard_block",
      recovery: "edit",
    });
  });
});

describe("safety-gate preview enforcement", () => {
  let acceptedRecord: LessonGenerationRecord;

  beforeAll(async () => {
    const persistence = await prepareOwnedDraft();
    const stored = await persistence.readGeneration(
      owningTeacher.tenantId,
      draftRequestId
    );
    if (!stored?.draft || !stored.gate) {
      throw new Error("The preview fixture must carry a gated draft.");
    }
    acceptedRecord = stored;
  });

  beforeEach(() => {
    sessionState.resolution = activeSession(owningTeacher);
  });

  it("parses the refusal payload before sending it", () => {
    const finding = {
      validator: "structural",
      validatorVersion: "lesson-validator-v2",
      verdict: "hard_block",
      code: "DUPLICATE_ID",
      field: "variants",
      reason: "Variant identifiers must be unique.",
      recovery: "edit",
    };
    const payload = {
      code: "PREVIEW_BLOCKED",
      message: "This draft could not be rendered safely.",
      verdict: "hard_block",
      findings: [finding],
      recovery: "edit",
    };

    expect(previewRefusalSchema.parse(payload)).toStrictEqual(payload);
    expect(
      previewRefusalSchema.safeParse({
        ...payload,
        findings: [{ ...finding, rawProviderPayload: "secret" }],
      }).success
    ).toBeFalsy();
    expect(
      previewRefusalSchema.safeParse({ ...payload, recovery: "ignore" }).success
    ).toBeFalsy();
  });

  it("re-derives the gate and streams a pass or warning artifact", async () => {
    useRecord(acceptedRecord);

    const { body, response } = await requestOwnedPreview();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body.match(/event: a2ui/gu)).toHaveLength(12);
  });

  it("keeps a warning snapshot renderable", async () => {
    const warning = structuredClone(acceptedRecord);
    if (!warning.draft) {
      throw new Error("The preview fixture must carry a draft.");
    }
    warning.gate = snapshotArtifactGateResult(
      gateArtifact({
        kind: "lesson",
        draft: { variants: warning.draft.variants },
        learningPath: warning.draft.learningPath,
        structuralDiagnostics: [
          {
            severity: "warning",
            code: "CONTENT_TOO_LONG",
            message: "The instructions are longer than the advisory limit.",
            field: "instructions",
          },
        ],
      })
    );

    expect(warning.gate.verdict).toBe("warning");

    useRecord(warning);

    const { response } = await requestOwnedPreview();

    expect(response.status).toBe(200);
  });

  it("returns 422 with the verdict, findings, and recovery for a hard block", async () => {
    const corrupted = structuredClone(acceptedRecord);
    const [firstVariant, secondVariant] = corrupted.draft?.variants ?? [];
    if (!firstVariant || !secondVariant || !corrupted.draft) {
      throw new Error("The preview fixture must carry two variants.");
    }
    secondVariant.id = firstVariant.id;

    const derived = deriveStoredArtifactGate(corrupted);

    expect(derived.verdict).toBe("hard_block");

    corrupted.gate = {
      verdict: "pass",
      recovery: null,
      policyVersion: derived.policyVersion,
      artifactHash: derived.artifactHash,
      findings: [],
    };
    useRecord(corrupted);

    const response = await handleLessonPreviewRequest(
      previewRequest("edu_canvas_session=owner-credential")
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toMatchObject({
      code: "PREVIEW_BLOCKED",
      verdict: "hard_block",
      recovery: "edit",
      findings: expect.arrayContaining([
        expect.objectContaining({ code: "DUPLICATE_ID" }),
      ]),
    });
    expect(JSON.stringify(body)).not.toContain("event: a2ui");
  });

  it("refuses a missing snapshot", async () => {
    const withoutSnapshot = { ...acceptedRecord };
    delete withoutSnapshot.gate;
    useRecord(withoutSnapshot);

    const response = await handleLessonPreviewRequest(
      previewRequest("edu_canvas_session=owner-credential")
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "GATE_SNAPSHOT_MISSING",
      recovery: "retry",
    });
  });

  it("refuses a stale artifact hash and names the re-derivation", async () => {
    const stale = structuredClone(acceptedRecord);
    const firstVariant = stale.draft?.variants[0];
    if (!firstVariant) {
      throw new Error("The preview fixture must carry a variant.");
    }
    firstVariant.title = `${firstVariant.title} (edited)`;
    useRecord(stale);

    const response = await handleLessonPreviewRequest(
      previewRequest("edu_canvas_session=owner-credential")
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      code: "GATE_SNAPSHOT_STALE",
      recovery: "retry",
    });
    expect(body.message).toContain("Re-derive");
  });

  it("refuses a snapshot minted under another policy version", async () => {
    const stale = structuredClone(acceptedRecord);
    if (!stale.gate) {
      throw new Error("The preview fixture must carry a gate snapshot.");
    }
    stale.gate.policyVersion = "artifact-gate-policy-v0";
    useRecord(stale);

    const response = await handleLessonPreviewRequest(
      previewRequest("edu_canvas_session=owner-credential")
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "GATE_SNAPSHOT_STALE",
    });
  });

  it("fails closed with 503 when the gate throws", async () => {
    const crashing = {
      ...acceptedRecord,
      get gate(): never {
        throw new Error("The gate crashed.");
      },
    };
    useRecord(crashing);

    const response = await handleLessonPreviewRequest(
      previewRequest("edu_canvas_session=owner-credential")
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toContain("PREVIEW_UNAVAILABLE");
    expect(body).not.toContain("event: a2ui");
  });

  it("is idempotent across duplicate preview requests", async () => {
    useRecord(acceptedRecord);
    const before = structuredClone(acceptedRecord);

    const first = await requestOwnedPreview();
    const second = await requestOwnedPreview();

    expect(second.response.status).toBe(first.response.status);
    expect(second.body).toBe(first.body);
    expect(acceptedRecord).toStrictEqual(before);
  });
});
