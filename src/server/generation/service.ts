import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { lessonGenerationInputSchema } from "@/shared/generation-contract";

import { assertTenantAccess, canAccess } from "@/server/demo/policy";
import { demoSeed } from "@/server/seed-data";

import { GenerationInputError } from "./generation-input-error";
import { GenerationRequestError } from "./generation-request-error";

import { toPublicGenerationResult } from "./projection";

import { LessonProviderError, RATE_LIMIT_KIND } from "./provider";
import { reviewDraftForAcceptance } from "./draft-acceptance";
import { generationDuplicateWaitMs, isGenerationClaimExpired } from "./types";
import { validateProviderDraft } from "./validation";
import type { DraftAcceptanceOptions } from "./draft-acceptance";
import type {
  GenerationCommand,
  GenerationDiagnostic,
  GenerationPersistence,
  GenerationServiceResult,
  GenerationState,
  GenerationAttemptRecord,
  LessonGenerationRecord,
  ProviderLessonDraft,
  LessonDraft,
} from "./types";
import type {
  LessonDraftProvider,
  NormalizedGenerationRequest,
} from "./provider";
import type { LessonDifficulty } from "@/shared/generation-contract";

export { GenerationInputError } from "./generation-input-error";
export { GenerationRequestError } from "./generation-request-error";

const BLOCKED_BY_MODERATION_STATE = "blocked-by-moderation";

const BLOCKED_BY_VALIDATION_STATE = "blocked-by-validation";

const FAILED_RETRYABLE_STATE = "failed-retryable";

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
  requestIdFactory?: () => string;
}

interface NormalizedCommandInput extends NormalizedGenerationRequest {
  idempotencyKey: string;
  retryOfRequestId?: string;
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
    throw new GenerationInputError();
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

const assertTeacherCanGenerate = (command: GenerationCommand): void => {
  assertTenantAccess(command.session, demoSeed.tenant.id);
  if (
    command.session.role !== "teacher" ||
    command.session.identityId !== "identity_demo_teacher" ||
    !canAccess(command.session, "generate_lesson_draft")
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

export const createGenerationService = (options: GenerationServiceOptions) => {
  const safety = options.safety ?? createDefaultContentSafety();
  const now =
    options.now ??
    (() => {
      const date = new Date();
      return date.toISOString();
    });
  const requestIdFactory =
    options.requestIdFactory ?? (() => `draft_req_${randomUUID()}`);

  const persistOwned = async (
    record: LessonGenerationRecord,
    expectedUpdatedAt: string
  ): Promise<{ owned: boolean; record: LessonGenerationRecord }> => {
    const saved = await options.persistence.saveGeneration(record, {
      attempt: record.attempt,
      updatedAt: expectedUpdatedAt,
    });
    if (saved) {
      return { owned: true, record };
    }

    const current = await options.persistence.readGeneration(
      record.tenantId,
      record.requestId
    );
    if (!current) {
      throw new GenerationRequestError(
        "The generation attempt was superseded and could not be resolved."
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
    initialRecord: LessonGenerationRecord
  ): Promise<LessonGenerationRecord> => {
    let record = initialRecord;
    if (record.state === "generating" && !isGenerationClaimExpired(record)) {
      const deadline = Date.now() + generationDuplicateWaitMs;
      while (Date.now() < deadline) {
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

    if (!isGenerationClaimExpired(record)) {
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

  const runAttempt = async (
    baseRecord: LessonGenerationRecord,
    input: NormalizedCommandInput
  ): Promise<GenerationServiceResult> => {
    const attemptNumber = baseRecord.attempt + 1;
    const timestamp = now();
    const attempt: GenerationAttemptRecord = {
      attemptNumber,
      idempotencyKey: input.idempotencyKey,
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
    const claim = await options.persistence.claimGeneration(record);
    if (!claim.claimed) {
      const resolved = await resolveDuplicate(claim.record);
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

    let firstResponse: Awaited<ReturnType<LessonDraftProvider["generate"]>>;
    try {
      firstResponse = await options.provider.generate(input, {
        correctionAttempt: false,
        diagnostics: [],
      });
    } catch (error) {
      return persistProviderFailure(record, error);
    }

    if (!safety.checkGeneratedContent(firstResponse.draft).allowed) {
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

    const firstValidation = validateProviderDraft(firstResponse.draft, {
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

    let correctedResponse: Awaited<ReturnType<LessonDraftProvider["generate"]>>;
    try {
      correctedResponse = await options.provider.generate(input, {
        correctionAttempt: true,
        diagnostics: correctionDiagnostics,
      });
    } catch (error) {
      return persistProviderFailure(record, error, correctionDiagnostics);
    }

    if (!safety.checkGeneratedContent(correctedResponse.draft).allowed) {
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

    const correctedValidation = validateProviderDraft(correctedResponse.draft, {
      expectedLanguage: input.language,
    });
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
      assertTeacherCanGenerate(command);
      const input = normalizeGenerationInput(command.input);
      const existing = await options.persistence.findGenerationByIdempotencyKey(
        command.session.tenantId,
        input.idempotencyKey
      );
      if (existing) {
        const resolved = await resolveDuplicate(existing);
        return resultFor(resolved);
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
            "The requested draft was not found."
          );
        }
        if (!isRetryableState(retryRecord.state)) {
          throw new GenerationRequestError(
            "This draft is not in a state that can be retried."
          );
        }
        if (!hasSameRequestMetadata(retryRecord.input, input)) {
          throw new GenerationRequestError(
            "A retry must keep the original lesson request metadata."
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
  };
};
