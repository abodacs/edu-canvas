import { setTimeout as delay } from "node:timers/promises";

import { lessonGenerationInputSchema } from "@/shared/generation-contract";

import { assertTenantAccess, canAccess } from "@/server/demo/policy";
import { createId } from "@/server/ids";
import { demoSeed } from "@/server/seed-data";

import { GenerationInputError } from "./generation-input-error";
import { GenerationRequestError } from "./generation-request-error";

import { toPublicGenerationResult } from "./projection";

import { LessonProviderError, RATE_LIMIT_KIND } from "./provider";
import {
  resolveCurriculumContext,
  reviewDraftForAcceptance,
} from "./draft-acceptance";
import {
  createGenerationRequestHash,
  defaultGenerationDeadlines,
  generationDuplicateWaitMs,
  isGenerationClaimExpired,
} from "./types";
import { validateProviderDraft } from "./validation";
import type { DraftAcceptanceOptions } from "./draft-acceptance";
import type {
  GenerationCommand,
  GenerationDeadlines,
  GenerationDiagnostic,
  GenerationPersistence,
  GenerationServiceResult,
  GenerationState,
  GenerationAttemptRecord,
  GenerationWriteExpectation,
  LessonGenerationRecord,
  ProviderLessonDraft,
  LessonDraft,
} from "./types";
import type {
  LessonDraftProvider,
  NormalizedGenerationRequest,
  ProviderGenerationContext,
  ProviderResponse,
} from "./provider";
import type { LessonDifficulty } from "@/shared/generation-contract";

export { GenerationInputError } from "./generation-input-error";
export { GenerationRequestError } from "./generation-request-error";

const BLOCKED_BY_MODERATION_STATE = "blocked-by-moderation";

const BLOCKED_BY_VALIDATION_STATE = "blocked-by-validation";

const FAILED_RETRYABLE_STATE = "failed-retryable";

const CANCELLED_DIAGNOSTIC_CODE = "GENERATION_CANCELLED";

const DEADLINE_DIAGNOSTIC_CODE = "GENERATION_DEADLINE_EXCEEDED";

export interface ContentSafetyResult {
  allowed: boolean;
}

export interface ContentSafety {
  checkPrompt: (prompt: string) => ContentSafetyResult;
  checkGeneratedContent: (content: unknown) => ContentSafetyResult;
}

export interface GenerationServiceOptions extends DraftAcceptanceOptions {
  persistence: GenerationPersistence;
  provider: LessonDraftProvider;
  safety?: ContentSafety;
  now?: () => string;
  clock?: () => number;
  deadlines?: Partial<GenerationDeadlines>;
  requestIdFactory?: () => string;
}

export interface GenerationCancellationCommand {
  session: GenerationCommand["session"];
  requestId: string;
}

interface NormalizedCommandInput extends NormalizedGenerationRequest {
  idempotencyKey: string;
  requestHash: string;
  retryOfRequestId?: string;
}

type ProviderCallFailure =
  | { ok: false; kind: "provider"; error: unknown }
  | { ok: false; kind: "per-call" }
  | { ok: false; kind: "total" }
  | { ok: false; kind: "cancelled" };

type ProviderCallOutcome =
  ProviderCallFailure | { ok: true; response: ProviderResponse };

class GenerationAbortError extends Error {
  readonly kind: "per-call" | "total" | "cancelled";

  constructor(
    kind: "per-call" | "total" | "cancelled",
    options: ErrorOptions = {}
  ) {
    super(`Generation call aborted: ${kind}.`, options);
    this.name = "GenerationAbortError";
    this.kind = kind;
  }
}

const unsafeContentPatterns = [
  /<\s*\/?(?:script|iframe|object|embed)/iu,
  /javascript\s*:/iu,
  /ignore\s+(?:all|any|the|previous)\s+instructions/iu,
  /\b(?:api|secret|access)\s+key\b/iu,
];

const hasUnsafeContent = (value: string): boolean =>
  unsafeContentPatterns.some((pattern) => pattern.test(value));

const supportedStandardIds: ReadonlySet<string> = new Set([
  demoSeed.standard.id,
  demoSeed.standard.code,
]);

