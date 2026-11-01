import { gradeMatching, matchingGradingRuleVersion } from "./grading";
import type { MatchingGrade, SubmittedPair } from "./grading";
import type { RecordPersistence } from "@/server/persistence/records-commands";
import type { AssistanceState } from "@/server/records/vocabulary";
import type { Actor } from "@/server/identity/types";

/**
 * #6: the learner runtime. Grading happens here, before the record write, so a client never carries a score and a rejected submission writes nothing. The record layer still owns the attempt, its receipt, and its run revision.
 */
export interface SubmitAttemptInput {
  readonly operationKey: string;
  readonly runId: string;
  readonly itemId: string;
  readonly expectedRunRevision: number;
  readonly priorAttemptId: string | null;
  readonly pairs: readonly SubmittedPair[];
  readonly assistanceState: AssistanceState;
  readonly assistanceEventIds: readonly string[];
}

export interface SubmittedAttempt extends MatchingGrade {
  readonly attemptId: string;
  readonly gradingRuleVersion: string;
}

export interface LearnerService {
  readonly submitAttempt: (
    actor: Actor,
    input: SubmitAttemptInput
  ) => Promise<SubmittedAttempt>;
}

export const createLearnerService = (
  records: RecordPersistence
): LearnerService => {
  const submitAttempt = async (
    actor: Actor,
    input: SubmitAttemptInput
  ): Promise<SubmittedAttempt> => {
    const context = await records.readAttemptContext(actor, {
      runId: input.runId,
      itemId: input.itemId,
    });
    const grade = gradeMatching({
      pairs: input.pairs,
      relationships: context.relationships,
    });
    const written = await records.recordAttempt(actor, {
      operationKey: input.operationKey,
      runId: input.runId,
      itemId: input.itemId,
      expectedRunRevision: input.expectedRunRevision,
      priorAttemptId: input.priorAttemptId,
      selectedPairs: [...input.pairs],
      assistanceState: input.assistanceState,
      assistanceEventIds: [...input.assistanceEventIds],
      score: grade.score,
      correctness: grade.correctness,
      gradingRuleVersion: matchingGradingRuleVersion,
    });
    return {
      attemptId: written.id,
      gradingRuleVersion: matchingGradingRuleVersion,
      ...grade,
    };
  };

  return { submitAttempt };
};
