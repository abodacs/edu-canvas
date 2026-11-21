import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { handleLessonPreviewRequest } from "@/server/a2ui/preview.server";
import { readServerConfig } from "@/server/config";
import {
  handleCancelGenerationRequest,
  handleGenerateLessonRequest,
  handleReadGenerationRequest,
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

import {
  publicGenerationResultSchema,
  storedGenerationResultSchema,
} from "@/shared/generation-contract";
import {
  publicationPublishResultSchema,
  reviewPackSchema,
} from "@/shared/publication-contract";
import { sessionProjectionSchema } from "@/shared/identity-contract";
import { createSeededGenerationLimitStore } from "@/server/persistence/limits-seeded";
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

vi.stubEnv(
  "DATABASE_URL",
  "postgresql://test:test@127.0.0.1:5432/edu_canvas_test"
);
vi.stubEnv("APP_ENV", "development");
vi.stubEnv("META_API_KEY", "test-server-key");
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
    const seededLimits = await import(
      /* webpackChunkName: "policy-matrix-seeded-limits" */
      "@/server/persistence/limits-seeded"
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
      createGenerationLimitStore: () =>
        seededLimits.createUnboundedGenerationLimitStore(),
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

const isDeferred = true;

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

const csrfBodySchema = z.object({ csrf: z.string() });

const sessionCsrfSchema = z.object({ csrf: z.string().nullish() });

const errorBodySchema: z.ZodType<{ code?: string; message?: string }> =
  z.object({
    code: z.string().optional(),
    message: z.string().optional(),
  });

interface GenerationErrorBody {
  code?: string;
  message?: string;
}

const draftBodyOf = (
  body: PublicGenerationResult | GenerationErrorBody
): PublicGenerationResult => {
  if (!("requestId" in body)) {
    throw new Error("Expected a generation draft body.");
  }
  return body;
};

const projectionBodyOf = (payload: unknown): unknown => {
  if (typeof payload !== "object" || payload === null) {
    return payload;
  }
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== "csrf")
  );
};

const publishResponseBodySchema: z.ZodType<{
  publicationId?: string;
  assignmentId?: string;
  code?: string;
  review?: ReviewPack;
  learnerAssignmentId?: string | null;
  learnerVariantId?: string | null;
}> = z.object({
  publicationId: z.string().optional(),
  assignmentId: z.string().optional(),
  code: z.string().optional(),
  review: reviewPackSchema.optional(),
  learnerAssignmentId: z.string().nullable().optional(),
  learnerVariantId: z.string().nullable().optional(),
});

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

const authDependencies = async (): Promise<AuthDependencies> =>
  await resolveAuthDependencies(serverConfig());

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
  const body = csrfBodySchema.parse(await response.json());
  return {
    csrf: body.csrf,
    cookie: `edu_canvas_csrf=${cookieValue(response, "edu_canvas_csrf") ?? ""}`,
  };
};

