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
  /** `2` is the single teacher-requested retry; anything else is rejected. */
  readonly attempt?: number;
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

const retryExhausted = (): StandardGroundingError => {
  return new StandardGroundingError(
    "A retrieval allows one teacher-requested retry; this one is exhausted.",
    "retry-exhausted",
    { retryable: false, recovery: "none" }
  );
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

/**
One total deadline covers standard → components → prerequisites. The retry is
not an automatic second call; the teacher asks for it by sending `attempt: 2`,
and no third attempt is accepted.
*/
const runWithinDeadline = async <T>(
  deadlineMs: number,
  work: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  timer.unref?.();
  const aborted = Symbol("aborted");

  try {
    const outcome = await Promise.race([
      work(controller.signal),
      once(controller.signal, "abort").then(() => aborted),
    ]);
    if (outcome === aborted) {
      throw timeoutFailure();
    }
    return outcome as T;
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
  readonly attempt: 1 | 2;
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

  const attempt = command.attempt ?? 1;
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw invalidRequest("The retrieval attempt must be 1 or 2.");
  }
  if (attempt > 2) {
    throw retryExhausted();
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
    attempt: attempt === 2 ? 2 : 1,
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
    retrievalAttempt: command.attempt,
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

    const resolution = await runWithinDeadline(deadlineMs, (signal) => {
      return adapter.resolve(
        {
          jurisdiction: validated.jurisdiction,
          statementCode: validated.statementCode,
        },
        { signal }
      );
    });
    const record = toRecord(
      validated,
      resolution,
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