// Idempotency keys are persisted and looked up across deploys; keep FNV-1a so a retry that spans a deployment still matches its record.
const hashForIdempotency = (value: string): string => {
  let hash = 2_166_136_261;
  for (const character of value) {
    // eslint-disable-next-line no-bitwise -- FNV-1a mixing step.
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return Math.abs(hash).toString(36);
};

const createImplicitIdempotencyKey = (
  input: Pick<
    NormalizedCommandInput,
    "prompt" | "grade" | "standardId" | "language" | "difficulty"
  >,
  retryOfRequestId?: string
): string => {
  return `implicit-${hashForIdempotency(
    JSON.stringify({ ...input, retryOfRequestId })
  )}`;
};

export const normalizeGenerationInput = (
  input: unknown
): NormalizedCommandInput => {
  const parsed = lessonGenerationInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new GenerationInputError();
  }

  const grade =
    typeof parsed.data.grade === "number"
      ? parsed.data.grade
      : Number(parsed.data.grade);
  if (!Number.isSafeInteger(grade) || grade < 3 || grade > 6) {
    throw new GenerationInputError();
  }

  if (!supportedStandardIds.has(parsed.data.standardId)) {
    throw new GenerationInputError(
      "This learning objective is not supported. Use Grade 4 equivalent fractions (4.NF.A.1)."
    );
  }

  const standardId =
    parsed.data.standardId === demoSeed.standard.code
      ? demoSeed.standard.id
      : parsed.data.standardId;
  const difficulty: LessonDifficulty = parsed.data.difficulty ?? "on-level";
  const { retryOfRequestId } = parsed.data;
  const normalized = {
    prompt: parsed.data.prompt,
    grade,
    standardId,
    language: parsed.data.language,
    difficulty,
  };

  return {
    ...normalized,
    idempotencyKey:
      parsed.data.idempotencyKey ??
      createImplicitIdempotencyKey(normalized, retryOfRequestId),
    requestHash: createGenerationRequestHash(normalized),
    ...(retryOfRequestId && { retryOfRequestId }),
  };
};

export const createDefaultContentSafety = (): ContentSafety => {
  return {
    checkPrompt: (prompt) => ({ allowed: !hasUnsafeContent(prompt) }),
    checkGeneratedContent(content) {
      let text: string;
      try {
        text = JSON.stringify(content);
      } catch {
        return { allowed: false };
      }
      return { allowed: !hasUnsafeContent(text) };
    },
  };
};

const diagnostic = (code: string, message: string): GenerationDiagnostic => {
  return {
    severity: "error",
    code,
    message,
  };
};

const deadlineDiagnostic = (): GenerationDiagnostic => {
  return diagnostic(
    DEADLINE_DIAGNOSTIC_CODE,
    "The generation deadline expired before the draft finished. Try this draft again."
  );
};

const cancelledDiagnostic = (): GenerationDiagnostic => {
  return diagnostic(
    CANCELLED_DIAGNOSTIC_CODE,
    "The teacher cancelled this generation request."
  );
};

const providerTimeoutDiagnostic = (): GenerationDiagnostic => {
  return diagnostic(
    "PROVIDER_TIMEOUT",
    "The lesson provider timed out. Try again."
  );
};

const resultFor = (record: LessonGenerationRecord): GenerationServiceResult => {
  return {
    record,
    publicResult: toPublicGenerationResult(record),
  };
};

const providerFailureDiagnostic = (
  error: LessonProviderError
): GenerationDiagnostic => {
  const codeByKind: Record<LessonProviderError["kind"], string> = {
    timeout: "PROVIDER_TIMEOUT",
    "rate-limit": "PROVIDER_RATE_LIMIT",
    transient: "PROVIDER_UNAVAILABLE",
    terminal: "PROVIDER_REJECTED",
  };

  return diagnostic(codeByKind[error.kind], error.safeMessage);
};

const stateForProviderFailure = (
  kind: LessonProviderError["kind"]
): "failed-retryable" | "failed-terminal" => {
  return ["timeout", RATE_LIMIT_KIND, "transient"].includes(kind)
    ? FAILED_RETRYABLE_STATE
    : "failed-terminal";
};

