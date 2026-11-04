import { once } from "node:events";

import { createId } from "@/server/ids";

import {
  DEFAULT_RESOLUTION_DEADLINE_MS,
  GROUNDING_TEXT_LIMITS,
  StandardGroundingError,
  hashGroundingInput,
} from "./types";

import type { LearningCommonsAdapter } from "./learning-commons-rest";
import type { StandardGroundingRecord, StandardGroundingFacts } from "./types";
import type { StandardGroundingPersistence } from "../../persistence/standard-grounding-port";

export interface ResolveStandardGroundingCommand {
  readonly tenantId: string;
  readonly jurisdiction: string;
  readonly statementCode: string;
  /**
  A caller-scoped idempotency key. Repeating it with the same input returns the
  stored row; reusing it for a different standard is a correctable error.
  */
  readonly requestKey: string;
  readonly predecessorGroundingId?: string | null;
}

export interface StandardGroundingService {
  readonly resolve: (
    command: ResolveStandardGroundingCommand
  ) => Promise<StandardGroundingRecord>;
  readonly read: (
    tenantId: string,
    groundingId: string
  ) => Promise<StandardGroundingRecord | undefined>;
  readonly history: (
    tenantId: string,
    standard: { readonly jurisdiction: string; readonly statementCode: string }
  ) => Promise<readonly StandardGroundingRecord[]>;
}

export interface StandardGroundingServiceOptions {
  readonly persistence: StandardGroundingPersistence;
  readonly adapter: LearningCommonsAdapter;
  readonly now?: () => string;
  readonly createGroundingId?: () => string;
  readonly deadlineMs?: number;
}

const CURRENT_ISO = (): string => new Date().toISOString();

const invalidRequest = (message: string): StandardGroundingError => {
  return new StandardGroundingError(message, "invalid-request", {
    retryable: false,
    recovery: "correct-request",
  });
};

const idempotencyKeyReused = (): StandardGroundingError => {
  return new StandardGroundingError(
    "This request key was already used for a different standard.",
    "idempotency-key-reused",
    { retryable: false, recovery: "correct-request" }
  );
};

const persistenceConflict = (cause?: unknown): StandardGroundingError => {
  return new StandardGroundingError(
    "The standard grounding could not be stored without a conflict.",
    "persistence-conflict",
    { retryable: true, recovery: "retry", cause }
  );
};

const isNonEmpty = (value: unknown): value is string => {
  return typeof value === "string" && value.trim().length > 0;
};

const timeoutFailure = (): StandardGroundingError => {
  return new StandardGroundingError(
    "The Learning Commons retrieval exceeded its total deadline.",
    "resolution-timeout",
    { retryable: true, recovery: "retry" }
  );
};

const isRetryableFailure = (error: unknown): boolean => {
  return error instanceof StandardGroundingError && error.retryable;
};

/**
The resolver owns the retry. One total deadline covers both attempts and every
stage (standard → components → prerequisites). A caller cannot skip the retry
or ask for a third one: a retryable transport failure is retried exactly once,
and the second failure is the result the caller sees.
*/
const runWithOneRetry = async <T>(
  deadlineMs: number,
  work: (signal: AbortSignal) => Promise<T>
): Promise<{ readonly value: T; readonly attempts: 1 | 2 }> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  timer.unref?.();
  const aborted = Symbol("aborted");

  const runAttempt = async (
    attempt: 1 | 2
  ): Promise<{
    readonly value: T;
    readonly attempts: 1 | 2;
  }> => {
    if (controller.signal.aborted) {
      throw timeoutFailure();
    }
    try {
      const outcome = await Promise.race([
        work(controller.signal),
        once(controller.signal, "abort").then(() => aborted),
      ]);
      if (outcome === aborted) {
        throw timeoutFailure();
      }
      return { value: outcome as T, attempts: attempt };
    } catch (error) {
      if (attempt === 1 && isRetryableFailure(error)) {
        return await runAttempt(2);
      }
      throw error;
    }
  };

  try {
    return await runAttempt(1);
  } finally {
    clearTimeout(timer);
  }
};

interface ValidatedCommand {
  readonly tenantId: string;
  readonly jurisdiction: string;
  readonly statementCode: string;
  readonly requestKey: string;
  readonly inputHash: string;
}