const signInResponse = async (
  dependencies: AuthDependencies,
  email: string,
  flow: CookieJar
): Promise<Response> => {
  return await handleSignIn(
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
  const body = sessionCsrfSchema.parse(await response.json());
  return body.csrf ?? "";
};

const selectTenantMembership = async (
  dependencies: AuthDependencies,
  signIn: Response,
  tenantName: string
): Promise<Response> => {
  const body = sessionProjectionSchema.parse(await signIn.clone().json());
  const membershipId =
    body.status === "membership-required"
      ? body.memberships.find(
          (membership) => membership.tenantName === tenantName
        )?.membershipId
      : undefined;
  const flow = await preAuthFlow(dependencies);
  return await handleMembership(
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

const signInDirect = async (
  dependencies: AuthDependencies,
  email: string
): Promise<CookieJar> => {
  const response = await signInResponse(
    dependencies,
    email,
    await preAuthFlow(dependencies)
  );
  const body = sessionProjectionSchema.parse(await response.clone().json());
  const established =
    body.status === "membership-required"
      ? await selectTenantMembership(dependencies, response, northTenantName)
      : response;
  const cookie = sessionCookie(established);
  return { cookie, csrf: await sessionChallenge(dependencies, cookie) };
};

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
): Promise<{
  response: Response;
  body: PublicGenerationResult | GenerationErrorBody;
}> => {
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
    body: response.ok
      ? publicGenerationResultSchema.parse(await response.clone().json())
      : errorBodySchema.parse(await response.clone().json()),
  };
};

const readDraft = async (
  dependencies: AuthDependencies,
  requestId: string,
  cookie?: string
): Promise<Response> => {
  return await handleReadGenerationRequest(
    new Request(
      `${dependencies.publicOrigin}/api/lessons/${encodeURIComponent(requestId)}`,
      cookie === undefined ? undefined : { headers: { cookie } }
    ),
    requestId
  );
};

const generateReadyDraft = async (
  dependencies: AuthDependencies,
  auth: MutationAuth,
  idempotencyKey: string
): Promise<PublicGenerationResult> => {
  const { response, body } = await generate(dependencies, auth, idempotencyKey);
  if (response.status !== 200 || !("requestId" in body)) {
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
    review: reviewPackSchema.parse(await response.clone().json()),
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
    review: reviewPackSchema.parse(await response.clone().json()),
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
    body: publishResponseBodySchema.parse(await response.clone().json()),
  };
};

const packPersistence = () => createPackPersistence(serverConfig());

const errorBody = async (
  response: Response
): Promise<{ code?: string; message?: string }> =>
  errorBodySchema.parse(await response.clone().json());

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
      const actor = activeActorOf(
        sessionProjectionSchema.parse(projectionBodyOf(await response.json()))
      );

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
        state: publicGenerationResultSchema.parse(body).state,
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
      const actor = activeActorOf(
        sessionProjectionSchema.parse(projectionBodyOf(await response.json()))
      );

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
      const sameTenantBody: unknown = await sameTenantResponse.clone().json();
      const foreignTenantBody: unknown = await foreignTenantResponse
        .clone()
        .json();
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
        code: errorBodySchema.parse(sameTenantBody).code,
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
      const actor = activeActorOf(
        sessionProjectionSchema.parse(projectionBodyOf(JSON.parse(body)))
      );

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
        state: publicGenerationResultSchema.parse(body).state,
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
        separateDrafts:
          draftBodyOf(first.body).requestId !==
          draftBodyOf(second.body).requestId,
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
      ).resolves.toMatchObject({
        requestId: draftBodyOf(second.body).requestId,
      });
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
        state: publicGenerationResultSchema.parse(body).state,
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
        responses.map(async (entry) => await errorCode(entry.response))
      );
      const rows = await Promise.all(
        [forged, absent, foreign].map(async (key) => {
          return await foundationPersistence().findGenerationByIdempotencyKey(
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
      const body = publicGenerationResultSchema.parse(
        await response.clone().json()
      );
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
    it.skipIf(isDeferred)(
      "PT-17 a teacher read environment outside scope (no scope referent)",
      () => {
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

        expect({
          status: response.status,
          code: await errorCode(response),
        }).toStrictEqual({ status: 403, code: "FORBIDDEN" });
      }
    );

    it.skipIf(isDeferred)(
      "PT-24 a learner read environment outside scope (no scope referent)",
      () => {
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

        expect({
          status: response.status,
          code: await errorCode(response),
          hasRow: stored !== undefined,
        }).toStrictEqual({ status: 403, code: "FORBIDDEN", hasRow: false });
      }
    );
  });

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
          "This learning objective is not supported. Choose a supported standard.",
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

  describe("draft read — GET /api/lessons/:draftId", () => {
    it("returns the owning teacher's persisted result and objective, uncached", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const draft = await generateReadyDraft(
        dependencies,
        teacher,
        "policy-draft-read-owner"
      );

      const response = await readDraft(
        dependencies,
        draft.requestId,
        teacher.cookie
      );
      const stored = storedGenerationResultSchema.parse(await response.json());

      expect({
        status: response.status,
        cache: response.headers.get("cache-control"),
        requestId: stored.result.requestId,
        state: stored.result.state,
        prompt: stored.prompt,
        sameProjection: JSON.stringify(stored.result) === JSON.stringify(draft),
      }).toStrictEqual({
        status: 200,
        cache: "no-store",
        requestId: draft.requestId,
        state: "ready-for-review",
        prompt: "equivalent fractions for grade 4",
        sameProjection: true,
      });
    });

    it("refuses another teacher, another tenant, and a missing draft with one generic 403", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const colleague = await signInForTenant(dependencies, northTenantName);
      const foreign = await signInForTenant(dependencies, southTenantName);
      const colleagueDraft = await generateReadyDraft(
        dependencies,
        colleague,
        "policy-draft-read-colleague"
      );
      const foreignDraft = await generateReadyDraft(
        dependencies,
        foreign,
        "policy-draft-read-foreign"
      );

      const responses = await Promise.all(
        [colleagueDraft.requestId, foreignDraft.requestId, "draft_missing"].map(
          async (requestId) =>
            await readDraft(dependencies, requestId, teacher.cookie)
        )
      );
      const bodies = await Promise.all(
        responses.map(async (response) => await response.text())
      );

      expect({
        statuses: responses.map((response) => response.status),
        identical: new Set(bodies).size === 1,
        code: errorBodySchema.parse(JSON.parse(bodies[0] ?? "{}")).code,
      }).toStrictEqual({
        statuses: [403, 403, 403],
        identical: true,
        code: "FORBIDDEN",
      });
    });

    it("refuses a learner and an unauthenticated caller", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const draft = await generateReadyDraft(
        dependencies,
        teacher,
        "policy-draft-read-learner"
      );
      const learner = await signInDirect(dependencies, learnerEmail);

      const learnerResponse = await readDraft(
        dependencies,
        draft.requestId,
        learner.cookie
      );
      const anonymousResponse = await readDraft(dependencies, draft.requestId);

      expect({
        learner: [learnerResponse.status, await errorCode(learnerResponse)],
        anonymous: [
          anonymousResponse.status,
          await errorCode(anonymousResponse),
        ],
      }).toStrictEqual({
        learner: [403, "FORBIDDEN"],
        anonymous: [401, "UNAUTHENTICATED"],
      });
    });

    it("rejects a malformed draft id before any read", async () => {
      const dependencies = await authDependencies();
      const teacher = await signInDirect(dependencies, teacherEmail);
      const response = await readDraft(dependencies, "../x", teacher.cookie);

      expect({
        status: response.status,
        code: await errorCode(response),
      }).toStrictEqual({ status: 422, code: "INVALID_INPUT" });
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

    const body: Record<string, unknown> = {
      requestId: draft.requestId,
      versionId: approved.version.id,
      expectedArtifactHash: approved.version.artifactHash,
      learnerId: "learner_lina",
      operationKey: "policy-pt-58-publish",
      score: 100,
    };
    const response = await handlePublishRequest(
      mutationRequest(dependencies, "/api/publications", teacher, body)
    );

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
        generate: async (input, context, options) => {
          providerCalls += 1;
          return await provider.generate(input, context, options);
        },
      };
      let sequence = 0;
      const service = createGenerationService({
        limits: createSeededGenerationLimitStore(),
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
