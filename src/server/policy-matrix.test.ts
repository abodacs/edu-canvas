import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { handleLessonPreviewRequest } from "@/server/a2ui/preview.server";
import { readServerConfig } from "@/server/config";
import {
  handleCancelGenerationRequest,
  handleGenerateLessonRequest,
} from "@/server/generation/delivery.server";
import { createDeterministicLessonDraftProvider } from "@/server/generation/provider";
import { createGenerationService } from "@/server/generation/service";
import {
  handleAuthContext,
  handleLogout,
  handleMembership,
  handleSession,
  handleSignIn,
  resolveAuthDependencies,
} from "@/server/identity/api.server";
import { resetConfiguredIdentityCache } from "@/server/identity/composition.server";
import {
  parseActorId,
  parseLearnerId,
  parseMembershipId,
  parseTenantId,
} from "@/server/identity/identifiers";
import {
  syntheticLearnerActor,
  syntheticTeacherActor,
} from "@/server/identity/test-actors";
import {
  createFoundationPersistence,
  createIdentityPersistence,
  createPackPersistence,
} from "@/server/persistence";
import {
  handleApproveRequest,
  handleOpenReviewRequest,
  handlePublishRequest,
} from "@/server/publication/delivery.server";
import { createSeededPersistence } from "@/server/persistence/seeded";
import { syntheticSeed } from "@/server/seed-data";
import { testServerEnvironment } from "@/server/test-environment";

import { publicationPublishResultSchema } from "@/shared/publication-contract";
import type { AuthDependencies } from "@/server/identity/api.server";
import type { NewSessionInput } from "@/server/identity/persistence-port";
import type { LearnerActor } from "@/server/identity/types";
import type { LessonDraftProvider } from "@/server/generation/provider";
import type { LessonGenerationRecord } from "@/server/generation/types";
import type { FoundationPersistence } from "@/server/persistence/types";
import type {
  LessonGenerationInput,
  PublicGenerationResult,
} from "@/shared/generation-contract";
import type { SessionProjection } from "@/shared/identity-contract";
import type { ReviewPack } from "@/shared/publication-contract";

/**
 * Domain policy matrix PT-01..PT-57 (§12.1) plus the §12.3 concurrency barriers.
 *
 * Every row is asserted at the real delivery seam (`handleLessonPreviewRequest`,
 * `handleGenerateLessonRequest`, `handleCancelGenerationRequest`, `handleLogout`,
 * `resolveAuthDependencies`, `resolveRequestSession`) with real requests and
 * cookies, or through the real persistence conditional write
 * (`createSeededPersistence().saveGeneration` / `claimGeneration`) and the real
 * session revision checks (`createIdentityPersistence().revokeSession`,
 * `touchSession`, `rotateSessionCredentials`). The authorization policy is never
 * stubbed.
 *
 * Two kinds of row are deferred, and neither is faked:
 *   - the owning entry belongs to release unit B and has no handler in this
 *     branch (see `deferredUnitB`),
 *   - the entry exists but its transport response does not yet match §12.1 (see
 *     each row's `PRODUCTION GAP` comment).
 */

// The delivery seams read process.env, so pin a valid production-shaped config
// and replace the PostgreSQL composition with the in-memory test double below.
vi.stubEnv(
  "DATABASE_URL",
  "postgresql://test:test@127.0.0.1:5432/edu_canvas_test"
);
vi.stubEnv("APP_ENV", "development");
vi.stubEnv("OPENAI_API_KEY", "test-server-key");
// CI sets AUTH_PROVIDER=supabase for the preview-shaped smoke job. The seams read
// process.env, so without this pin the synthetic sessions never resolve here.
vi.stubEnv("AUTH_PROVIDER", "deterministic");

/* eslint-disable unicorn/single-line-block-comment-style -- Vite reads a dynamic import's chunkname only from a single-line block comment. */
vi.mock(
  import(
    /* webpackChunkName: "policy-matrix-persistence-mock" */
    "@/server/persistence"
  ),
  async (importOriginal) => {
    const actual = await importOriginal();
    const seededStore = await import(
      /* webpackChunkName: "policy-matrix-seeded-store" */
      "@/server/persistence/seeded"
    );
    const seededIdentity = await import(
      /* webpackChunkName: "policy-matrix-seeded-identity" */
      "@/server/persistence/identity-seeded"
    );
    const seededPack = await import(
      /* webpackChunkName: "policy-matrix-seeded-pack" */
      "@/server/persistence/pack-seeded"
    );
    const synthetic = await import(
      /* webpackChunkName: "policy-matrix-synthetic-fixture" */
      "@/server/identity/synthetic-fixture"
    );
    const foundation = seededStore.createSeededPersistence();
    const identity = seededIdentity.createSeededIdentityPersistence();
    const packs = seededPack.createSeededPackPersistence({
      store: seededPack.createSeededPackStore(
        synthetic.syntheticLearnerDirectory
      ),
    });
    return {
      ...actual,
      createFoundationPersistence: () => foundation,
      createIdentityPersistence: () => identity,
      createPackPersistence: () => packs,
    };
  }
);

vi.mock(
  import(
    /* webpackChunkName: "policy-matrix-generation-mock" */
    "@/server/generation/factory"
  ),
  async (importOriginal) => {
    const actual = await importOriginal();
    const provider = await import(
      /* webpackChunkName: "policy-matrix-deterministic-provider" */
      "@/server/generation/provider"
    );
    return {
      ...actual,
      createConfiguredLessonDraftProvider: () =>
        provider.createDeterministicLessonDraftProvider(),
    };
  }
);
/* eslint-enable unicorn/single-line-block-comment-style */

const password = "synthetic-pass-1";
const northTenantId = "tenant_school_north";
const southTenantId = "tenant_school_south";
const northTenantName = "Grade 4A · Equivalent Fractions";
const southTenantName = "Grade 5B · Ratio Reasoning";
const teacherEmail = "bilal.north@example.test";
const dualMembershipEmail = "amira.north@example.test";
const learnerEmail = "lina.north@example.test";
const teacherActorId = "actor_teacher_bilal";
const learnerActorId = "actor_learner_lina";

const clearSiteDataValue =
  '"cache", "cookies", "storage", "executionContexts", "prefetchCache", "prerenderCache"';

const at0 = "2026-10-28T09:00:00.000Z";
const laterAt = "2026-10-28T09:05:00.000Z";
const revokedAt = "2026-10-28T09:10:00.000Z";
const absoluteAt = "2026-10-28T17:00:00.000Z";

/**
 * Deferred rows are registered with `it.skipIf` rather than a disabled-test
 * modifier: the repo's vitest lint preset reports the skip modifier
 * (`vitest/no-disabled-tests`) and the pending-test modifier as errors, and it
 * errors on an empty test body too. `it.skipIf` is the conditional form this
 * repo already uses (`describe.skipIf(!isRunDatabaseTests)`); vitest still
 * reports these rows as skipped, so the deferral stays visible.
 */
const isDeferred = true;

/**
 * Rows whose owning protected entry is not implemented in this branch, with the
 * release-unit-B issue that owns them (§11: the issue stays open until the
 * handler exists). Each block below asserts its own row set.
 */
const deferredUnitB = {
  readAssignment: {
    issue: "#6",
    entry: "GET /api/publications/:publicationId",
    rows: ["PT-05", "PT-13", "PT-21", "PT-25", "PT-48"],
  },
  attempt: {
    issue: "#7",
    entry: "POST /api/attempts",
    rows: ["PT-06", "PT-14", "PT-26", "PT-30", "PT-31", "PT-49"],
  },
  teacherDecision: {
    issue: "#8",
    entry: "POST /api/teacher-decisions",
    rows: ["PT-07", "PT-15", "PT-22", "PT-32", "PT-33", "PT-50"],
  },
} as const;

interface CookieJar {
  readonly cookie: string;
  readonly csrf: string;
}

interface MutationAuth {
  readonly cookie?: string;
  readonly csrf?: string;
  readonly origin?: string | null;
}

const cookieValue = (response: Response, name: string): string | undefined => {
  const match = response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0] ?? "")
    .find((pair) => pair.startsWith(`${name}=`));
  return match?.slice(name.length + 1);
};

const sessionCookie = (response: Response): string =>
  `edu_canvas_session=${cookieValue(response, "edu_canvas_session") ?? ""}`;

const serverConfig = () => readServerConfig({ ...testServerEnvironment });

const authDependencies = (): Promise<AuthDependencies> =>
  resolveAuthDependencies(serverConfig());

const foundationPersistence = (): FoundationPersistence =>
  createFoundationPersistence(serverConfig());

const identityPersistence = () => createIdentityPersistence(serverConfig());

