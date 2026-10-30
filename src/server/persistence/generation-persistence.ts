import { generationClaimExpiredDiagnostic } from "../generation/types";
import type {
  GenerationAttemptRecord,
  GenerationClaim,
  GenerationDiagnostic,
  GenerationPersistence,
  GenerationWriteExpectation,
  LessonGenerationRecord,
} from "../generation/types";

export interface GenerationPersistenceBackend<TTransaction> {
  withTransaction: <T>(
    callback: (transaction: TTransaction) => Promise<T>
  ) => Promise<T>;
  withClaimSavepoint: <T>(
    transaction: TTransaction,
    callback: (transaction: TTransaction) => Promise<T>
  ) => Promise<T>;
  setTenant: (transaction: TTransaction, tenantId: string) => Promise<void>;
  insertRequest: (
    transaction: TTransaction,
    record: LessonGenerationRecord
  ) => Promise<void>;
  insertAttempt: (
    transaction: TTransaction,
    record: LessonGenerationRecord,
    attempt: GenerationAttemptRecord
  ) => Promise<{ requestId: string }[]>;
  updateRequest: (
    transaction: TTransaction,
    record: LessonGenerationRecord
  ) => Promise<void>;
  findClaimConflict: (
    transaction: TTransaction,
    record: LessonGenerationRecord,
    attempt: GenerationAttemptRecord
  ) => Promise<{ requestId: string }[]>;
  expireRequest: (
    transaction: TTransaction,
    tenantId: string,
    requestId: string,
    expectedUpdatedAt: string,
    updatedAt: string,
    diagnostics: GenerationDiagnostic[]
  ) => Promise<{ attempt: number } | undefined>;
  expireAttempt: (
    transaction: TTransaction,
    tenantId: string,
    requestId: string,
    attemptNumber: number,
    diagnostics: GenerationDiagnostic[]
  ) => Promise<boolean>;
  updateRequestWithExpectation: (
    transaction: TTransaction,
    record: LessonGenerationRecord,
    expected: GenerationWriteExpectation
  ) => Promise<boolean>;
  upsertAttempt: (
    transaction: TTransaction,
    record: LessonGenerationRecord,
    attempt: GenerationAttemptRecord
  ) => Promise<void>;
  findGenerationByIdempotencyKey: (
    tenantId: string,
    teacherId: string,
    idempotencyKey: string
  ) => Promise<LessonGenerationRecord | undefined>;
  findModeratedGeneration: (
    tenantId: string,
    teacherId: string,
    requestHash: string
  ) => Promise<LessonGenerationRecord | undefined>;
  readGeneration: (
    tenantId: string,
    requestId: string
  ) => Promise<LessonGenerationRecord | undefined>;
}

class ClaimConflictSignalError extends Error {
  constructor() {
    super("The generation claim conflicted with an existing attempt.");
    this.name = "ClaimConflictSignalError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isUniqueViolation = (error: unknown): boolean => {
  return (
    isRecord(error) &&
    (error.code === "23505" ||
      ("cause" in error && isUniqueViolation(error.cause)))
  );
};

export const createGenerationPersistence = <TTransaction>(
  backend: GenerationPersistenceBackend<TTransaction>
): GenerationPersistence => {
  return {
    async claimGeneration(record): Promise<GenerationClaim> {
      const attempt = record.attempts.at(-1);
      if (!attempt) {
        throw new Error("A generation claim requires an attempt.");
      }

      const claim = await backend.withTransaction(async (transaction) => {
        await backend.setTenant(transaction, record.tenantId);

        try {
          return await backend.withClaimSavepoint(
            transaction,
            async (claimTransaction) => {
              await backend.insertRequest(claimTransaction, record);
              const insertedAttempts = await backend.insertAttempt(
                claimTransaction,
                record,
                attempt
              );

              if (insertedAttempts.length === 0) {
                throw new ClaimConflictSignalError();
              }

              await backend.updateRequest(claimTransaction, record);
              return { claimed: true, requestId: record.requestId };
            }
          );
        } catch (error) {
          if (
            !isUniqueViolation(error) &&
            !(error instanceof ClaimConflictSignalError)
          ) {
            throw error;
          }

          const conflicts = await backend.findClaimConflict(
            transaction,
            record,
            attempt
          );
          if (conflicts.length === 0) {
            throw error;
          }

          return {
            claimed: false,
            requestId: conflicts[0].requestId,
          };
        }
      });

      if (claim.claimed) {
        return { claimed: true, record };
      }

      const existing = await backend.readGeneration(
        record.tenantId,
        claim.requestId
      );
      if (!existing) {
        throw new Error(
          "The generation idempotency claim could not be resolved."
        );
      }

      return { claimed: false, record: existing };
    },

    async expireGenerationClaim(
      tenantId,
      requestId,
      expectedUpdatedAt,
      updatedAt
    ) {
      const diagnostics = [generationClaimExpiredDiagnostic()];
      const expired = await backend.withTransaction(async (transaction) => {
        await backend.setTenant(transaction, tenantId);

        const request = await backend.expireRequest(
          transaction,
          tenantId,
          requestId,
          expectedUpdatedAt,
          updatedAt,
          diagnostics
        );
        if (!request) {
          return false;
        }

        const attemptUpdated = await backend.expireAttempt(
          transaction,
          tenantId,
          requestId,
          request.attempt,
          diagnostics
        );
        if (!attemptUpdated) {
          throw new Error(
            "The expired generation claim has no matching attempt history."
          );
        }

        return true;
      });

      return expired ? backend.readGeneration(tenantId, requestId) : undefined;
    },

    saveGeneration: (record, expected) => {
      return backend.withTransaction(async (transaction) => {
        await backend.setTenant(transaction, record.tenantId);

        const updated = await backend.updateRequestWithExpectation(
          transaction,
          record,
          expected
        );
        if (!updated) {
          return false;
        }

        for (const attempt of record.attempts) {
          // Attempt history must be written in order on one transaction
          // connection, so the writes stay sequential.
          // eslint-disable-next-line no-await-in-loop
          await backend.upsertAttempt(transaction, record, attempt);
        }
        return true;
      });
    },

    findGenerationByIdempotencyKey: (tenantId, teacherId, idempotencyKey) => {
      return backend.findGenerationByIdempotencyKey(
        tenantId,
        teacherId,
        idempotencyKey
      );
    },

    findModeratedGeneration: (tenantId, teacherId, requestHash) =>
      backend.findModeratedGeneration(tenantId, teacherId, requestHash),

    readGeneration: (tenantId, requestId) =>
      backend.readGeneration(tenantId, requestId),
  };
};
