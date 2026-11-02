import { gradeMatching, matchingGradingRuleVersion } from "./grading";
import { buildReveal } from "./reveal";
import { buildDecisionDraft, firstStoredResponse, wasAssisted } from "./replay";
import type { MatchingGrade, SubmittedPair } from "./grading";
import type { Reveal } from "./reveal";
import type { RecordPersistence } from "@/server/persistence/records-commands";
import type { AssistanceState } from "@/server/records/vocabulary";
import type {
  NextActivity,
  NextActivityDraft,
} from "@/server/records/delivery";
import type { Actor } from "@/server/identity/types";

/**
 * #6: the learner runtime. Grading happens here, before the record write, so a client never carries a score and a rejected submission writes nothing. The record layer still owns the attempt, its receipt, and its run revision.
 *
 * #7: the same pass builds the reveal and the next-activity decision from
 * stored evidence. The decision is computed from the first response, so a
 * retry can add evidence without changing it.
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
  readonly reveal: Reveal;
  readonly nextActivity: NextActivity;
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

    const draft: NextActivityDraft = buildDecisionDraft({
      runId: input.runId,
      assignedActivityId: context.run.assignedVariantId,
      activities: context.activities.map((activity) => {
        return {
          activityId: activity.variantId,
          kind: activity.kind,
        };
      }),
      first: firstStoredResponse(context.attempts, context.section.itemIds) ?? {
        itemId: input.itemId,
        correctness: grade.correctness,
        assisted: wasAssisted(input),
        assistanceEventIds: input.assistanceEventIds,
      },
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
      nextActivity: draft,
    });

    const { approvedCopy } = context;
    const variantCopy =
      approvedCopy?.variants.find(
        (variant) => variant.variantId === context.run.assignedVariantId
      ) ?? null;
    const reveal = buildReveal({
      items: context.section.items ?? [],
      relationships: context.relationships,
      pairs: input.pairs,
      correctness: grade.correctness,
      feedback: variantCopy?.feedback ?? null,
      rationale: approvedCopy?.path.rationale ?? null,
      language: approvedCopy?.language ?? "en",
    });

    return {
      attemptId: written.id,
      gradingRuleVersion: matchingGradingRuleVersion,
      ...grade,
      reveal,
      nextActivity: context.run.nextActivity ?? {
        ...draft,
        derivedFromAttemptId: written.id,
      },
    };
  };

  return { submitAttempt };
};