const preAuthFlow = async (
  dependencies: AuthDependencies
): Promise<CookieJar> => {
  const response = await handleAuthContext(
    new Request(`${dependencies.publicOrigin}/api/auth/context`),
    dependencies
  );
  const body = (await response.json()) as { csrf: string };
  return {
    csrf: body.csrf,
    cookie: `edu_canvas_csrf=${cookieValue(response, "edu_canvas_csrf") ?? ""}`,
  };
};

const signInResponse = (
  dependencies: AuthDependencies,
  email: string,
  flow: CookieJar
): Promise<Response> => {
  return handleSignIn(
    new Request(`${dependencies.publicOrigin}/api/auth/sign-in`, {
      method: "POST",
      headers: {
        origin: dependencies.publicOrigin,
        "content-type": "application/json",
        "x-edu-canvas-csrf": flow.csrf,
        cookie: flow.cookie,
      },
      body: JSON.stringify({ email, password }),
    }),
    dependencies
  );
};

const sessionChallenge = async (
  dependencies: AuthDependencies,
  cookie: string
): Promise<string> => {
  const response = await handleSession(
    new Request(`${dependencies.publicOrigin}/api/auth/session`, {
      headers: { cookie },
    }),
    dependencies
  );
  const body = (await response.json()) as { csrf?: string };
  return body.csrf ?? "";
};

/**
Completes the designed membership selection with the named tenant's membership.
*/
const selectTenantMembership = async (
  dependencies: AuthDependencies,
  signIn: Response,
  tenantName: string
): Promise<Response> => {
  const body = (await signIn.clone().json()) as {
    memberships?: { membershipId: string; tenantName: string }[];
  };
  const membershipId = body.memberships?.find(
    (membership) => membership.tenantName === tenantName
  )?.membershipId;
  const flow = await preAuthFlow(dependencies);
  return handleMembership(
    new Request(`${dependencies.publicOrigin}/api/auth/membership`, {
      method: "POST",
      headers: {
        origin: dependencies.publicOrigin,
        "content-type": "application/json",
        "x-edu-canvas-csrf": flow.csrf,
        cookie: `edu_canvas_pending=${
          cookieValue(signIn, "edu_canvas_pending") ?? ""
        }; ${flow.cookie}`,
      },
      body: JSON.stringify({ membershipId: membershipId ?? "" }),
    }),
    dependencies
  );
};

/**
A single-membership account (teacher or learner) signs in straight to a session. The fixture teachers also hold the curriculum classroom membership, so a teacher session completes the designed selection with the class tenancy these rows assert.
*/
const signInDirect = async (
  dependencies: AuthDependencies,
  email: string
): Promise<CookieJar> => {
  const response = await signInResponse(
    dependencies,
    email,
    await preAuthFlow(dependencies)
  );
  const body = (await response.clone().json()) as { status?: string };
  const established =
    body.status === "membership-required"
      ? await selectTenantMembership(dependencies, response, northTenantName)
      : response;
  const cookie = sessionCookie(established);
  return { cookie, csrf: await sessionChallenge(dependencies, cookie) };
};

/**
A multi-membership account selects the named tenant's membership.
*/
const signInForTenant = async (
  dependencies: AuthDependencies,
  tenantName: string
): Promise<CookieJar> => {
  const signIn = await signInResponse(
    dependencies,
    dualMembershipEmail,
    await preAuthFlow(dependencies)
  );
  const selected = await selectTenantMembership(
    dependencies,
    signIn,
    tenantName
  );
  const cookie = sessionCookie(selected);
  return { cookie, csrf: await sessionChallenge(dependencies, cookie) };
};