const validateCommand = (
  command: ResolveStandardGroundingCommand
): ValidatedCommand => {
  if (!isNonEmpty(command.tenantId)) {
    throw invalidRequest("A tenant is required to resolve a standard.");
  }
  if (!isNonEmpty(command.jurisdiction)) {
    throw invalidRequest("A jurisdiction is required to resolve a standard.");
  }
  if (!isNonEmpty(command.statementCode)) {
    throw invalidRequest("A statement code is required to resolve a standard.");
  }
  if (!isNonEmpty(command.requestKey)) {
    throw invalidRequest("A request key is required to resolve a standard.");
  }
  if (command.statementCode.length > GROUNDING_TEXT_LIMITS.statementCode) {
    throw invalidRequest("The statement code is too long.");
  }

  const tenantId = command.tenantId.trim();
  const jurisdiction = command.jurisdiction.trim();
  const statementCode = command.statementCode.trim();
  const requestKey = command.requestKey.trim();
  return {
    tenantId,
    jurisdiction,
    statementCode,
    requestKey,
    inputHash: hashGroundingInput({ tenantId, jurisdiction, statementCode }),
  };
};

const resolvePredecessor = async (
  persistence: StandardGroundingPersistence,
  command: ValidatedCommand,
  explicitPredecessorId: string | null
): Promise<string | null> => {
  if (explicitPredecessorId === null) {
    const latest = await persistence.readLatestForStandard(command.tenantId, {
      jurisdiction: command.jurisdiction,
      statementCode: command.statementCode,
    });
    return latest?.id ?? null;
  }

  const predecessor = await persistence.read(
    command.tenantId,
    explicitPredecessorId
  );
  if (!predecessor) {
    throw invalidRequest("The previous grounding does not exist.");
  }
  return explicitPredecessorId;
};

const toRecord = (
  command: ValidatedCommand,
  resolution: Awaited<ReturnType<LearningCommonsAdapter["resolve"]>>,
  retrievalAttempt: 1 | 2,
  predecessorGroundingId: string | null,
  groundingId: string,
  createdAt: string
): StandardGroundingRecord => {
  const facts: StandardGroundingFacts = {
    registryVersion: resolution.registryVersion,
    frameworkId: resolution.frameworkId,
    jurisdiction: resolution.jurisdiction,
    statementCode: resolution.statementCode,
    subject: resolution.subject,
    grade: resolution.grade,
    standardId: resolution.standardId,
    description: resolution.description,
    components: resolution.components,
    prerequisites: resolution.prerequisites,
    prerequisiteResolution: resolution.prerequisiteResolution,
    gaps: resolution.gaps,
    provenance: resolution.provenance,
  };
  return {
    ...facts,
    id: groundingId,
    tenantId: command.tenantId,
    requestKey: command.requestKey,
    inputHash: command.inputHash,
    descriptionHash: resolution.descriptionHash,
    contentHash: resolution.contentHash,
    retrievalAttempt,
    retrievedAt: resolution.provenance.retrievedAt,
    predecessorGroundingId,
    createdAt,
  };
};

export const createStandardGroundingService = (
  options: StandardGroundingServiceOptions
): StandardGroundingService => {
  const { persistence, adapter } = options;
  const now = options.now ?? CURRENT_ISO;
  const createGroundingId = options.createGroundingId ?? createId;
  const deadlineMs = options.deadlineMs ?? DEFAULT_RESOLUTION_DEADLINE_MS;

  const resolve = async (
    command: ResolveStandardGroundingCommand
  ): Promise<StandardGroundingRecord> => {
    const validated = validateCommand(command);

    const existing = await persistence.readByRequestKey(
      validated.tenantId,
      validated.requestKey
    );
    if (existing) {
      if (existing.inputHash !== validated.inputHash) {
        throw idempotencyKeyReused();
      }
      return existing;
    }

    const predecessorGroundingId = await resolvePredecessor(
      persistence,
      validated,
      command.predecessorGroundingId ?? null
    );

    const { value: resolution, attempts } = await runWithOneRetry(
      deadlineMs,
      (signal) => {
        return adapter.resolve(
          {
            jurisdiction: validated.jurisdiction,
            statementCode: validated.statementCode,
          },
          { signal }
        );
      }
    );
    const record = toRecord(
      validated,
      resolution,
      attempts,
      predecessorGroundingId,
      createGroundingId(),
      now()
    );

    try {
      await persistence.insert(record);
      return record;
    } catch (error) {
      const stored = await persistence.readByRequestKey(
        validated.tenantId,
        validated.requestKey
      );
      if (stored) {
        if (stored.inputHash !== validated.inputHash) {
          throw idempotencyKeyReused();
        }
        return stored;
      }
      throw persistenceConflict(error);
    }
  };

  return {
    resolve,
    read: (tenantId, groundingId) => {
      return persistence.read(tenantId, groundingId);
    },
    history: (tenantId, standard) => {
      return persistence.history(tenantId, standard);
    },
  };
};
