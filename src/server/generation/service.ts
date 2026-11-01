import { setTimeout as delay } from "node:timers/promises";

import { createId } from "@/server/ids";
import { syntheticSeed } from "@/server/seed-data";

import { IdentityError } from "../identity/errors";
import {
  createDefaultContentSafety,
  MODERATION_BLOCKED_CODE,
} from "../moderation/content-safety";

import {
  GenerationRequestError,
  GENERATION_INPUT_INVALID_MESSAGE,
} from "./generation-request-error";
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
  StandardNotConfiguredError,
} from "./types";
import { validateProviderDraft } from "./validation";
import type {
  LessonGenerationInput,
  LessonDifficulty,
} from "@/shared/generation-contract";
import type { SourceGate } from "../grounding/types";
import type {
  ContentSafety,
  ContentSafetyResult,
} from "../moderation/content-safety";
import type { Actor } from "@/server/identity/types";
import type { ArtifactGateSnapshot } from "@/server/safety/artifact-gate";
import type { DraftAcceptanceOptions } from "./draft-acceptance";
import type {
  GenerationClaim,
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

const BLOCKED_BY_MODERATION_STATE = "blocked-by-moderation";

const BLOCKED_BY_VALIDATION_STATE = "blocked-by-validation";
const READY_FOR_REVIEW_STATE = "ready-for-review";

const FAILED_RETRYABLE_STATE = "failed-retryable";

const CANCELLED_DIAGNOSTIC_CODE = "GENERATION_CANCELLED";
const DRAFT_NOT_FOUND_MESSAGE = "The requested draft was not found.";

/**
Teacher-ready copy for a classroom whose standards table has no row for the
requested objective; the studio surfaces it verbatim (#168 P0-2).
*/
const CURRICULUM_STANDARD_NOT_CONFIGURED_MESSAGE =
  "This classroom has no curriculum target for that standard yet. Ask an admin to add it to your class, or try a different objective.";

const DEADLINE_DIAGNOSTIC_CODE = "GENERATION_DEADLINE_EXCEEDED";

export interface GenerationServiceOptions extends DraftAcceptanceOptions {
  persistence: GenerationPersistence;
  provider: LessonDraftProvider;
  safety?: ContentSafety;
  /**
  Blocks generation behind an incomplete or unreviewed source snapshot (#114).
  Optional: prompt-only requests never touch it.
  */
  sourceGate?: SourceGate;
  now?: () => string;
  clock?: () => number;
  deadlines?: Partial<GenerationDeadlines>;
  requestIdFactory?: () => string;
}

export interface GenerationCancellationCommand {
  actor: GenerationCommand["actor"];
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

const supportedStandardIds: ReadonlySet<string> = new Set([
  syntheticSeed.standard.id,
  syntheticSeed.standard.code,
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
    | "prompt"
    | "grade"
    | "standardId"
    | "language"
    | "difficulty"
    | "sourceSnapshotId"
  >,
  referents: {
    retryOfRequestId?: string;
    revisesRequestId?: string;
  } = {}
): string => {
  return `implicit-${hashForIdempotency(
    JSON.stringify({ ...input, ...referents })
  )}`;
};

// The delivery seam parses the body with `lessonGenerationInputSchema`; this
// function owns only what the schema cannot say: which grades and standards
// this product supports, and the derived idempotency key.
export const normalizeGenerationInput = (
  input: LessonGenerationInput
): NormalizedCommandInput => {
  const grade =
    typeof input.grade === "number" ? input.grade : Number(input.grade);
  if (!Number.isSafeInteger(grade) || grade < 3 || grade > 6) {
    throw new GenerationRequestError(GENERATION_INPUT_INVALID_MESSAGE, {
      code: "GENERATION_INPUT_INVALID",
    });
  }

  if (!supportedStandardIds.has(input.standardId)) {
    throw new GenerationRequestError(
      "This learning objective is not supported. Use Grade 4 equivalent fractions (4.NF.A.1).",
      { code: "GENERATION_INPUT_INVALID" }
    );
  }

  const standardId =
    input.standardId === syntheticSeed.standard.code
      ? syntheticSeed.standard.id
      : input.standardId;
  const difficulty: LessonDifficulty = input.difficulty ?? "on-level";
  const { retryOfRequestId, revisesRequestId } = input;
  const normalized = {
    prompt: input.prompt,
    grade,
    standardId,
    language: input.language,
    difficulty,
    ...(input.sourceSnapshotId && {
      sourceSnapshotId: input.sourceSnapshotId,
    }),
  };

  return {
    ...normalized,
    idempotencyKey:
      input.idempotencyKey ??
      createImplicitIdempotencyKey(normalized, {
        retryOfRequestId,
        revisesRequestId,
      }),
    requestHash: createGenerationRequestHash(normalized),
    ...(retryOfRequestId && { retryOfRequestId }),
    ...(revisesRequestId && { revisesRequestId }),
  };
};

const diagnostic = (code: string, message: string): GenerationDiagnostic => {
  return {
    severity: "error",
    code,
    message,
  };
};

/**
#132: one code for every local moderation block, plus the category the teacher
must revise. The rule set version stays out of the diagnostic: it is a server
detail and it would leak the rule fingerprint to the client.
*/
const moderationDiagnostic = (
  decision: ContentSafetyResult,
  message: string
): GenerationDiagnostic => {
  return {
    ...diagnostic(MODERATION_BLOCKED_CODE, message),
    ...(decision.category !== "none" && {
      moderationCategory: decision.category,
    }),
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

const assertTeacherCanGenerate = (actor: Actor): void => {
  if (actor.role !== "teacher") {
    // Defense-in-depth behind the delivery seam's own teacher resolution: an
    // authorization condition, so it uses the identity error contract.
    throw new IdentityError("FORBIDDEN");
  }
};

const requestMetadataKeys = [
  "prompt",
  "grade",
  "standardId",
  "language",
  "difficulty",
  "sourceSnapshotId",
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
    id: syntheticSeed.activityVersion.id,
    version: String(syntheticSeed.activityVersion.versionNumber),
    graphVersion: syntheticSeed.activityVersion.graphVersion,
    standardCode: syntheticSeed.standard.code,
    source: syntheticSeed.activityVersion.publicContent.source,
    targets: syntheticSeed.activityVersion.publicContent.targets,
    prompt: syntheticSeed.activityVersion.publicContent.prompt,
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
          gate: ArtifactGateSnapshot;
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
    if (outcome.state === READY_FOR_REVIEW_STATE && !outcome.gate) {
      throw new Error(
        "A ready-for-review generation record requires an artifact gate snapshot."
      );
    }
    const provenance = baseRecord.provenance ?? options.provider.provenance;
    const draft = "draft" in outcome ? outcome.draft : null;
    const record: LessonGenerationRecord = {
      ...baseRecord,
      state: outcome.state,
      diagnostics: outcome.diagnostics,
      draft,
      gate: "gate" in outcome ? outcome.gate : null,
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
    actorId: string,
    initialRecord: LessonGenerationRecord,
    input: NormalizedCommandInput
  ): Promise<LessonGenerationRecord> => {
    if (initialRecord.teacherId !== actorId) {
      throw new GenerationRequestError(DRAFT_NOT_FOUND_MESSAGE, {
        code: "DRAFT_NOT_FOUND",
      });
    }
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
        graphVersion: syntheticSeed.activityVersion.graphVersion,
      },
      options
    );
    if (acceptance.state !== READY_FOR_REVIEW_STATE) {
      return finishAttempt(baseRecord, acceptance);
    }

    return finishAttempt(baseRecord, {
      state: acceptance.state,
      diagnostics: acceptance.diagnostics,
      gate: acceptance.gate,
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
        // #148: the link is written with the new request, never with the
        // blocked one, so the blocked row stays byte-for-byte unchanged.
        ...(input.revisesRequestId && {
          revisesRequestId: input.revisesRequestId,
        }),
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
    const curriculum = resolveCurriculumContext(
      input,
      record.tenantId,
      options
    );

    let claim: GenerationClaim;
    try {
      claim = await options.persistence.claimGeneration(record);
    } catch (claimError) {
      if (claimError instanceof StandardNotConfiguredError) {
        throw new GenerationRequestError(
          CURRICULUM_STANDARD_NOT_CONFIGURED_MESSAGE,
          { code: "CURRICULUM_STANDARD_NOT_CONFIGURED" }
        );
      }
      throw claimError;
    }
    if (!claim.claimed) {
      const resolved = await resolveDuplicate(
        record.teacherId,
        claim.record,
        input
      );
      return resultFor(resolved);
    }
    ({ record } = claim);

    const promptDecision = safety.checkPrompt(input.prompt);
    if (!promptDecision.allowed) {
      const diagnostics = [
        moderationDiagnostic(
          promptDecision,
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

    const firstDecision = safety.checkGeneratedContent(
      firstOutcome.response.draft
    );
    if (!firstDecision.allowed) {
      const diagnostics = [
        moderationDiagnostic(
          firstDecision,
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

    const correctionDecision = safety.checkGeneratedContent(
      correctionOutcome.response.draft
    );
    if (!correctionDecision.allowed) {
      const diagnostics = [
        moderationDiagnostic(
          correctionDecision,
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

  const assertSourceReady = async (
    actor: GenerationCommand["actor"],
    sourceSnapshotId: string | undefined
  ): Promise<void> => {
    if (!sourceSnapshotId || !options.sourceGate) {
      return;
    }
    const resolution = await options.sourceGate.resolveForGeneration(
      { tenantId: actor.tenantId, teacherId: actor.actorId },
      sourceSnapshotId
    );
    if (!resolution.ok) {
      throw new GenerationRequestError(resolution.message, {
        code: "GENERATION_SOURCE_NOT_READY",
      });
    }
  };

  const runAttemptWithSourceUsage = async (
    baseRecord: LessonGenerationRecord,
    input: NormalizedCommandInput
  ): Promise<GenerationServiceResult> => {
    const result = await runAttempt(baseRecord, input);
    if (
      input.sourceSnapshotId &&
      options.sourceGate &&
      result.record.state === READY_FOR_REVIEW_STATE
    ) {
      try {
        await options.sourceGate.markUsed(
          result.record.tenantId,
          result.record.teacherId,
          input.sourceSnapshotId,
          now()
        );
      } catch {
        // Usage tracking must not fail an accepted draft; the hourly sweep
        // still expires the snapshot on its original 24-hour bound.
      }
    }
    return result;
  };

  // #148: a revision is a new request that names the blocked one. It never
  // reuses the blocked record, and its link stays out of the request hash, so
  // the moderated-hash guard remains the same-prompt refusal.
  const assertRevisionReferent = async (
    actor: GenerationCommand["actor"],
    input: NormalizedCommandInput
  ): Promise<void> => {
    if (!input.revisesRequestId) {
      return;
    }
    if (input.retryOfRequestId) {
      throw new GenerationRequestError(GENERATION_INPUT_INVALID_MESSAGE, {
        code: "GENERATION_INPUT_INVALID",
      });
    }
    const revisedRecord = await options.persistence.readGeneration(
      actor.tenantId,
      input.revisesRequestId
    );
    if (!revisedRecord || revisedRecord.teacherId !== actor.actorId) {
      throw new GenerationRequestError(DRAFT_NOT_FOUND_MESSAGE, {
        code: "DRAFT_NOT_FOUND",
      });
    }
    if (revisedRecord.state !== BLOCKED_BY_MODERATION_STATE) {
      throw new GenerationRequestError(
        "Only a moderation-blocked request can be revised.",
        { code: "DRAFT_NOT_RETRYABLE" }
      );
    }
    if (revisedRecord.input.prompt === input.prompt) {
      throw new GenerationRequestError(
        "A revision must change the lesson request.",
        { code: "MODERATION_REVISION_REQUIRED" }
      );
    }
  };

  return {
    async generate(
      command: GenerationCommand
    ): Promise<GenerationServiceResult> {
      assertTeacherCanGenerate(command.actor);
      const input = normalizeGenerationInput(command.input);
      await assertSourceReady(command.actor, input.sourceSnapshotId);
      const existing = await options.persistence.findGenerationByIdempotencyKey(
        command.actor.tenantId,
        command.actor.actorId,
        input.idempotencyKey
      );
      if (existing) {
        const resolved = await resolveDuplicate(
          command.actor.actorId,
          existing,
          input
        );
        return resultFor(resolved);
      }

      const moderated = await options.persistence.findModeratedGeneration(
        command.actor.tenantId,
        command.actor.actorId,
        input.requestHash
      );
      if (moderated) {
        throw new GenerationRequestError(
          "A previous request with the same lesson input was blocked by safety review. Revise the request before trying again.",
          { code: "MODERATION_REVISION_REQUIRED" }
        );
      }

      await assertRevisionReferent(command.actor, input);

      if (input.retryOfRequestId) {
        const retryRecord = await options.persistence.readGeneration(
          command.actor.tenantId,
          input.retryOfRequestId
        );
        if (!retryRecord || retryRecord.teacherId !== command.actor.actorId) {
          throw new GenerationRequestError(DRAFT_NOT_FOUND_MESSAGE, {
            code: "DRAFT_NOT_FOUND",
          });
        }
        // A retry that does not name a source inherits the original request's
        // reviewed source, so its metadata and hash stay comparable.
        let effectiveInput: NormalizedCommandInput = input;
        const inheritedSource = retryRecord.input.sourceSnapshotId;
        if (inheritedSource && !input.sourceSnapshotId) {
          effectiveInput = {
            ...input,
            sourceSnapshotId: inheritedSource,
            requestHash: createGenerationRequestHash({
              ...input,
              sourceSnapshotId: inheritedSource,
            }),
          };
        }
        await assertSourceReady(command.actor, effectiveInput.sourceSnapshotId);
        if (!isRetryableState(retryRecord.state)) {
          throw new GenerationRequestError(
            "This draft is not in a state that can be retried.",
            { code: "DRAFT_NOT_RETRYABLE" }
          );
        }
        if (!hasSameRequestMetadata(retryRecord.input, effectiveInput)) {
          throw new GenerationRequestError(
            "A retry must keep the original lesson request metadata.",
            { code: "RETRY_METADATA_MISMATCH" }
          );
        }
        return runAttemptWithSourceUsage(retryRecord, effectiveInput);
      }

      const timestamp = now();
      const record: LessonGenerationRecord = {
        requestId: requestIdFactory(),
        tenantId: command.actor.tenantId,
        teacherId: command.actor.actorId,
        input: {
          prompt: input.prompt,
          grade: input.grade,
          standardId: input.standardId,
          language: input.language,
          difficulty: input.difficulty,
          ...(input.sourceSnapshotId && {
            sourceSnapshotId: input.sourceSnapshotId,
          }),
          ...(input.revisesRequestId && {
            revisesRequestId: input.revisesRequestId,
          }),
        },
        state: "requested",
        attempt: 0,
        diagnostics: [],
        attempts: [],
        provenance: options.provider.provenance,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      return runAttemptWithSourceUsage(record, input);
    },

    async cancel(
      command: GenerationCancellationCommand
    ): Promise<GenerationServiceResult> {
      assertTeacherCanGenerate(command.actor);
      const record = await options.persistence.readGeneration(
        command.actor.tenantId,
        command.requestId
      );
      if (!record || record.teacherId !== command.actor.actorId) {
        throw new GenerationRequestError(DRAFT_NOT_FOUND_MESSAGE, {
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