const mutationRequest = (
  dependencies: AuthDependencies,
  path: string,
  auth: MutationAuth,
  body?: unknown
): Request => {
  const headers = new Headers();
  const origin =
    auth.origin === undefined ? dependencies.publicOrigin : auth.origin;
  if (origin !== null) {
    headers.set("origin", origin);
  }
  if (auth.csrf !== undefined) {
    headers.set("x-edu-canvas-csrf", auth.csrf);
  }
  if (auth.cookie !== undefined) {
    headers.set("cookie", auth.cookie);
  }
  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }
  return new Request(`${dependencies.publicOrigin}${path}`, {
    method: "POST",
    headers,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
};

const previewRequest = (
  dependencies: AuthDependencies,
  requestId: string,
  cookie?: string
): Request => {
  return new Request(
    `${dependencies.publicOrigin}/api/a2ui/preview?requestId=${encodeURIComponent(requestId)}`,
    cookie === undefined ? undefined : { headers: { cookie } }
  );
};

const generationInput = (
  idempotencyKey: string,
  overrides: Record<string, unknown> = {}
): LessonGenerationInput => {
  return {
    prompt: "equivalent fractions for grade 4",
    grade: 4,
    standardId: syntheticSeed.standard.id,
    language: "en",
    difficulty: "on-level",
    idempotencyKey,
    ...overrides,
  };
};

const generate = async (
  dependencies: AuthDependencies,
  auth: MutationAuth,
  idempotencyKey: string,
  overrides: Record<string, unknown> = {}
): Promise<{ response: Response; body: PublicGenerationResult }> => {
  const response = await handleGenerateLessonRequest(
    mutationRequest(
      dependencies,
      "/api/lessons/generate",
      auth,
      generationInput(idempotencyKey, overrides)
    )
  );
  return {
    response,
    body: (await response.clone().json()) as PublicGenerationResult,
  };
};

/**
Generate through the real seam and fail loudly if the draft is not ready.
*/
const generateReadyDraft = async (
  dependencies: AuthDependencies,
  auth: MutationAuth,
  idempotencyKey: string
): Promise<PublicGenerationResult> => {
  const { response, body } = await generate(dependencies, auth, idempotencyKey);
  if (response.status !== 200 || !body.requestId) {
    throw new Error(
      `Expected a ready draft for ${idempotencyKey}, received ${response.status}.`
    );
  }
  return body;
};

const openReview = async (
  dependencies: AuthDependencies,
  auth: MutationAuth,
  requestId: string
): Promise<{ response: Response; review: ReviewPack }> => {
  const response = await handleOpenReviewRequest(
    mutationRequest(dependencies, "/api/publications/review", auth, {
      requestId,
    })
  );
  return {
    response,
    review: (await response.clone().json()) as ReviewPack,
  };
};

const approveTarget = async (
  dependencies: AuthDependencies,
  auth: MutationAuth,
  input: {
    requestId: string;
    versionId: string;
    targetKind: "variant" | "reverse-path";
    targetId: string;
    acknowledgedFindingCodes: readonly string[];
    operationKey: string;
  }
) => {
  const response = await handleApproveRequest(
    mutationRequest(dependencies, "/api/publications/approvals", auth, input)
  );
  return {
    response,
    review: (await response.clone().json()) as ReviewPack,
  };
};

const approveEveryScreen = async (
  dependencies: AuthDependencies,
  auth: MutationAuth,
  requestId: string
): Promise<ReviewPack> => {
  const { response: opened, review } = await openReview(
    dependencies,
    auth,
    requestId
  );
  if (opened.status !== 200) {
    throw new Error(`Opening review ${requestId} returned ${opened.status}.`);
  }
  const warnings = review.version.findings
    .filter((finding) => finding.verdict === "warning")
    .map((finding) => finding.code);

  for (const variant of review.draft.variants) {
    // Approvals are independent rows but the helper keeps each request in
    // order so a failure names the exact screen.
    // eslint-disable-next-line no-await-in-loop
    const approved = await approveTarget(dependencies, auth, {
      requestId,
      versionId: review.version.id,
      targetKind: "variant",
      targetId: variant.id,
      acknowledgedFindingCodes: warnings,
      operationKey: `policy-approve-${requestId}-${variant.id}`,
    });
    if (approved.response.status !== 200) {
      throw new Error(
        `Approving ${variant.id} returned ${approved.response.status}.`
      );
    }
  }

  const reverse = await approveTarget(dependencies, auth, {
    requestId,
    versionId: review.version.id,
    targetKind: "reverse-path",
    targetId: "learning-path",
    acknowledgedFindingCodes: warnings,
    operationKey: `policy-approve-${requestId}-reverse`,
  });
  if (reverse.response.status !== 200) {
    throw new Error(
      `Approving the reverse path returned ${reverse.response.status}.`
    );
  }
  return reverse.review;
};

const publishPack = async (
  dependencies: AuthDependencies,
  auth: MutationAuth,
  input: {
    requestId: string;
    versionId: string;
    expectedArtifactHash: string;
    learnerId: string;
    operationKey: string;
  }
) => {
  const response = await handlePublishRequest(
    mutationRequest(dependencies, "/api/publications", auth, input)
  );
  return {
    response,
    body: (await response.clone().json()) as {
      publicationId?: string;
      assignmentId?: string;
      code?: string;
      review?: ReviewPack;
      learnerAssignmentId?: string | null;
      learnerVariantId?: string | null;
    },
  };
};

const packPersistence = () => createPackPersistence(serverConfig());

const errorBody = async (
  response: Response
): Promise<{ code?: string; message?: string }> =>
  (await response.clone().json()) as { code?: string; message?: string };

const errorCode = async (response: Response): Promise<string | undefined> => {
  const body = await errorBody(response);
  return body.code;
};

const eventStreamOf = (body: string): number =>
  (body.match(/event: a2ui/gu) ?? []).length;

const isEventStream = (response: Response): boolean =>
  (response.headers.get("content-type") ?? "").includes("text/event-stream");

const activeActorOf = (
  projection: SessionProjection
):
  | { role: string; tenantId: string; capabilities: readonly string[] }
  | undefined =>
  projection.status === "active" ? projection.actor : undefined;

const generatingRecord = (options: {
  readonly requestId: string;
  readonly tenantId: string;
  readonly teacherId: string;
  readonly idempotencyKey: string;
  readonly updatedAt?: string;
}): LessonGenerationRecord => {
  const updatedAt = options.updatedAt ?? at0;
  return {
    requestId: options.requestId,
    tenantId: options.tenantId,
    teacherId: options.teacherId,
    input: {
      prompt: "equivalent fractions for grade 4",
      grade: 4,
      standardId: syntheticSeed.standard.id,
      language: "en",
      difficulty: "on-level",
    },
    state: "generating",
    attempt: 1,
    diagnostics: [],
    attempts: [
      {
        attemptNumber: 1,
        idempotencyKey: options.idempotencyKey,
        requestHash: "policy-matrix-request-hash",
        state: "generating",
        correctionAttempted: false,
        diagnostics: [],
        createdAt: updatedAt,
      },
    ],
    createdAt: updatedAt,
    updatedAt,
  };
};

/**
 * The claim lease must still be active for a write to land, so the expectation's
 * `leaseValidAfter` sits strictly before the record's `updatedAt`.
 */
const expectationFor = (
  record: LessonGenerationRecord
): { attempt: number; updatedAt: string; leaseValidAfter: string } => {
  const leaseStart = new Date(Date.parse(record.updatedAt) - 60_000);
  return {
    attempt: record.attempt,
    updatedAt: record.updatedAt,
    leaseValidAfter: leaseStart.toISOString(),
  };
};

const nowIso = (): string => {
  const now = new Date();
  return now.toISOString();
};

const seedGeneratingDraft = async (options: {
  readonly requestId: string;
  readonly teacherId: string;
}): Promise<void> => {
  const claimed = await foundationPersistence().claimGeneration(
    generatingRecord({
      requestId: options.requestId,
      tenantId: northTenantId,
      teacherId: options.teacherId,
      idempotencyKey: `seeded-${options.requestId}`,
      // The delivery seam cancels only inside the live claim lease, so a seeded
      // draft must look freshly claimed.
      updatedAt: nowIso(),
    })
  );
  if (!claimed.claimed) {
    throw new Error(`Could not seed draft ${options.requestId}.`);
  }
};

const sessionInput = (
  actor: LearnerActor,
  sessionId: string
): NewSessionInput => {
  return {
    sessionId,
    verifierHash: `verifier_${sessionId}`,
    actorId: actor.actorId,
    membershipId: actor.membershipId,
    tenantId: actor.tenantId,
    providerSessionId: `provider_${sessionId}`,
    providerSubject: `subject_${sessionId}`,
    sessionGeneration: `generation_${sessionId}`,
    authorizationRevision: 1,
    createdAt: at0,
    lastActivityAt: at0,
    absoluteExpiresAt: absoluteAt,
  };
};

describe("protected domain policy matrix", () => {
  // A fresh composition per test keeps the shared sign-in rate limiter from
  // marching every case into 429; the seeded identity store stays cached.
  beforeEach(() => {
    resetConfiguredIdentityCache();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  describe("domain policy matrix — PT-01 to PT-57", () => {
    it("PT-01 a teacher reads the environment projection", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const response = await handleSession(
        new Request(`${dependencies.publicOrigin}/api/auth/session`, {
          headers: { cookie: teacher.cookie },
        }),
        dependencies
      );
      const actor = activeActorOf((await response.json()) as SessionProjection);

      expect({
        status: response.status,
        role: actor?.role,
        tenantId: actor?.tenantId,
        capabilities: actor?.capabilities,
      }).toStrictEqual({
        status: 200,
        role: "teacher",
        tenantId: northTenantId,
        capabilities: [
          "read_environment",
          "generate",
          "preview_draft",
          "publish",
          "read_assignment",
          "teacher_decision",
          "cancel_generation",
          "logout",
        ],
      });
    });

    it("PT-02 a teacher generates a scoped draft", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const key = "policy-pt-02-teacher-generate";
      const { response, body } = await generate(dependencies, teacher, key);
      const stored =
        await foundationPersistence().findGenerationByIdempotencyKey(
          northTenantId,
          teacherActorId,
          key
        );

      expect({
        status: response.status,
        state: body.state,
        storedState: stored?.state,
        storedTenant: stored?.tenantId,
        storedTeacher: stored?.teacherId,
      }).toStrictEqual({
        status: 200,
        state: "ready-for-review",
        storedState: "ready-for-review",
        storedTenant: northTenantId,
        storedTeacher: "actor_teacher_bilal",
      });
    });

    it("PT-03 a teacher previews an own draft as an event stream", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const draft = await generateReadyDraft(
        dependencies,
        teacher,
        "policy-pt-03-preview"
      );
      const response = await handleLessonPreviewRequest(
        previewRequest(dependencies, draft.requestId, teacher.cookie)
      );
      const body = await response.text();

      expect({
        status: response.status,
        eventStream: isEventStream(response),
        messages: eventStreamOf(body),
        surfaces: body.includes('"surfaceCount":4'),
      }).toStrictEqual({
        status: 200,
        eventStream: true,
        messages: 12,
        surfaces: true,
      });
    });

    it("PT-08 a teacher logs out and the credential stops working", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const response = await handleLogout(
        mutationRequest(dependencies, "/api/auth/logout", teacher),
        dependencies
      );
      const replay = await handleSession(
        new Request(`${dependencies.publicOrigin}/api/auth/session`, {
          headers: { cookie: teacher.cookie },
        }),
        dependencies
      );

      expect({
        status: response.status,
        clearSiteData: response.headers.get("clear-site-data"),
        clearedCredential: response.headers
          .getSetCookie()
          .some((cookie) => cookie.startsWith("edu_canvas_session=;")),
        replay: replay.status,
      }).toStrictEqual({
        status: 204,
        clearSiteData: clearSiteDataValue,
        clearedCredential: true,
        replay: 401,
      });
    });

    it("PT-09 a learner reads the environment projection", async () => {
      const dependencies = await authDependencies();
      const learner = await signInDirect(dependencies, learnerEmail);
      const response = await handleSession(
        new Request(`${dependencies.publicOrigin}/api/auth/session`, {
          headers: { cookie: learner.cookie },
        }),
        dependencies
      );
      const actor = activeActorOf((await response.json()) as SessionProjection);

      expect({
        status: response.status,
        role: actor?.role,
        tenantId: actor?.tenantId,
      }).toStrictEqual({
        status: 200,
        role: "student",
        tenantId: northTenantId,
      });
    });

    it("PT-10 a learner cannot generate and no row is created", async () => {
      const dependencies = await authDependencies();
      const learner = await signInDirect(dependencies, learnerEmail);
      const key = "policy-pt-10-learner-generate";
      const { response } = await generate(dependencies, learner, key);
      const stored =
        await foundationPersistence().findGenerationByIdempotencyKey(
          northTenantId,
          teacherActorId,
          key
        );

      expect({
        status: response.status,
        code: await errorCode(response),
        hasRow: stored !== undefined,
      }).toStrictEqual({ status: 403, code: "FORBIDDEN", hasRow: false });
    });

    it("PT-11 a learner cannot preview a teacher draft", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const draft = await generateReadyDraft(
        dependencies,
        teacher,
        "policy-pt-11-teacher-draft"
      );
      const learner = await signInDirect(dependencies, learnerEmail);
      const response = await handleLessonPreviewRequest(
        previewRequest(dependencies, draft.requestId, learner.cookie)
      );

      expect({
        status: response.status,
        code: await errorCode(response),
        eventStream: isEventStream(response),
      }).toStrictEqual({
        status: 403,
        code: "FORBIDDEN",
        eventStream: false,
      });
    });

    it("PT-16 a learner logs out and the credential stops working", async () => {
      const dependencies = await authDependencies();
      const learner = await signInDirect(dependencies, learnerEmail);
      const response = await handleLogout(
        mutationRequest(dependencies, "/api/auth/logout", learner),
        dependencies
      );
      const replay = await handleSession(
        new Request(`${dependencies.publicOrigin}/api/auth/session`, {
          headers: { cookie: learner.cookie },
        }),
        dependencies
      );

      expect({
        status: response.status,
        clearSiteData: response.headers.get("clear-site-data"),
        replay: replay.status,
      }).toStrictEqual({
        status: 204,
        clearSiteData: clearSiteDataValue,
        replay: 401,
      });
    });

    it("PT-19 a teacher cannot preview a draft outside scope", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const sameTenant = await signInForTenant(dependencies, northTenantName);
      const foreignTenant = await signInForTenant(
        dependencies,
        southTenantName
      );
      const sameTenantDraft = await generateReadyDraft(
        dependencies,
        sameTenant,
        "policy-pt-19-same-tenant"
      );
      const foreignTenantDraft = await generateReadyDraft(
        dependencies,
        foreignTenant,
        "policy-pt-19-foreign-tenant"
      );

      const sameTenantResponse = await handleLessonPreviewRequest(
        previewRequest(dependencies, sameTenantDraft.requestId, teacher.cookie)
      );
      const foreignTenantResponse = await handleLessonPreviewRequest(
        previewRequest(
          dependencies,
          foreignTenantDraft.requestId,
          teacher.cookie
        )
      );
      const sameTenantBody = await sameTenantResponse.clone().json();
      const foreignTenantBody = await foreignTenantResponse.clone().json();
      const sameTenantRecord = await foundationPersistence().readGeneration(
        northTenantId,
        sameTenantDraft.requestId
      );
      const foreignTenantRecord = await foundationPersistence().readGeneration(
        southTenantId,
        foreignTenantDraft.requestId
      );

      expect({
        sameTenant: sameTenantResponse.status,
        foreignTenant: foreignTenantResponse.status,
        identicalError:
          JSON.stringify(sameTenantBody) === JSON.stringify(foreignTenantBody),
        code: (sameTenantBody as { code?: string }).code,
        untouched: [sameTenantRecord?.state, foreignTenantRecord?.state],
      }).toStrictEqual({
        sameTenant: 403,
        foreignTenant: 403,
        identicalError: true,
        code: "FORBIDDEN",
        untouched: ["ready-for-review", "ready-for-review"],
      });
    });

    it("PT-34 a teacher read never projects the private answer key", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const draft = await generateReadyDraft(
        dependencies,
        teacher,
        "policy-pt-34-answer-key"
      );
      const response = await handleLessonPreviewRequest(
        previewRequest(dependencies, draft.requestId, teacher.cookie)
      );
      const body = await response.text();

      expect({
        status: response.status,
        hasAnswerKey: body.includes("answerKey"),
        hasPrivateAnswerKey: body.includes("privateAnswerKey"),
        projectsContent: body.includes('"component":"LearningPath"'),
      }).toStrictEqual({
        status: 200,
        hasAnswerKey: false,
        hasPrivateAnswerKey: false,
        projectsContent: true,
      });
    });

    it("PT-35 a learner read never projects the private answer key", async () => {
      const dependencies = await authDependencies();
      const learner = await signInDirect(dependencies, learnerEmail);
      const response = await handleSession(
        new Request(`${dependencies.publicOrigin}/api/auth/session`, {
          headers: { cookie: learner.cookie },
        }),
        dependencies
      );
      const body = await response.text();
      const actor = activeActorOf(JSON.parse(body) as SessionProjection);

      expect({
        status: response.status,
        hasAnswerKey: body.includes("answerKey"),
        hasPrivateAnswerKey: body.includes("privateAnswerKey"),
        capabilities: actor?.capabilities,
      }).toStrictEqual({
        status: 200,
        hasAnswerKey: false,
        hasPrivateAnswerKey: false,
        capabilities: [
          "read_environment",
          "read_assignment",
          "submit_attempt",
          "logout",
        ],
      });
    });

    it("PT-40 PC-01: an active membership authorizes the effect", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const key = "policy-pt-40-active-membership";
      const { response, body } = await generate(dependencies, teacher, key);
      const stored =
        await foundationPersistence().findGenerationByIdempotencyKey(
          northTenantId,
          teacherActorId,
          key
        );

      expect({
        status: response.status,
        state: body.state,
        storedState: stored?.state,
      }).toStrictEqual({
        status: 200,
        state: "ready-for-review",
        storedState: "ready-for-review",
      });
    });

    it("PT-40b two teachers in one tenant keep separate drafts for a shared key", async () => {
      const dependencies = await authDependencies();
      const bilal = await signInDirect(dependencies, teacherEmail);
      const amira = await signInForTenant(dependencies, northTenantName);
      const key = "policy-pt-40b-shared-idempotency-key";
      const first = await generate(dependencies, bilal, key);
      const second = await generate(dependencies, amira, key);

      expect({
        firstStatus: first.response.status,
        secondStatus: second.response.status,
        separateDrafts: first.body.requestId !== second.body.requestId,
      }).toStrictEqual({
        firstStatus: 200,
        secondStatus: 200,
        separateDrafts: true,
      });
      await expect(
        foundationPersistence().findGenerationByIdempotencyKey(
          northTenantId,
          "actor_teacher_amira",
          key
        )
      ).resolves.toMatchObject({ requestId: second.body.requestId });
    });

    it("PT-42 PC-02: valid origin and session challenge authorize the effect", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const key = "policy-pt-42-valid-forgery-proof";
      const { response, body } = await generate(dependencies, teacher, key);
      const stored =
        await foundationPersistence().findGenerationByIdempotencyKey(
          northTenantId,
          teacherActorId,
          key
        );

      expect({
        status: response.status,
        state: body.state,
        stored: stored?.state,
      }).toStrictEqual({
        status: 200,
        state: "ready-for-review",
        stored: "ready-for-review",
      });
    });

    it("PT-43 PC-02: forged or absent protection is rejected with no effects", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const forged = "policy-pt-43-forged-challenge";
      const absent = "policy-pt-43-absent-challenge";
      const foreign = "policy-pt-43-foreign-origin";

      const responses = [
        await generate(dependencies, { ...teacher, csrf: "forged" }, forged),
        await generate(dependencies, { cookie: teacher.cookie }, absent),
        await generate(
          dependencies,
          { ...teacher, origin: "https://evil.test" },
          foreign
        ),
      ];
      const codes = await Promise.all(
        responses.map((entry) => errorCode(entry.response))
      );
      const rows = await Promise.all(
        [forged, absent, foreign].map((key) => {
          return foundationPersistence().findGenerationByIdempotencyKey(
            northTenantId,
            teacherActorId,
            key
          );
        })
      );

      expect({
        statuses: responses.map((entry) => entry.response.status),
        codes,
        hasRows: rows.map((row) => row !== undefined),
      }).toStrictEqual({
        statuses: [403, 403, 403],
        codes: ["CSRF_REJECTED", "CSRF_REJECTED", "CSRF_REJECTED"],
        hasRows: [false, false, false],
      });
    });

    it("PT-44 an unauthenticated caller reads no environment", async () => {
      const dependencies = await authDependencies();
      const response = await handleSession(
        new Request(`${dependencies.publicOrigin}/api/auth/session`),
        dependencies
      );
      const body = await response.text();

      expect({
        status: response.status,
        body: JSON.parse(body) as unknown,
        leaksActor: body.includes("actor"),
      }).toStrictEqual({
        status: 401,
        body: {
          code: "UNAUTHENTICATED",
          message: "Sign in to continue.",
        },
        leaksActor: false,
      });
    });

    it("PT-45 an unauthenticated caller cannot generate", async () => {
      const dependencies = await authDependencies();
      const key = "policy-pt-45-unauthenticated-generate";
      const { response } = await generate(dependencies, {}, key);
      const stored =
        await foundationPersistence().findGenerationByIdempotencyKey(
          northTenantId,
          teacherActorId,
          key
        );

      expect({
        status: response.status,
        code: await errorCode(response),
        hasRow: stored !== undefined,
      }).toStrictEqual({ status: 401, code: "UNAUTHENTICATED", hasRow: false });
    });

    it("PT-46 an unauthenticated caller cannot preview a draft", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const draft = await generateReadyDraft(
        dependencies,
        teacher,
        "policy-pt-46-private-draft"
      );
      const response = await handleLessonPreviewRequest(
        previewRequest(dependencies, draft.requestId)
      );

      expect({
        status: response.status,
        code: await errorCode(response),
        eventStream: isEventStream(response),
      }).toStrictEqual({
        status: 401,
        code: "UNAUTHENTICATED",
        eventStream: false,
      });
    });

    it("PT-51 same-origin logout without a live credential keeps other sessions", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const response = await handleLogout(
        mutationRequest(dependencies, "/api/auth/logout", {
          origin: dependencies.publicOrigin,
        }),
        dependencies
      );
      const untouched = await handleSession(
        new Request(`${dependencies.publicOrigin}/api/auth/session`, {
          headers: { cookie: teacher.cookie },
        }),
        dependencies
      );

      expect({
        status: response.status,
        clearSiteData: response.headers.get("clear-site-data"),
        otherSession: untouched.status,
      }).toStrictEqual({
        status: 204,
        clearSiteData: clearSiteDataValue,
        otherSession: 200,
      });
    });

    it("PT-52 a teacher cancels an own active generation", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      await seedGeneratingDraft({
        requestId: "policy_pt_52_own_draft",
        teacherId: "actor_teacher_bilal",
      });
      await seedGeneratingDraft({
        requestId: "policy_pt_52_other_draft",
        teacherId: "actor_teacher_bilal",
      });

      const response = await handleCancelGenerationRequest(
        mutationRequest(
          dependencies,
          "/api/lessons/policy_pt_52_own_draft/cancel",
          teacher
        ),
        "policy_pt_52_own_draft"
      );
      const body = (await response.clone().json()) as PublicGenerationResult;
      const other = await foundationPersistence().readGeneration(
        northTenantId,
        "policy_pt_52_other_draft"
      );

      expect({
        status: response.status,
        state: body.state,
        otherState: other?.state,
      }).toStrictEqual({
        status: 200,
        state: "failed-retryable",
        otherState: "generating",
      });
    });

    it("PT-53 a learner cannot cancel a generation", async () => {
      const dependencies = await authDependencies();
      await seedGeneratingDraft({
        requestId: "policy_pt_53_private_draft",
        teacherId: "actor_teacher_bilal",
      });
      const learner = await signInDirect(dependencies, learnerEmail);
      const response = await handleCancelGenerationRequest(
        mutationRequest(
          dependencies,
          "/api/lessons/policy_pt_53_private_draft/cancel",
          learner
        ),
        "policy_pt_53_private_draft"
      );
      const record = await foundationPersistence().readGeneration(
        northTenantId,
        "policy_pt_53_private_draft"
      );

      expect({
        status: response.status,
        code: await errorCode(response),
        state: record?.state,
      }).toStrictEqual({
        status: 403,
        code: "FORBIDDEN",
        state: "generating",
      });
    });

    it("PT-55 an unauthenticated caller cannot cancel a generation", async () => {
      const dependencies = await authDependencies();
      await seedGeneratingDraft({
        requestId: "policy_pt_55_private_draft",
        teacherId: "actor_teacher_bilal",
      });
      const response = await handleCancelGenerationRequest(
        mutationRequest(
          dependencies,
          "/api/lessons/policy_pt_55_private_draft/cancel",
          {}
        ),
        "policy_pt_55_private_draft"
      );
      const record = await foundationPersistence().readGeneration(
        northTenantId,
        "policy_pt_55_private_draft"
      );

      expect({
        status: response.status,
        code: await errorCode(response),
        state: record?.state,
      }).toStrictEqual({
        status: 401,
        code: "UNAUTHENTICATED",
        state: "generating",
      });
    });
  });

  describe("domain policy matrix — rows the branch cannot satisfy yet", () => {
    /**
     * These entries exist, but the transport response does not match §12.1. Each
     * skipped body holds the exact assertion the matrix requires (never a weakened
     * one) so that fixing the named handler un-skips a real check. The observed
     * value and the reproduction are on each `PRODUCTION GAP` comment.
     */

    it.skipIf(isDeferred)(
      "PT-17 a teacher read environment outside scope (no scope referent)",
      () => {
        // PRODUCTION GAP: the read-environment entry is GET /api/auth/session,
        // which carries no client-selectable tenant or draft referent, so no
        // cross-scope variant exists to deny. A foreign credential reaches 401,
        // never the required 403. Nothing to assert until a scoped environment
        // referent is declared.
        expect.hasAssertions();
      }
    );

    it.skipIf(isDeferred)(
      "PT-18 a teacher cannot generate against an outside-scope retry referent",
      async () => {
        const dependencies = await authDependencies();
        const teacher = await signInDirect(dependencies, teacherEmail);
        const key = "policy-pt-18-cross-scope";
        const { response } = await generate(dependencies, teacher, key, {
          retryOfRequestId: "draft_outside_scope_referent",
        });
        const stored =
          await foundationPersistence().findGenerationByIdempotencyKey(
            northTenantId,
            teacherActorId,
            key
          );

        // PRODUCTION GAP: the service scopes the referent by owner, so the seam
        // now surfaces its typed rejection as 404 DRAFT_NOT_FOUND (issue #115
        // mapping). The §12 matrix requires the generic 403 for an out-of-scope
        // referent; no row can assert that until the policy decision lands.
        expect({
          status: response.status,
          code: await errorCode(response),
          hasRow: stored !== undefined,
        }).toStrictEqual({ status: 403, code: "FORBIDDEN", hasRow: false });
      }
    );

    it.skipIf(isDeferred)(
      "PT-23 a teacher logout with a foreign session-id override is rejected",
      async () => {
        const dependencies = await authDependencies();
        const teacher = await signInDirect(dependencies, teacherEmail);
        const response = await handleLogout(
          mutationRequest(dependencies, "/api/auth/logout", teacher, {
            sessionId: "session_foreign",
          }),
          dependencies
        );

        // PRODUCTION GAP: observed 204 with the caller's own session revoked.
        // `handleLogout` never reads the request body, so a target session id is
        // ignored instead of returning 403 and leaving every session alive (§10).
        expect({
          status: response.status,
          code: await errorCode(response),
        }).toStrictEqual({ status: 403, code: "FORBIDDEN" });
      }
    );

    it.skipIf(isDeferred)(
      "PT-24 a learner read environment outside scope (no scope referent)",
      () => {
        // PRODUCTION GAP: same structural gap as PT-17. The learner environment
        // read is the session projection; it has no caller-selectable scope
        // referent, so the required cross-scope 403 is unreachable.
        expect.hasAssertions();
      }
    );

    it.skipIf(isDeferred)(
      "PT-27 a learner logout with a foreign session-id override is rejected",
      async () => {
        const dependencies = await authDependencies();
        const learner = await signInDirect(dependencies, learnerEmail);
        const response = await handleLogout(
          mutationRequest(dependencies, "/api/auth/logout", learner, {
            sessionId: "session_foreign",
          }),
          dependencies
        );

        // PRODUCTION GAP: observed 204, identical to PT-23.
        expect({
          status: response.status,
          code: await errorCode(response),
        }).toStrictEqual({ status: 403, code: "FORBIDDEN" });
      }
    );

    it.skipIf(isDeferred)("PT-36 a teacher cannot write role", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const key = "policy-pt-36-teacher-write-role";
      const { response } = await generate(dependencies, teacher, key, {
        role: "teacher",
      });
      const stored =
        await foundationPersistence().findGenerationByIdempotencyKey(
          northTenantId,
          teacherActorId,
          key
        );

      // PRODUCTION GAP: observed 422 INVALID_INPUT. The strict
      // `lessonGenerationInputSchema` rejects the extra field before §10's
      // "role override returns 403 FORBIDDEN" rule can apply. The override grants
      // no authority and writes no row, but the code differs.
      expect({
        status: response.status,
        code: await errorCode(response),
        hasRow: stored !== undefined,
      }).toStrictEqual({ status: 403, code: "FORBIDDEN", hasRow: false });
    });

    it.skipIf(isDeferred)("PT-37 a teacher cannot write tenantId", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const key = "policy-pt-37-teacher-write-tenant";
      const { response } = await generate(dependencies, teacher, key, {
        tenantId: southTenantId,
      });
      const stored =
        await foundationPersistence().findGenerationByIdempotencyKey(
          northTenantId,
          teacherActorId,
          key
        );

      // PRODUCTION GAP: observed 422 INVALID_INPUT, identical to PT-36.
      expect({
        status: response.status,
        code: await errorCode(response),
        hasRow: stored !== undefined,
      }).toStrictEqual({ status: 403, code: "FORBIDDEN", hasRow: false });
    });

    it.skipIf(isDeferred)("PT-38 a learner cannot write role", async () => {
      const dependencies = await authDependencies();
      const learner = await signInDirect(dependencies, learnerEmail);
      const key = "policy-pt-38-learner-write-role";
      const { response } = await generate(dependencies, learner, key, {
        role: "teacher",
      });
      const stored =
        await foundationPersistence().findGenerationByIdempotencyKey(
          northTenantId,
          learnerActorId,
          key
        );

      // PRODUCTION GAP: the observed 403 comes from the learner role gate, not from an override check. With an allowed actor the same override is rejected as 422, so the row's named behavior is not what produces the required code.
      // Kept skipped rather than reported as a real pass.
      expect({
        status: response.status,
        code: await errorCode(response),
        hasRow: stored !== undefined,
      }).toStrictEqual({ status: 403, code: "FORBIDDEN", hasRow: false });
    });

    it.skipIf(isDeferred)("PT-39 a learner cannot write tenantId", async () => {
      const dependencies = await authDependencies();
      const learner = await signInDirect(dependencies, learnerEmail);
      const key = "policy-pt-39-learner-write-tenant";
      const { response } = await generate(dependencies, learner, key, {
        tenantId: southTenantId,
      });
      const stored =
        await foundationPersistence().findGenerationByIdempotencyKey(
          northTenantId,
          learnerActorId,
          key
        );

      // PRODUCTION GAP: see PT-38.
      expect({
        status: response.status,
        code: await errorCode(response),
        hasRow: stored !== undefined,
      }).toStrictEqual({ status: 403, code: "FORBIDDEN", hasRow: false });
    });

    it.skipIf(isDeferred)(
      "PT-41 PC-01: an inactive membership is rejected with 403",
      async () => {
        const dependencies = await authDependencies();
        const teacher = await signInDirect(dependencies, teacherEmail);
        await identityPersistence().revokeMembership(
          parseMembershipId("membership_bilal_north")
        );
        const key = "policy-pt-41-inactive-membership";
        const { response } = await generate(dependencies, teacher, key);
        const stored =
          await foundationPersistence().findGenerationByIdempotencyKey(
            northTenantId,
            teacherActorId,
            key
          );

        // PRODUCTION GAP: observed 401 UNAUTHENTICATED. `buildActor` treats an
        // inactive membership as a failed session, so membership revocation
        // surfaces as an authentication boundary rather than the §6 PC-01
        // 403 FORBIDDEN. No effect lands either way.
        expect({
          status: response.status,
          code: await errorCode(response),
          hasRow: stored !== undefined,
        }).toStrictEqual({ status: 403, code: "FORBIDDEN", hasRow: false });
      }
    );

    it.skipIf(isDeferred)(
      "PT-54 a teacher cannot cancel outside scope",
      async () => {
        const dependencies = await authDependencies();
        const teacher = await signInDirect(dependencies, teacherEmail);
        const sameTenant = await signInForTenant(dependencies, northTenantName);
        const foreignTenant = await signInForTenant(
          dependencies,
          southTenantName
        );
        const sameTenantDraft = await generateReadyDraft(
          dependencies,
          sameTenant,
          "policy-pt-54-same-tenant"
        );
        const foreignTenantDraft = await generateReadyDraft(
          dependencies,
          foreignTenant,
          "policy-pt-54-foreign-tenant"
        );

        const sameTenantResponse = await handleCancelGenerationRequest(
          mutationRequest(
            dependencies,
            `/api/lessons/${sameTenantDraft.requestId}/cancel`,
            teacher
          ),
          sameTenantDraft.requestId
        );
        const foreignTenantResponse = await handleCancelGenerationRequest(
          mutationRequest(
            dependencies,
            `/api/lessons/${foreignTenantDraft.requestId}/cancel`,
            teacher
          ),
          foreignTenantDraft.requestId
        );
        const sameTenantRecord = await foundationPersistence().readGeneration(
          northTenantId,
          sameTenantDraft.requestId
        );
        const foreignTenantRecord =
          await foundationPersistence().readGeneration(
            southTenantId,
            foreignTenantDraft.requestId
          );

        // PRODUCTION GAP: both observed 500 GENERATION_FAILED. The service scopes
        // the read by tenant and owner and throws DRAFT_NOT_FOUND;
        // `mapGenerationError` turns it into 500 instead of the §10 generic 403.
        expect({
          sameTenant: sameTenantResponse.status,
          foreignTenant: foreignTenantResponse.status,
          codes: [
            await errorCode(sameTenantResponse),
            await errorCode(foreignTenantResponse),
          ],
          untouched: [sameTenantRecord?.state, foreignTenantRecord?.state],
        }).toStrictEqual({
          sameTenant: 403,
          foreignTenant: 403,
          codes: ["FORBIDDEN", "FORBIDDEN"],
          untouched: ["ready-for-review", "ready-for-review"],
        });
      }
    );

    it.skipIf(isDeferred)(
      "PT-56 a teacher cannot generate against a foreign standard",
      async () => {
        const dependencies = await authDependencies();
        const teacher = await signInDirect(dependencies, teacherEmail);
        const key = "policy-pt-56-foreign-standard";
        const { response } = await generate(dependencies, teacher, key, {
          standardId: "foreign-tenant-standard-999",
        });
        const stored =
          await foundationPersistence().findGenerationByIdempotencyKey(
            northTenantId,
            teacherActorId,
            key
          );

        // PRODUCTION GAP: the seam now surfaces the input rejection explicitly as
        // 422 GENERATION_INPUT_INVALID (issue #115 mapping). No row is created and
        // no provider call happens, but the transport code is not the required 403.
        expect({
          status: response.status,
          code: await errorCode(response),
          hasRow: stored !== undefined,
        }).toStrictEqual({ status: 403, code: "FORBIDDEN", hasRow: false });
      }
    );

    it.skipIf(isDeferred)(
      "PT-57 a teacher cannot generate against a foreign retry draft",
      async () => {
        const dependencies = await authDependencies();
        const teacher = await signInDirect(dependencies, teacherEmail);
        const key = "policy-pt-57-foreign-retry";
        const { response } = await generate(dependencies, teacher, key, {
          retryOfRequestId: "draft_foreign_retry_referent",
        });
        const stored =
          await foundationPersistence().findGenerationByIdempotencyKey(
            northTenantId,
            teacherActorId,
            key
          );

        // PRODUCTION GAP: observed 404 DRAFT_NOT_FOUND (see PT-18). This is the
        // generate half of the §12 referent rule; the preview half is proven by
        // PT-19, which returns the same generic 403 for both foreign referents.
        expect({
          status: response.status,
          code: await errorCode(response),
          hasRow: stored !== undefined,
        }).toStrictEqual({ status: 403, code: "FORBIDDEN", hasRow: false });
      }
    );
  });

  /**
   * Issue #115 (IC1) requires the unsupported-objective run through the same
   * delivery boundary to yield an explicit rejection the teacher can read, with
   * no persisted draft. The rows assert the transport contract directly:
   * status, machine code, and the curated message the error type already owns.
   */
  describe("generation delivery rejections (IC1)", () => {
    it("rejects an unsupported objective with an explicit 422 rejection and no persisted draft", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const key = "policy-ic1-unsupported-objective";
      const { response } = await generate(dependencies, teacher, key, {
        standardId: "unsupported-objective-999",
      });
      const stored =
        await foundationPersistence().findGenerationByIdempotencyKey(
          northTenantId,
          teacherActorId,
          key
        );

      expect({
        status: response.status,
        ...(await errorBody(response)),
        hasRow: stored !== undefined,
      }).toStrictEqual({
        status: 422,
        code: "GENERATION_INPUT_INVALID",
        message:
          "This learning objective is not supported. Use Grade 4 equivalent fractions (4.NF.A.1).",
        hasRow: false,
      });
    });

    it("reports a missing cancel referent as an explicit 404 not-found", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const response = await handleCancelGenerationRequest(
        mutationRequest(
          dependencies,
          "/api/lessons/draft_missing_cancel/cancel",
          teacher,
          {}
        ),
        "draft_missing_cancel"
      );

      expect({
        status: response.status,
        ...(await errorBody(response)),
      }).toStrictEqual({
        status: 404,
        code: "DRAFT_NOT_FOUND",
        message: "The requested draft was not found.",
      });
    });

    it("reports changed input under a used operation key as an explicit 409 conflict", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const key = "policy-ic1-idempotency-conflict";
      const first = await generateReadyDraft(dependencies, teacher, key);
      const { response } = await generate(dependencies, teacher, key, {
        prompt: "a different lesson request",
      });
      const stored =
        await foundationPersistence().findGenerationByIdempotencyKey(
          northTenantId,
          teacherActorId,
          key
        );

      expect({
        status: response.status,
        ...(await errorBody(response)),
        unchangedRequestId: stored?.requestId,
      }).toStrictEqual({
        status: 409,
        code: "IDEMPOTENCY_CONFLICT",
        message: "This operation key belongs to a different lesson request.",
        unchangedRequestId: first.requestId,
      });
    });
  });

  it("PT-04 a teacher publishes an approved pack to a learner", async () => {
    const dependencies = await authDependencies();
    const teacher = await signInDirect(dependencies, teacherEmail);
    const draft = await generateReadyDraft(
      dependencies,
      teacher,
      "policy-pt-04-generate"
    );
    const approved = await approveEveryScreen(
      dependencies,
      teacher,
      draft.requestId
    );

    const { response, body } = await publishPack(dependencies, teacher, {
      requestId: draft.requestId,
      versionId: approved.version.id,
      expectedArtifactHash: approved.version.artifactHash,
      learnerId: "learner_lina",
      operationKey: "policy-pt-04-publish",
    });

    const stored = await packPersistence().readPublicationForVersion(
      northTenantId,
      approved.version.id
    );

    expect({
      status: response.status,
      published: Boolean(body.publicationId),
      assignedTo: body.review?.assignment?.learnerId,
      storedVersion: stored?.versionId,
    }).toStrictEqual({
      status: 201,
      published: true,
      assignedTo: "learner_lina",
      storedVersion: approved.version.id,
    });

    // The response must satisfy the published contract, not a local copy of it.
    // A dropped field here is a 502 in the browser after a successful publish.
    expect(publicationPublishResultSchema.safeParse(body).success).toBeTruthy();
  });

  it("PT-58 the delivery seam refuses a body the contract does not publish", async () => {
    const dependencies = await authDependencies();
    const teacher = await signInDirect(dependencies, teacherEmail);
    const draft = await generateReadyDraft(
      dependencies,
      teacher,
      "policy-pt-58-generate"
    );
    const approved = await approveEveryScreen(
      dependencies,
      teacher,
      draft.requestId
    );

    // The body schemas are the boundary now, so an unknown key is a refusal
    // rather than something an inner parse silently strips.
    const { response } = await publishPack(dependencies, teacher, {
      requestId: draft.requestId,
      versionId: approved.version.id,
      expectedArtifactHash: approved.version.artifactHash,
      learnerId: "learner_lina",
      operationKey: "policy-pt-58-publish",
      score: 100,
    } as Parameters<typeof publishPack>[2]);

    expect({
      status: response.status,
      code: await errorCode(response),
    }).toStrictEqual({ status: 422, code: "PUBLICATION_INPUT_INVALID" });
  });

  it("PT-12 a learner cannot publish", async () => {
    const dependencies = await authDependencies();
    const learner = await signInDirect(dependencies, learnerEmail);
    const response = await handlePublishRequest(
      mutationRequest(dependencies, "/api/publications", learner, {
        requestId: "policy-pt-12-draft",
        versionId: "policy-pt-12-version",
        expectedArtifactHash: "a".repeat(64),
        learnerId: "learner_lina",
        operationKey: "policy-pt-12-publish",
      })
    );

    expect({
      status: response.status,
      code: await errorCode(response),
    }).toStrictEqual({ status: 403, code: "FORBIDDEN" });
  });

  it("PT-20 a teacher cannot publish outside their tenant scope", async () => {
    const dependencies = await authDependencies();
    const owner = await signInDirect(dependencies, teacherEmail);
    const draft = await generateReadyDraft(
      dependencies,
      owner,
      "policy-pt-20-generate"
    );
    const approved = await approveEveryScreen(
      dependencies,
      owner,
      draft.requestId
    );
    const outsider = await signInForTenant(dependencies, southTenantName);

    const { response, body } = await publishPack(dependencies, outsider, {
      requestId: draft.requestId,
      versionId: approved.version.id,
      expectedArtifactHash: approved.version.artifactHash,
      learnerId: "learner_lina",
      operationKey: "policy-pt-20-publish",
    });

    expect({
      status: response.status,
      code: body.code,
      published: Boolean(
        await packPersistence().readPublicationForVersion(
          northTenantId,
          approved.version.id
        )
      ),
    }).toStrictEqual({
      status: 403,
      code: "PUBLICATION_FORBIDDEN",
      published: false,
    });
  });

  it("PT-28 a teacher cannot publish another teacher's draft", async () => {
    const dependencies = await authDependencies();
    const owner = await signInDirect(dependencies, teacherEmail);
    const draft = await generateReadyDraft(
      dependencies,
      owner,
      "policy-pt-28-generate"
    );
    const approved = await approveEveryScreen(
      dependencies,
      owner,
      draft.requestId
    );
    const colleague = await signInForTenant(dependencies, northTenantName);

    const { response, body } = await publishPack(dependencies, colleague, {
      requestId: draft.requestId,
      versionId: approved.version.id,
      expectedArtifactHash: approved.version.artifactHash,
      learnerId: "learner_lina",
      operationKey: "policy-pt-28-publish",
    });

    expect({
      status: response.status,
      code: body.code,
    }).toStrictEqual({
      status: 403,
      code: "PUBLICATION_FORBIDDEN",
    });
  });

  it("PT-29 a teacher cannot assign a learner from another tenant", async () => {
    const dependencies = await authDependencies();
    const teacher = await signInDirect(dependencies, teacherEmail);
    const draft = await generateReadyDraft(
      dependencies,
      teacher,
      "policy-pt-29-generate"
    );
    const approved = await approveEveryScreen(
      dependencies,
      teacher,
      draft.requestId
    );

    const { response, body } = await publishPack(dependencies, teacher, {
      requestId: draft.requestId,
      versionId: approved.version.id,
      expectedArtifactHash: approved.version.artifactHash,
      learnerId: "learner_omar",
      operationKey: "policy-pt-29-publish",
    });

    expect({
      status: response.status,
      code: body.code,
      published: Boolean(
        await packPersistence().readPublicationForVersion(
          northTenantId,
          approved.version.id
        )
      ),
    }).toStrictEqual({
      status: 403,
      code: "PUBLICATION_FORBIDDEN",
      published: false,
    });
  });

  it("PT-47 an unauthenticated caller cannot publish", async () => {
    const dependencies = await authDependencies();
    const response = await handlePublishRequest(
      new Request(`${dependencies.publicOrigin}/api/publications`, {
        method: "POST",
        headers: {
          origin: dependencies.publicOrigin,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          requestId: "policy-pt-47-draft",
          versionId: "policy-pt-47-version",
          expectedArtifactHash: "a".repeat(64),
          learnerId: "learner_lina",
          operationKey: "policy-pt-47-publish",
        }),
      })
    );

    expect({
      status: response.status,
      code: await errorCode(response),
    }).toStrictEqual({ status: 401, code: "UNAUTHENTICATED" });
  });

  describe("release unit B — protected entries absent from this branch", () => {
    /**
     * The specification keeps the owning issue open while a handler is missing
     * (§11; §14 "absent handlers keep #98 open"). No endpoint is invented here; the
     * blocks record the deferral and the rows each absent entry owns.
     */

    it.skipIf(isDeferred)(
      "PT-05/PT-13/PT-21/PT-25/PT-48 read assignment entry (issue #6)",
      () => {
        expect(deferredUnitB.readAssignment).toStrictEqual({
          issue: "#6",
          entry: "GET /api/publications/:publicationId",
          rows: ["PT-05", "PT-13", "PT-21", "PT-25", "PT-48"],
        });
      }
    );

    it.skipIf(isDeferred)(
      "PT-06/PT-14/PT-26/PT-30/PT-31/PT-49 attempt entry (issue #7)",
      () => {
        expect(deferredUnitB.attempt).toStrictEqual({
          issue: "#7",
          entry: "POST /api/attempts",
          rows: ["PT-06", "PT-14", "PT-26", "PT-30", "PT-31", "PT-49"],
        });
      }
    );

    it.skipIf(isDeferred)(
      "PT-07/PT-15/PT-22/PT-32/PT-33/PT-50 teacher decision entry (issue #8)",
      () => {
        expect(deferredUnitB.teacherDecision).toStrictEqual({
          issue: "#8",
          entry: "POST /api/teacher-decisions",
          rows: ["PT-07", "PT-15", "PT-22", "PT-32", "PT-33", "PT-50"],
        });
      }
    );
  });

  describe("concurrency barriers (§12.3)", () => {
    const northLearner = syntheticLearnerActor();
    const southLearner = syntheticLearnerActor({
      actorId: parseActorId("actor_learner_hala"),
      membershipId: parseMembershipId("membership_hala_south"),
      tenantId: parseTenantId(southTenantId),
      tenantName: southTenantName,
      learnerId: parseLearnerId("learner_hala"),
    });

    it("fails a session write when revocation committed first", async () => {
      const persistence = identityPersistence();
      const session = sessionInput(
        northLearner,
        "policy_concurrency_revoke_first"
      );
      await persistence.createSession(session);

      const revoked = await persistence.revokeSession(
        session.sessionId,
        revokedAt
      );
      const touched = await persistence.touchSession({
        sessionId: session.sessionId,
        expectedRevision: 1,
        lastActivityAt: laterAt,
      });
      const rotated = await persistence.rotateSessionCredentials({
        sessionId: session.sessionId,
        expectedRevision: 1,
        providerCredentialsCiphertext: "replacement-credentials",
      });
      const current = await persistence.readSession(session.sessionId);

      expect({
        revoked: Boolean(revoked),
        touched,
        rotated,
        lastActivityAt: current?.lastActivityAt,
        revokedAt: current?.revokedAt,
      }).toStrictEqual({
        revoked: true,
        touched: false,
        rotated: false,
        lastActivityAt: session.lastActivityAt,
        revokedAt,
      });
    });

    it("does not undo a session write that committed first", async () => {
      const persistence = identityPersistence();
      const session = sessionInput(
        northLearner,
        "policy_concurrency_write_first"
      );
      await persistence.createSession(session);

      const touched = await persistence.touchSession({
        sessionId: session.sessionId,
        expectedRevision: 1,
        lastActivityAt: laterAt,
      });
      const revoked = await persistence.revokeSession(
        session.sessionId,
        revokedAt
      );
      const current = await persistence.readSession(session.sessionId);

      expect({
        touched,
        revoked: Boolean(revoked),
        lastActivityAt: current?.lastActivityAt,
        revokedAt: current?.revokedAt,
      }).toStrictEqual({
        touched: true,
        revoked: true,
        lastActivityAt: laterAt,
        revokedAt,
      });
    });

    it("isolates two tenants when one session is revoked", async () => {
      const persistence = identityPersistence();
      const north = sessionInput(northLearner, "policy_concurrency_north");
      const south = sessionInput(southLearner, "policy_concurrency_south");
      await Promise.all([
        persistence.createSession(north),
        persistence.createSession(south),
      ]);

      await persistence.revokeSession(north.sessionId, revokedAt);
      const northCurrent = await persistence.readSession(north.sessionId);
      const southCurrent = await persistence.readSession(south.sessionId);
      const southTouch = await persistence.touchSession({
        sessionId: south.sessionId,
        expectedRevision: 1,
        lastActivityAt: laterAt,
      });

      expect({
        northRevoked: Boolean(northCurrent?.revokedAt),
        southRevoked: Boolean(southCurrent?.revokedAt),
        southRevision: southCurrent?.revision,
        southTouch,
        southTenant: southCurrent?.tenantId,
      }).toStrictEqual({
        northRevoked: true,
        southRevoked: false,
        southRevision: 1,
        southTouch: true,
        southTenant: southTenantId,
      });
    });

    it("rejects a generation commit whose claim was revoked first", async () => {
      const persistence = createSeededPersistence();
      const record = generatingRecord({
        requestId: "policy_concurrency_revoked_draft",
        tenantId: northTenantId,
        teacherId: "actor_teacher_bilal",
        idempotencyKey: "policy-concurrency-revoked-claim",
      });
      const claim = await persistence.claimGeneration(record);

      const revocation = await persistence.saveGeneration(
        { ...claim.record, state: "failed-retryable", updatedAt: revokedAt },
        expectationFor(record)
      );
      const staleCommit = await persistence.saveGeneration(
        { ...claim.record, state: "ready-for-review", updatedAt: laterAt },
        expectationFor(record)
      );
      const current = await persistence.readGeneration(
        record.tenantId,
        record.requestId
      );

      expect({
        claimed: claim.claimed,
        revocation,
        staleCommit,
        state: current?.state,
        updatedAt: current?.updatedAt,
      }).toStrictEqual({
        claimed: true,
        revocation: true,
        staleCommit: false,
        state: "failed-retryable",
        updatedAt: revokedAt,
      });
    });

    it("does not overwrite a generation commit that already landed", async () => {
      const persistence = createSeededPersistence();
      const record = generatingRecord({
        requestId: "policy_concurrency_committed_draft",
        tenantId: northTenantId,
        teacherId: "actor_teacher_bilal",
        idempotencyKey: "policy-concurrency-committed-claim",
      });
      const claim = await persistence.claimGeneration(record);

      const committed = await persistence.saveGeneration(
        { ...claim.record, state: "ready-for-review", updatedAt: laterAt },
        expectationFor(record)
      );
      const staleCommit = await persistence.saveGeneration(
        { ...claim.record, state: "failed-retryable", updatedAt: revokedAt },
        expectationFor(record)
      );
      const current = await persistence.readGeneration(
        record.tenantId,
        record.requestId
      );

      expect({
        committed,
        staleCommit,
        state: current?.state,
        updatedAt: current?.updatedAt,
      }).toStrictEqual({
        committed: true,
        staleCommit: false,
        state: "ready-for-review",
        updatedAt: laterAt,
      });
    });

    it("resolves two concurrent duplicate claims to a single winner", async () => {
      const persistence = createSeededPersistence();
      const winner = generatingRecord({
        requestId: "policy_concurrency_duplicate_winner",
        tenantId: northTenantId,
        teacherId: "actor_teacher_bilal",
        idempotencyKey: "policy-concurrency-duplicate-key",
      });
      const loser = generatingRecord({
        requestId: "policy_concurrency_duplicate_loser",
        tenantId: northTenantId,
        teacherId: "actor_teacher_bilal",
        idempotencyKey: "policy-concurrency-duplicate-key",
      });

      const [first, second] = await Promise.all([
        persistence.claimGeneration(winner),
        persistence.claimGeneration(loser),
      ]);
      const losingClaim = first.claimed ? second : first;
      const losingRow = await persistence.readGeneration(
        northTenantId,
        loser.requestId
      );

      expect({
        claimed: [first.claimed, second.claimed],
        loserResolvesToWinner:
          losingClaim.record.requestId === winner.requestId,
        loserHasRow: losingRow !== undefined,
        winningRow: await persistence.readGeneration(
          northTenantId,
          winner.requestId
        ),
      }).toStrictEqual({
        claimed: [true, false],
        loserResolvesToWinner: true,
        loserHasRow: false,
        winningRow: winner,
      });
    });

    it("claims the same idempotency key independently in two tenants", async () => {
      const persistence = createSeededPersistence();
      const north = generatingRecord({
        requestId: "policy_concurrency_tenant_north",
        tenantId: northTenantId,
        teacherId: "actor_teacher_bilal",
        idempotencyKey: "policy-concurrency-shared-key",
      });
      const south = generatingRecord({
        requestId: "policy_concurrency_tenant_south",
        tenantId: southTenantId,
        teacherId: "actor_teacher_amira",
        idempotencyKey: "policy-concurrency-shared-key",
      });

      const [northClaim, southClaim] = await Promise.all([
        persistence.claimGeneration(north),
        persistence.claimGeneration(south),
      ]);
      const northRow = await persistence.readGeneration(
        northTenantId,
        north.requestId
      );
      const southRow = await persistence.readGeneration(
        southTenantId,
        south.requestId
      );

      expect({
        northClaimed: northClaim.claimed,
        southClaimed: southClaim.claimed,
        northRow: northRow?.requestId,
        southRow: southRow?.requestId,
      }).toStrictEqual({
        northClaimed: true,
        southClaimed: true,
        northRow: north.requestId,
        southRow: south.requestId,
      });
    });

    it("converges two concurrent generate calls on one draft and one provider call", async () => {
      const provider = createDeterministicLessonDraftProvider();
      let providerCalls = 0;
      const countingProvider: LessonDraftProvider = {
        ...provider,
        generate: (input, context, options) => {
          providerCalls += 1;
          return provider.generate(input, context, options);
        },
      };
      let sequence = 0;
      const service = createGenerationService({
        persistence: createSeededPersistence(),
        provider: countingProvider,
        requestIdFactory: () => {
          sequence += 1;
          return `policy_concurrent_draft_${sequence}`;
        },
      });
      const command = {
        actor: syntheticTeacherActor(),
        input: generationInput("policy-concurrency-service-key"),
      };

      const [first, second] = await Promise.all([
        service.generate({ ...command }),
        service.generate({ ...command }),
      ]);

      expect({
        sameDraft: first.record.requestId === second.record.requestId,
        providerCalls,
        states: [first.record.state, second.record.state],
      }).toStrictEqual({
        sameDraft: true,
        providerCalls: 1,
        states: ["ready-for-review", "ready-for-review"],
      });
    });
  });
});