const updateAttempt = (
  record: LessonGenerationRecord,
  attemptNumber: number,
  patch: Partial<GenerationAttemptRecord>
): GenerationAttemptRecord[] => {
  return record.attempts.map((attempt) =>
    attempt.attemptNumber === attemptNumber ? { ...attempt, ...patch } : attempt
  );
};

const isRetryableState = (state: GenerationState): boolean =>
  state === FAILED_RETRYABLE_STATE || state === BLOCKED_BY_VALIDATION_STATE;

const assertTeacherCanGenerate = (
  session: GenerationCommand["session"]
): void => {
  assertTenantAccess(session, demoSeed.tenant.id);
  if (
    session.role !== "teacher" ||
    session.identityId !== "identity_demo_teacher" ||
    !canAccess(session, "generate_lesson_draft")
  ) {
    throw new GenerationRequestError(
      "Only a seeded teacher can generate lesson drafts."
    );
  }
};

const requestMetadataKeys = [
  "prompt",
  "grade",
  "standardId",
  "language",
  "difficulty",
] as const;

const hasSameRequestMetadata = (
  left: NormalizedGenerationRequest,
  right: NormalizedGenerationRequest
): boolean => requestMetadataKeys.every((key) => left[key] === right[key]);

const attemptForIdempotencyKey = (
  record: LessonGenerationRecord,
  idempotencyKey: string
): GenerationAttemptRecord | undefined => {
  return record.attempts.find(
    (attempt) => attempt.idempotencyKey === idempotencyKey
  );
};

const storedRequestHash = (
  record: LessonGenerationRecord,
  attempt: GenerationAttemptRecord | undefined
): string => attempt?.requestHash ?? createGenerationRequestHash(record.input);

const generationCallKey = (tenantId: string, requestId: string): string =>
  `${tenantId}:${requestId}`;

const buildProviderContext = (
  curriculum: ReturnType<typeof resolveCurriculumContext>,
  isCorrectionAttempt: boolean,
  diagnostics: GenerationDiagnostic[]
): ProviderGenerationContext => {
  const reference = {
    id: demoSeed.activityVersion.id,
    version: String(demoSeed.activityVersion.versionNumber),
    graphVersion: demoSeed.activityVersion.graphVersion,
    standardCode: demoSeed.standard.code,
    source: demoSeed.activityVersion.publicContent.source,
    targets: demoSeed.activityVersion.publicContent.targets,
    prompt: demoSeed.activityVersion.publicContent.prompt,
  };

  return {
    correctionAttempt: isCorrectionAttempt,
    diagnostics,
    referenceContext: reference,
    ...(curriculum && {
      curriculumContext: {
        nodes: curriculum.nodes.map((node) => {
          return {
            id: node.id,
            screenPurposeId: node.screenPurposeId,
          };
        }),
        edges: curriculum.edges.map((edge) => {
          return {
            prerequisiteId: edge.prerequisiteId,
            successorId: edge.successorId,
          };
        }),
        targetNodeId: curriculum.targetNodeId,
      },
    }),
  };
};

const assertRequestMatches = (
  record: LessonGenerationRecord,
  input: NormalizedCommandInput
): void => {
  const attempt = attemptForIdempotencyKey(record, input.idempotencyKey);
  if (storedRequestHash(record, attempt) !== input.requestHash) {
    throw new GenerationRequestError(
      "This operation key belongs to a different lesson request.",
      { code: "IDEMPOTENCY_CONFLICT" }
    );
  }
};

export const createGenerationService = (options: GenerationServiceOptions) => {
  const safety = options.safety ?? createDefaultContentSafety();
  const deadlines: GenerationDeadlines = {
    ...defaultGenerationDeadlines,
    ...options.deadlines,
  };
  const clock = options.clock ?? Date.now;
  const now =
    options.now ??
    (() => {
      const date = new Date(clock());
      return date.toISOString();
    });
  const requestIdFactory = options.requestIdFactory ?? (() => createId());
  const inFlightCalls = new Map<string, AbortController>();

  const writeExpectation = (
    record: LessonGenerationRecord,
    expectedUpdatedAt = record.updatedAt
  ): GenerationWriteExpectation => {
    const leaseStartedAt = new Date(clock() - deadlines.leaseMs);
    return {
      attempt: record.attempt,
      updatedAt: expectedUpdatedAt,
      leaseValidAfter: leaseStartedAt.toISOString(),
    };
  };

  const persistOwned = async (
    record: LessonGenerationRecord,
    expectedUpdatedAt: string
  ): Promise<{ owned: boolean; record: LessonGenerationRecord }> => {
    const saved = await options.persistence.saveGeneration(
      record,
      writeExpectation(record, expectedUpdatedAt)
    );
    if (saved) {
      return { owned: true, record };
    }

    const current = await options.persistence.readGeneration(
      record.tenantId,
      record.requestId
    );
    if (!current) {
      throw new GenerationRequestError(
        "The generation attempt was superseded and could not be resolved.",
        { code: "DRAFT_SUPERSEDED" }
      );
    }
    return { owned: false, record: current };
  };

  const persist = async (
    record: LessonGenerationRecord,
    expectedUpdatedAt: string
  ): Promise<GenerationServiceResult> => {
    const persisted = await persistOwned(record, expectedUpdatedAt);
    return resultFor(persisted.record);
  };

  const currentResult = async (
    record: LessonGenerationRecord
  ): Promise<GenerationServiceResult> => {
    const current = await options.persistence.readGeneration(
      record.tenantId,
      record.requestId
    );
    return resultFor(current ?? record);
  };

  const finishAttempt = (
    baseRecord: LessonGenerationRecord,
    outcome:
      | {
          state: "ready-for-review";
          draft: LessonDraft;
          diagnostics: GenerationDiagnostic[];
        }
      | {
          state: Exclude<
            GenerationState,
            "requested" | "generating" | "ready-for-review"
          >;
          diagnostics: GenerationDiagnostic[];
        },
    attemptDiagnostics = outcome.diagnostics
  ): Promise<GenerationServiceResult> => {
    const provenance = baseRecord.provenance ?? options.provider.provenance;
    const draft = "draft" in outcome ? outcome.draft : null;
    const record: LessonGenerationRecord = {
      ...baseRecord,
      state: outcome.state,
      diagnostics: outcome.diagnostics,
      draft,
      provenance,
      updatedAt: draft ? draft.createdAt : now(),
      attempts: updateAttempt(baseRecord, baseRecord.attempt, {
        state: outcome.state,
        diagnostics: attemptDiagnostics,
        provenance,
      }),
    };
    return persist(record, baseRecord.updatedAt);
  };

  const resolveDuplicate = async (
    initialRecord: LessonGenerationRecord,
    input: NormalizedCommandInput
  ): Promise<LessonGenerationRecord> => {
    assertRequestMatches(initialRecord, input);
    let record = initialRecord;
    if (
      record.state === "generating" &&
      !isGenerationClaimExpired(record, clock())
    ) {
      const deadline = clock() + generationDuplicateWaitMs;
      while (clock() < deadline) {
        // Polling is sequential by design: each wait and read observes the
        // previous state before deciding whether to poll again.
        // eslint-disable-next-line no-await-in-loop
        await delay(25);
        // eslint-disable-next-line no-await-in-loop
        const refreshed = await options.persistence.readGeneration(
          record.tenantId,
          record.requestId
        );
        if (!refreshed) {
          break;
        }
        record = refreshed;
        if (record.state !== "generating") {
          return record;
        }
      }
    }

    if (!isGenerationClaimExpired(record, clock())) {
      return record;
    }

    const expired = await options.persistence.expireGenerationClaim(
      record.tenantId,
      record.requestId,
      record.updatedAt,
      now()
    );
    return (
      expired ??
      (await options.persistence.readGeneration(
        record.tenantId,
        record.requestId
      )) ??
      record
    );
  };

  const acceptDraft = async (
    baseRecord: LessonGenerationRecord,
    input: NormalizedCommandInput,
    providerDraft: ProviderLessonDraft,
    structuralDiagnostics: GenerationDiagnostic[]
  ): Promise<GenerationServiceResult> => {
    const provenance = baseRecord.provenance ?? options.provider.provenance;
    const acceptance = await reviewDraftForAcceptance(
      {
        draft: providerDraft,
        input,
        tenantId: baseRecord.tenantId,
        requestId: baseRecord.requestId,
        provenance,
        structuralDiagnostics,
        graphVersion: demoSeed.activityVersion.graphVersion,
      },
      options
    );
    if (acceptance.state !== "ready-for-review") {
      return finishAttempt(baseRecord, acceptance);
    }

    return finishAttempt(baseRecord, {
      state: acceptance.state,
      diagnostics: acceptance.diagnostics,
      draft: {
        ...providerDraft,
        learningPath: acceptance.learningPath,
        requestId: baseRecord.requestId,
        input: {
          prompt: input.prompt,
          grade: input.grade,
          standardId: input.standardId,
          language: input.language,
          difficulty: input.difficulty,
        },
        provenance,
        createdAt: now(),
      },
    });
  };

  const persistProviderFailure = (
    baseRecord: LessonGenerationRecord,
    error: unknown,
    priorDiagnostics: GenerationDiagnostic[] = []
  ): Promise<GenerationServiceResult> => {
    const providerError =
      error instanceof LessonProviderError
        ? error
        : new LessonProviderError(
            "terminal",
            "The lesson provider failed unexpectedly. Try again later."
          );
    const failureDiagnostic = providerFailureDiagnostic(providerError);
    const diagnostics = [...priorDiagnostics, failureDiagnostic];
    const state = stateForProviderFailure(providerError.kind);
    return finishAttempt(baseRecord, { state, diagnostics });
  };

  const persistCallFailure = (
    baseRecord: LessonGenerationRecord,
    failure: ProviderCallFailure,
    priorDiagnostics: GenerationDiagnostic[] = []
  ): Promise<GenerationServiceResult> => {
    if (failure.kind === "cancelled") {
      return currentResult(baseRecord);
    }
    if (failure.kind === "total") {
      return finishAttempt(baseRecord, {
        state: FAILED_RETRYABLE_STATE,
        diagnostics: [...priorDiagnostics, deadlineDiagnostic()],
      });
    }
    if (failure.kind === "per-call") {
      return finishAttempt(baseRecord, {
        state: FAILED_RETRYABLE_STATE,
        diagnostics: [...priorDiagnostics, providerTimeoutDiagnostic()],
      });
    }
    return persistProviderFailure(baseRecord, failure.error, priorDiagnostics);
  };

  const runProviderCall = async (
    record: LessonGenerationRecord,
    input: NormalizedCommandInput,
    context: ProviderGenerationContext,
    budgetMs: number,
    budgetKind: "per-call" | "total"
  ): Promise<ProviderCallOutcome> => {
    const key = generationCallKey(record.tenantId, record.requestId);
    const controller = new AbortController();
    const abortError = new GenerationAbortError(budgetKind);
    inFlightCalls.set(key, controller);
    const abortDeferred = Promise.withResolvers<never>();
    const onAbort = (): void => {
      abortDeferred.reject(controller.signal.reason ?? abortError);
    };
    controller.signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(
      () => {
        controller.abort(abortError);
      },
      Math.max(0, budgetMs)
    );

    try {
      const response = await Promise.race([
        options.provider.generate(input, context, {
          signal: controller.signal,
        }),
        abortDeferred.promise,
      ]);
      return { ok: true, response };
    } catch (error) {
      if (controller.signal.aborted) {
        const { reason } = controller.signal;
        return {
          ok: false,
          kind:
            reason instanceof GenerationAbortError ? reason.kind : budgetKind,
        };
      }
      return { ok: false, kind: "provider", error };
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", onAbort);
      if (inFlightCalls.get(key) === controller) {
        inFlightCalls.delete(key);
      }
    }
  };

  const runAttempt = async (
    baseRecord: LessonGenerationRecord,
    input: NormalizedCommandInput
  ): Promise<GenerationServiceResult> => {
    const attemptNumber = baseRecord.attempt + 1;
    const timestamp = now();
    const attempt: GenerationAttemptRecord = {
      attemptNumber,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      state: "generating",
      correctionAttempted: false,
      diagnostics: [],
      provenance: options.provider.provenance,
      createdAt: timestamp,
    };
    let record: LessonGenerationRecord = {
      ...baseRecord,
      input: {
        prompt: input.prompt,
        grade: input.grade,
        standardId: input.standardId,
        language: input.language,
        difficulty: input.difficulty,
      },
      state: "generating",
      attempt: attemptNumber,
      diagnostics: [],
      provenance: options.provider.provenance,
      draft: null,
      attempts: [...baseRecord.attempts, attempt],
      updatedAt: timestamp,
    };

    // Source resolution completes before the claim so the remaining lease is
    // reserved for generation, validation, and persistence.
    const curriculum = resolveCurriculumContext(input, options);
    const claim = await options.persistence.claimGeneration(record);
    if (!claim.claimed) {
      const resolved = await resolveDuplicate(claim.record, input);
      return resultFor(resolved);
    }
    ({ record } = claim);

    if (!safety.checkPrompt(input.prompt).allowed) {
      const diagnostics = [
        diagnostic(
          "MODERATION_BLOCKED",
          "This request was blocked by safety review. Revise the request before trying again."
        ),
      ];
      return finishAttempt(record, {
        state: BLOCKED_BY_MODERATION_STATE,
        diagnostics,
      });
    }

    const budgetStartedAt = clock();
    const remainingBudget = (): number =>
      deadlines.totalMs - (clock() - budgetStartedAt);

    const firstRemaining = remainingBudget();
    if (firstRemaining <= 0) {
      return finishAttempt(record, {
        state: FAILED_RETRYABLE_STATE,
        diagnostics: [deadlineDiagnostic()],
      });
    }
    const firstBudget = Math.min(deadlines.perCallMs, firstRemaining);
    const firstOutcome = await runProviderCall(
      record,
      input,
      buildProviderContext(curriculum, false, []),
      firstBudget,
      firstBudget < deadlines.perCallMs ? "total" : "per-call"
    );
    if (!firstOutcome.ok) {
      return persistCallFailure(record, firstOutcome);
    }

    if (!safety.checkGeneratedContent(firstOutcome.response.draft).allowed) {
      const diagnostics = [
        diagnostic(
          "MODERATION_BLOCKED",
          "The generated lesson was blocked by safety review and was not shown."
        ),
      ];
      return finishAttempt(record, {
        state: BLOCKED_BY_MODERATION_STATE,
        diagnostics,
      });
    }

    const firstValidation = validateProviderDraft(firstOutcome.response.draft, {
      expectedLanguage: input.language,
    });
    if (firstValidation.ok) {
      return acceptDraft(
        record,
        input,
        firstValidation.draft,
        firstValidation.diagnostics
      );
    }

    const correctionDiagnostics = firstValidation.diagnostics.filter(
      (entry) => entry.severity === "error"
    );
    const expectedUpdatedAt = record.updatedAt;
    record = {
      ...record,
      diagnostics: correctionDiagnostics,
      updatedAt: now(),
      attempts: updateAttempt(record, attemptNumber, {
        correctionAttempted: true,
        diagnostics: correctionDiagnostics,
      }),
    };
    const correctionProgress = await persistOwned(record, expectedUpdatedAt);
    if (!correctionProgress.owned) {
      return resultFor(correctionProgress.record);
    }
    ({ record } = correctionProgress);

    const correctionRemaining = remainingBudget();
    if (correctionRemaining <= 0) {
      return finishAttempt(record, {
        state: FAILED_RETRYABLE_STATE,
        diagnostics: [...correctionDiagnostics, deadlineDiagnostic()],
      });
    }
    const correctionBudget = Math.min(deadlines.perCallMs, correctionRemaining);
    const correctionOutcome = await runProviderCall(
      record,
      input,
      buildProviderContext(curriculum, true, correctionDiagnostics),
      correctionBudget,
      correctionBudget < deadlines.perCallMs ? "total" : "per-call"
    );
    if (!correctionOutcome.ok) {
      return persistCallFailure(
        record,
        correctionOutcome,
        correctionDiagnostics
      );
    }

    if (
      !safety.checkGeneratedContent(correctionOutcome.response.draft).allowed
    ) {
      const diagnostics = [
        diagnostic(
          "MODERATION_BLOCKED",
          "The corrected lesson was blocked by safety review and was not shown."
        ),
      ];
      return finishAttempt(
        record,
        {
          state: BLOCKED_BY_MODERATION_STATE,
          diagnostics,
        },
        [...correctionDiagnostics, ...diagnostics]
      );
    }

    const correctedValidation = validateProviderDraft(
      correctionOutcome.response.draft,
      {
        expectedLanguage: input.language,
      }
    );
    if (correctedValidation.ok) {
      return acceptDraft(
        record,
        input,
        correctedValidation.draft,
        correctedValidation.diagnostics
      );
    }

    const { diagnostics } = correctedValidation;
    return finishAttempt(
      record,
      {
        state: BLOCKED_BY_VALIDATION_STATE,
        diagnostics,
      },
      [...correctionDiagnostics, ...diagnostics]
    );
  };

  return {
    async generate(
      command: GenerationCommand
    ): Promise<GenerationServiceResult> {
      assertTeacherCanGenerate(command.session);
      const input = normalizeGenerationInput(command.input);
      const existing = await options.persistence.findGenerationByIdempotencyKey(
        command.session.tenantId,
        input.idempotencyKey
      );
      if (existing) {
        const resolved = await resolveDuplicate(existing, input);
        return resultFor(resolved);
      }

      const moderated = await options.persistence.findModeratedGeneration(
        command.session.tenantId,
        command.session.identityId,
        input.requestHash
      );
      if (moderated) {
        throw new GenerationRequestError(
          "A previous request with the same lesson input was blocked by safety review. Revise the request before trying again.",
          { code: "MODERATION_REVISION_REQUIRED" }
        );
      }

      if (input.retryOfRequestId) {
        const retryRecord = await options.persistence.readGeneration(
          command.session.tenantId,
          input.retryOfRequestId
        );
        if (
          !retryRecord ||
          retryRecord.teacherId !== command.session.identityId
        ) {
          throw new GenerationRequestError(
            "The requested draft was not found.",
            { code: "DRAFT_NOT_FOUND" }
          );
        }
        if (!isRetryableState(retryRecord.state)) {
          throw new GenerationRequestError(
            "This draft is not in a state that can be retried.",
            { code: "DRAFT_NOT_RETRYABLE" }
          );
        }
        if (!hasSameRequestMetadata(retryRecord.input, input)) {
          throw new GenerationRequestError(
            "A retry must keep the original lesson request metadata.",
            { code: "RETRY_METADATA_MISMATCH" }
          );
        }
        return runAttempt(retryRecord, input);
      }

      const timestamp = now();
      const record: LessonGenerationRecord = {
        requestId: requestIdFactory(),
        tenantId: command.session.tenantId,
        teacherId: command.session.identityId,
        input: {
          prompt: input.prompt,
          grade: input.grade,
          standardId: input.standardId,
          language: input.language,
          difficulty: input.difficulty,
        },
        state: "requested",
        attempt: 0,
        diagnostics: [],
        attempts: [],
        provenance: options.provider.provenance,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      return runAttempt(record, input);
    },

    async cancel(
      command: GenerationCancellationCommand
    ): Promise<GenerationServiceResult> {
      assertTeacherCanGenerate(command.session);
      const record = await options.persistence.readGeneration(
        command.session.tenantId,
        command.requestId
      );
      if (!record || record.teacherId !== command.session.identityId) {
        throw new GenerationRequestError("The requested draft was not found.", {
          code: "DRAFT_NOT_FOUND",
        });
      }
      if (record.state !== "generating") {
        return resultFor(record);
      }

      const attempt = attemptForIdempotencyKey(
        record,
        record.attempts.at(-1)?.idempotencyKey ?? ""
      );
      const diagnosis = cancelledDiagnostic();
      const diagnostics = [...record.diagnostics, diagnosis];
      const attemptDiagnostics = [...(attempt?.diagnostics ?? []), diagnosis];
      const cancelled: LessonGenerationRecord = {
        ...record,
        state: FAILED_RETRYABLE_STATE,
        diagnostics,
        updatedAt: now(),
        attempts: updateAttempt(record, record.attempt, {
          state: FAILED_RETRYABLE_STATE,
          diagnostics: attemptDiagnostics,
        }),
      };
      const saved = await options.persistence.saveGeneration(
        cancelled,
        writeExpectation(record)
      );
      if (!saved) {
        return currentResult(record);
      }

      inFlightCalls
        .get(generationCallKey(record.tenantId, record.requestId))
        ?.abort(new GenerationAbortError("cancelled"));
      return resultFor(cancelled);
    },
  };
};
