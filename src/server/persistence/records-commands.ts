import { capabilitiesForRole } from "../identity/types";
import { createId } from "../ids";
import {
  curatedReferenceSchema,
  hasExactlyOneReference,
  lessonVersionSchema,
  publicationSchema,
} from "../records/authoring";
import {
  assignmentSchema,
  assistanceEventSchema,
  learnerAttemptSchema,
  learnerRunSchema,
  teacherDecisionSchema,
} from "../records/delivery";
import { recordError } from "../records/errors";
import { canonicalJson } from "../records/canonical-json";
import {
  createContentHash,
  createCuratedContentHash,
  createEvidenceHash,
  createInputHash,
  createPackageHash,
  createPrivateAnswerDigest,
  createValidationResultHash,
} from "../records/hashes";
import {
  appendCurrentHead,
  readAttemptContextInputSchema,
  readAuthoringInputSchema,
  readEvidenceInputSchema,
  readLessonInputSchema,
  writeInputSchemas,
} from "../records/inputs";
import {
  evidenceAssistanceEvents,
  evidenceAttempts,
  projectStudentEvidence,
  projectStudentLesson,
  projectTeacherEvidence,
  projectTeacherVersion,
} from "../records/projections";
import { decideReceipt, withoutOperationKey } from "./receipt";
import { RecordUniqueViolationError } from "./records-port";
import type {
  AppendVersionInput,
  AssignInput,
  ChooseInput,
  PublishInput,
  ReadAttemptContextInput,
  ReadAuthoringInput,
  ReadEvidenceInput,
  ReadLessonInput,
  RecordAttemptInput,
  RecordHintInput,
  StartRunInput,
  StoreGroundingInput,
  WriteAction,
} from "../records/inputs";
import type {
  StudentEvidenceProjection,
  StudentLessonProjection,
  TeacherEvidenceProjection,
  TeacherVersionProjection,
} from "../records/projections";
import type {
  Assignment,
  AssistanceEvent,
  LearnerAttempt,
  LearnerRun,
  TeacherDecision,
} from "../records/delivery";
import type { LessonVersion, Publication } from "../records/authoring";
import type { PrivateAnswerRelationship } from "../records/private-answers";
import type { Actor, Capability } from "../identity/types";
import type { RecordBackend, RecordTableName, StoredRow } from "./records-port";
import type { z } from "zod";

export interface RecordMutationResult {
  readonly id: string;
}

export interface AuthoringPackageProjection {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly standardId: string;
  readonly headRevision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AuthoringProjection {
  readonly package: AuthoringPackageProjection;
  readonly versions: readonly TeacherVersionProjection[];
}

export interface LessonReadResult {
  readonly lesson: StudentLessonProjection;
  readonly evidence: StudentEvidenceProjection;
  readonly runRevision: number;
}

/**
 * #6: the server-only facts a grader needs for one item. The answer
 * relationships never leave the server, and the run revision pins the write.
 */
export interface AttemptContext {
  readonly runId: string;
  readonly runRevision: number;
  readonly itemId: string;
  readonly relationships: readonly PrivateAnswerRelationship[];
}

/**
The record model's command surface. Each method takes the input type its own schema declares, so a caller builds a valid input or fails to compile.

The implementation still parses at the store edge. A TypeScript type is erased at runtime, and this module is the last software gate before SQL, so the parse is the guard rather than a duplicate of the caller's check.
*/
export interface RecordPersistence {
  readonly kind: "seeded-demo" | "postgres";
  check: () => Promise<boolean>;
  storeGrounding: (
    actor: Actor,
    input: StoreGroundingInput
  ) => Promise<RecordMutationResult>;
  appendVersion: (
    actor: Actor,
    input: AppendVersionInput
  ) => Promise<RecordMutationResult>;
  publish: (actor: Actor, input: PublishInput) => Promise<RecordMutationResult>;
  assign: (actor: Actor, input: AssignInput) => Promise<RecordMutationResult>;
  startRun: (
    actor: Actor,
    input: StartRunInput
  ) => Promise<RecordMutationResult>;
  recordHint: (
    actor: Actor,
    input: RecordHintInput
  ) => Promise<RecordMutationResult>;
  recordAttempt: (
    actor: Actor,
    input: RecordAttemptInput
  ) => Promise<RecordMutationResult>;
  choose: (actor: Actor, input: ChooseInput) => Promise<RecordMutationResult>;
  readAuthoring: (
    actor: Actor,
    input: ReadAuthoringInput
  ) => Promise<AuthoringProjection>;
  readEvidence: (
    actor: Actor,
    input: ReadEvidenceInput
  ) => Promise<TeacherEvidenceProjection>;
  readLesson: (
    actor: Actor,
    input: ReadLessonInput
  ) => Promise<LessonReadResult>;
  readAttemptContext: (
    actor: Actor,
    input: ReadAttemptContextInput
  ) => Promise<AttemptContext>;
}

const writeCapability: Record<WriteAction, Capability> = {
  "store-grounding": "generate",
  "append-version": "generate",
  publish: "publish",
  assign: "publish",
  "start-run": "read_assignment",
  "record-hint": "submit_attempt",
  "record-attempt": "submit_attempt",
  choose: "teacher_decision",
};

const learnerActions: ReadonlySet<WriteAction> = new Set([
  "start-run",
  "record-hint",
  "record-attempt",
]);

// #6: the default retry allowance for one matching item.
const attemptLimitPerItem = 3;

const nowIso = (): string => {
  const now = new Date();
  return now.toISOString();
};

const toIso = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const parseOrThrow = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw recordError("INVALID_INPUT");
  }
  return parsed.data;
};

const hydrate = <T>(parse: () => T): T => {
  try {
    return parse();
  } catch (error) {
    throw recordError("PERSISTENCE_UNAVAILABLE", { cause: error });
  }
};

const isNullOrUndefined = (value: unknown): boolean =>
  value === null || value === undefined;

const assertCapability = (actor: Actor, action: WriteAction): void => {
  const capability = writeCapability[action];
  if (!capabilitiesForRole(actor.role).includes(capability)) {
    throw recordError("FORBIDDEN");
  }
  const isWantsLearner = learnerActions.has(action);
  if (isWantsLearner && actor.role !== "student") {
    throw recordError("FORBIDDEN");
  }
  if (!isWantsLearner && actor.role !== "teacher") {
    throw recordError("FORBIDDEN");
  }
};

const mapStorageError = (error: unknown): unknown => {
  if (!(error instanceof RecordUniqueViolationError)) {
    return error;
  }
  if (error.constraint.includes("operation_receipts_actor_action_key")) {
    return recordError("IDEMPOTENCY_CONFLICT", { cause: error });
  }
  if (
    error.constraint.includes("lesson_versions_package_id_revision") ||
    error.constraint.includes("learner_attempts_run_item_ordinal") ||
    error.constraint.includes("assistance_events_run_item_ordinal")
  ) {
    return recordError("STALE_VERSION", { cause: error });
  }
  return error.constraint.includes(
    "publications_tenant_id_lesson_version_id"
  ) || error.constraint.includes("learner_runs_tenant_id_assignment_id")
    ? recordError("IDEMPOTENCY_CONFLICT", { cause: error })
    : error;
};

const packageProjection = (row: StoredRow): AuthoringPackageProjection => {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    title: row.title as string,
    standardId: row.standard_id as string,
    headRevision: row.head_revision as number,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
};

const mapVersion = (row: StoredRow): LessonVersion => {
  return hydrate(() => {
    return lessonVersionSchema.parse({
      id: row.id,
      tenantId: row.tenant_id,
      packageId: row.package_id,
      revision: row.revision,
      schemaVersion: row.schema_version,
      parentVersionId: row.parent_version_id ?? null,
      predecessorVersionId: row.predecessor_version_id ?? null,
      curatedReferenceId: row.curated_reference_id ?? null,
      sourceSnapshotId: row.source_snapshot_id ?? null,
      generationRequestId: row.generation_request_id ?? null,
      conceptIds: row.concept_ids,
      variantReferences: row.variant_references,
      objectiveHash: row.objective_hash,
      sections: row.sections,
      provenance: row.provenance,
      revisionKind: row.revision_kind,
      changedSectionIds: row.changed_section_ids,
      contentHash: row.content_hash,
      packageHash: row.package_hash,
      privateAnswerDigest: row.private_answer_digest,
      privateAnswerRelationships: row.private_answer_relationships,
      validationResult: row.validation_result,
      validationResultHash: row.validation_result_hash,
      ruleVersions: row.rule_versions,
      createdAt: toIso(row.created_at),
    });
  });
};

const mapPublication = (row: StoredRow): Publication => {
  return hydrate(() => {
    return publicationSchema.parse({
      id: row.id,
      tenantId: row.tenant_id,
      schemaVersion: row.schema_version,
      lessonVersionId: row.lesson_version_id,
      approvingActorId: row.approving_actor_id,
      contentHash: row.content_hash,
      packageHash: row.package_hash,
      privateAnswerDigest: row.private_answer_digest,
      validationResultHash: row.validation_result_hash,
      ruleVersions: row.rule_versions,
      approvedAt: toIso(row.approved_at),
      createdAt: toIso(row.created_at),
    });
  });
};

const mapAssignment = (row: StoredRow): Assignment => {
  return hydrate(() => {
    return assignmentSchema.parse({
      id: row.id,
      tenantId: row.tenant_id,
      schemaVersion: row.schema_version,
      publicationId: row.publication_id,
      learnerId: row.learner_id,
      assigningActorId: row.assigning_actor_id,
      createdAt: toIso(row.created_at),
    });
  });
};

const mapRun = (row: StoredRow): LearnerRun => {
  return hydrate(() => {
    return learnerRunSchema.parse({
      id: row.id,
      tenantId: row.tenant_id,
      schemaVersion: row.schema_version,
      assignmentId: row.assignment_id,
      learnerId: row.learner_id,
      publicationId: row.publication_id,
      assignedVariantId: row.assigned_variant_id,
      stage: row.stage,
      firstResponseStatus: row.first_response_status,
      revision: row.revision,
      nextActivity: row.next_activity ?? null,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    });
  });
};

const mapAssistance = (row: StoredRow): AssistanceEvent => {
  return hydrate(() => {
    return assistanceEventSchema.parse({
      id: row.id,
      tenantId: row.tenant_id,
      schemaVersion: row.schema_version,
      runId: row.run_id,
      itemId: row.item_id,
      kind: row.kind,
      ordinal: row.ordinal,
      recordedAt: toIso(row.recorded_at),
    });
  });
};

const mapAttempt = (row: StoredRow): LearnerAttempt => {
  return hydrate(() => {
    return learnerAttemptSchema.parse({
      id: row.id,
      tenantId: row.tenant_id,
      schemaVersion: row.schema_version,
      runId: row.run_id,
      publicationId: row.publication_id,
      lessonVersionId: row.lesson_version_id,
      itemId: row.item_id,
      ordinal: row.ordinal,
      priorAttemptId: row.prior_attempt_id ?? null,
      selectedPairs: row.selected_pairs,
      assistanceState: row.assistance_state,
      assistanceEventIds: row.assistance_event_ids,
      score: row.score,
      correctness: row.correctness,
      gradingRuleVersion: row.grading_rule_version,
      createdAt: toIso(row.created_at),
    });
  });
};

const mapDecision = (row: StoredRow): TeacherDecision => {
  return hydrate(() => {
    return teacherDecisionSchema.parse({
      id: row.id,
      tenantId: row.tenant_id,
      schemaVersion: row.schema_version,
      runId: row.run_id,
      teacherActorId: row.teacher_actor_id,
      evidenceHash: row.evidence_hash,
      proposal: row.proposal,
      action: row.action,
      approvedTargetId: row.approved_target_id ?? null,
      createdAt: toIso(row.created_at),
    });
  });
};

interface AppendHead {
  readonly headRevision: number;
  readonly headVersionId: string | null;
}

interface AppendLineage {
  readonly expectedHeadRevision: number;
  readonly revisionKind: NonNullable<AppendVersionInput["revisionKind"]>;
  readonly parentVersionId: string | null;
}

/**
A stated revision must match the head; a current-head append adopts it. Either way the row records an ordinal, a kind, and a parent that are true of the chain at the moment of the write, and the caller that owns no stale-read expectation does not have to guess them.
*/
const resolveAppendLineage = (
  input: AppendVersionInput,
  head: AppendHead
): AppendLineage => {
  if (input.expectedHeadRevision === appendCurrentHead) {
    return {
      expectedHeadRevision: head.headRevision,
      revisionKind: head.headRevision === 0 ? "initial" : "section-revision",
      parentVersionId: head.headVersionId,
    };
  }
  if (input.expectedHeadRevision !== head.headRevision) {
    throw recordError("STALE_VERSION");
  }
  return {
    expectedHeadRevision: head.headRevision,
    revisionKind: input.revisionKind ?? "initial",
    parentVersionId: input.parentVersionId ?? null,
  };
};

const collectItemIds = (version: LessonVersion): Set<string> => {
  const items = new Set<string>();
  for (const section of version.sections) {
    for (const itemId of section.itemIds) {
      items.add(itemId);
    }
  }
  return items;
};

export interface RecordCommandsOptions {
  readonly clock?: () => string;
}

export const createRecordCommands = <TTransaction>(
  backend: RecordBackend<TTransaction>,
  options: RecordCommandsOptions = {}
): RecordPersistence => {
  const clock = options.clock ?? nowIso;

  const findOne = (
    transaction: TTransaction,
    table: RecordTableName,
    where: Readonly<Record<string, string | number | boolean | null>>
  ): Promise<StoredRow | undefined> =>
    backend.findOne(transaction, table, where);

  const requireRow = async (
    transaction: TTransaction,
    table: RecordTableName,
    where: Readonly<Record<string, string | number | boolean | null>>
  ): Promise<StoredRow> => {
    const row = await findOne(transaction, table, where);
    if (!row) {
      throw recordError("FORBIDDEN");
    }
    return row;
  };

  const verifyActorContext = async (
    transaction: TTransaction,
    actor: Actor
  ): Promise<void> => {
    const actorRow = await findOne(transaction, "actors", {
      id: actor.actorId,
    });
    if (!actorRow || actorRow.is_active !== true) {
      throw recordError("FORBIDDEN");
    }
    if (actorRow.authorization_revision !== actor.authorizationRevision) {
      throw recordError("FORBIDDEN");
    }

    const membership = await findOne(transaction, "memberships", {
      id: actor.membershipId,
      tenant_id: actor.tenantId,
    });
    if (
      !membership ||
      membership.status !== "active" ||
      membership.actor_id !== actor.actorId ||
      membership.role !== actor.role
    ) {
      throw recordError("FORBIDDEN");
    }
    if (actor.role === "student" && membership.learner_id !== actor.learnerId) {
      throw recordError("FORBIDDEN");
    }

    const session = await findOne(transaction, "identity_sessions", {
      session_id: actor.sessionId,
      tenant_id: actor.tenantId,
    });
    if (
      !session ||
      session.actor_id !== actor.actorId ||
      session.membership_id !== actor.membershipId ||
      !isNullOrUndefined(session.revoked_at)
    ) {
      throw recordError("FORBIDDEN");
    }
    const expiresAt = Date.parse(toIso(session.absolute_expires_at));
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw recordError("FORBIDDEN");
    }
  };

  const runWrite = async <TInput extends { operationKey: string }>(
    actor: Actor,
    action: WriteAction,
    submitted: object,
    perform: (
      transaction: TTransaction,
      input: TInput
    ) => Promise<{
      readonly resultKind: string;
      readonly resultIds: readonly string[];
    }>
  ): Promise<RecordMutationResult> => {
    if (!actor) {
      throw recordError("UNAUTHENTICATED");
    }
    const parsed = writeInputSchemas[action].safeParse(submitted);
    if (!parsed.success) {
      throw recordError("INVALID_INPUT", { cause: parsed.error });
    }
    const input = parsed.data as unknown as TInput;
    const inputHash = createInputHash(withoutOperationKey(input));

    try {
      return await backend.withTransaction(async (transaction) => {
        await backend.setTenant(transaction, actor.tenantId);
        await verifyActorContext(transaction, actor);
        assertCapability(actor, action);

        const receipt = await findOne(transaction, "operation_receipts", {
          tenant_id: actor.tenantId,
          actor_id: actor.actorId,
          action,
          operation_key: input.operationKey,
        });
        const decision = decideReceipt(
          receipt
            ? {
                inputHash: String(receipt.input_hash),
                resultIds: receipt.result_ids as readonly string[],
              }
            : undefined,
          inputHash
        );
        if (decision.outcome === "conflict") {
          throw recordError("IDEMPOTENCY_CONFLICT", {
            cause: { action, operationKey: input.operationKey },
          });
        }
        if (decision.outcome === "replay") {
          const [first] = decision.resultIds;
          if (typeof first !== "string") {
            throw recordError("PERSISTENCE_UNAVAILABLE");
          }
          return { id: first };
        }

        const result = await perform(transaction, input);
        await backend.insert(transaction, "operation_receipts", {
          id: createId(),
          tenant_id: actor.tenantId,
          schema_version: "operation-receipt-v1",
          actor_id: actor.actorId,
          membership_id: actor.membershipId,
          authorization_revision: actor.authorizationRevision,
          action,
          operation_key: input.operationKey,
          input_hash: inputHash,
          result_kind: result.resultKind,
          result_ids: [...result.resultIds],
          created_at: clock(),
        });
        const [first] = result.resultIds;
        if (typeof first !== "string") {
          throw recordError("PERSISTENCE_UNAVAILABLE");
        }
        return { id: first };
      });
    } catch (error) {
      throw mapStorageError(error);
    }
  };

  const read = async <T>(
    actor: Actor,
    capability: Capability,
    work: (transaction: TTransaction) => Promise<T>
  ): Promise<T> => {
    if (!actor) {
      throw recordError("UNAUTHENTICATED");
    }
    if (!capabilitiesForRole(actor.role).includes(capability)) {
      throw recordError("FORBIDDEN");
    }
    try {
      return await backend.withTransaction(async (transaction) => {
        await backend.setTenant(transaction, actor.tenantId);
        await verifyActorContext(transaction, actor);
        return await work(transaction);
      });
    } catch (error) {
      throw mapStorageError(error);
    }
  };

  const loadVersion = async (
    transaction: TTransaction,
    versionId: string,
    tenantId: string
  ): Promise<LessonVersion> => {
    const row = await requireRow(transaction, "lesson_versions", {
      tenant_id: tenantId,
      id: versionId,
    });
    return mapVersion(row);
  };

  const requireOwnedPackage = async (
    transaction: TTransaction,
    actor: Actor,
    packageId: string
  ): Promise<StoredRow> => {
    const row = await findOne(transaction, "lesson_packages", {
      tenant_id: actor.tenantId,
      id: packageId,
    });
    if (!row || row.teacher_actor_id !== actor.actorId) {
      throw recordError("FORBIDDEN");
    }
    return row;
  };

  const requireRunForLearner = async (
    transaction: TTransaction,
    actor: Actor,
    runId: string
  ): Promise<{ run: LearnerRun; row: StoredRow }> => {
    const row = await requireRow(transaction, "learner_runs", {
      tenant_id: actor.tenantId,
      id: runId,
    });
    const run = mapRun(row);
    if (actor.role !== "student" || run.learnerId !== actor.learnerId) {
      throw recordError("FORBIDDEN");
    }
    return { run, row };
  };

  const requirePublication = async (
    transaction: TTransaction,
    tenantId: string,
    publicationId: string
  ): Promise<Publication> => {
    const row = await requireRow(transaction, "publications", {
      tenant_id: tenantId,
      id: publicationId,
    });
    return mapPublication(row);
  };

  const advanceRun = async (
    transaction: TTransaction,
    run: LearnerRun,
    expectedRevision: number,
    patch: Readonly<Record<string, string | null | { targetId: string }>>
  ): Promise<void> => {
    const affected = await backend.update(
      transaction,
      "learner_runs",
      { tenant_id: run.tenantId, id: run.id, revision: expectedRevision },
      {
        ...patch,
        revision: expectedRevision + 1,
        updated_at: clock(),
      }
    );
    if (affected !== 1) {
      throw recordError("STALE_VERSION");
    }
  };

  const storeGrounding = (
    actor: Actor,
    submitted: StoreGroundingInput
  ): Promise<RecordMutationResult> => {
    return runWrite<StoreGroundingInput>(
      actor,
      "store-grounding",
      submitted,
      async (transaction, input) => {
        await requireRow(transaction, "standards", {
          tenant_id: actor.tenantId,
          id: input.standardId,
        });

        const curated = curatedReferenceSchema.parse({
          id: createId(),
          tenantId: actor.tenantId,
          teacherActorId: actor.actorId,
          schemaVersion: "curated-reference-v1",
          kind: "curated",
          standardId: input.standardId,
          referenceKey: input.referenceKey,
          referenceVersion: input.referenceVersion,
          title: input.title,
          attribution: input.attribution,
          sourceLocator: input.sourceLocator,
          reviewedContent: input.reviewedContent,
          contentHash: createCuratedContentHash({
            standardId: input.standardId,
            referenceKey: input.referenceKey,
            referenceVersion: input.referenceVersion,
            reviewedContent: input.reviewedContent,
          }),
          createdAt: clock(),
        });

        await backend.insert(transaction, "curated_references", {
          id: curated.id,
          tenant_id: curated.tenantId,
          teacher_actor_id: curated.teacherActorId,
          schema_version: curated.schemaVersion,
          kind: curated.kind,
          standard_id: curated.standardId,
          reference_key: curated.referenceKey,
          reference_version: curated.referenceVersion,
          title: curated.title,
          attribution: curated.attribution,
          source_locator: curated.sourceLocator,
          reviewed_content: curated.reviewedContent,
          content_hash: curated.contentHash,
          created_at: curated.createdAt,
        });

        return { resultKind: "curated-reference", resultIds: [curated.id] };
      }
    );
  };

  const assertAppendPackage = async (
    transaction: TTransaction,
    actor: Actor,
    input: AppendVersionInput
  ): Promise<AppendHead> => {
    await requireRow(transaction, "standards", {
      tenant_id: actor.tenantId,
      id: input.package.standardId,
    });

    const packageRow = await findOne(transaction, "lesson_packages", {
      tenant_id: actor.tenantId,
      id: input.package.id,
    });
    if (packageRow) {
      if (
        packageRow.teacher_actor_id !== actor.actorId ||
        packageRow.standard_id !== input.package.standardId
      ) {
        throw recordError("FORBIDDEN");
      }
      const headRevision = Number(packageRow.head_revision);
      const headRow = await findOne(transaction, "lesson_versions", {
        tenant_id: actor.tenantId,
        package_id: input.package.id,
        revision: headRevision,
      });
      return {
        headRevision,
        headVersionId: headRow ? String(headRow.id) : null,
      };
    }
    if (
      input.expectedHeadRevision !== 0 &&
      input.expectedHeadRevision !== appendCurrentHead
    ) {
      throw recordError("STALE_VERSION");
    }
    await backend.insert(transaction, "lesson_packages", {
      id: input.package.id,
      tenant_id: actor.tenantId,
      teacher_actor_id: actor.actorId,
      standard_id: input.package.standardId,
      title: input.package.title,
      head_revision: 0,
      created_at: clock(),
      updated_at: clock(),
    });
    return { headRevision: 0, headVersionId: null };
  };

  const assertCuratedReference = async (
    transaction: TTransaction,
    actor: Actor,
    curatedReferenceId: string,
    standardId: string
  ): Promise<void> => {
    const curatedRow = await requireRow(transaction, "curated_references", {
      tenant_id: actor.tenantId,
      id: curatedReferenceId,
    });
    if (curatedRow.teacher_actor_id !== actor.actorId) {
      throw recordError("FORBIDDEN");
    }
    if (curatedRow.standard_id !== standardId) {
      throw recordError("FORBIDDEN");
    }
  };

  const assertSourceSnapshot = async (
    transaction: TTransaction,
    actor: Actor,
    sourceSnapshotId: string,
    standardId: string
  ): Promise<void> => {
    const snapshot = await requireRow(transaction, "source_snapshots", {
      tenant_id: actor.tenantId,
      id: sourceSnapshotId,
    });
    if (snapshot.teacher_id !== actor.actorId) {
      throw recordError("FORBIDDEN");
    }
    if (snapshot.standard_id !== standardId) {
      throw recordError("FORBIDDEN");
    }
    const hasReviewedSource =
      snapshot.state === "complete" && snapshot.reviewed_at !== null;
    if (!hasReviewedSource) {
      throw recordError("FORBIDDEN");
    }
  };

  const assertVersionReferences = async (
    transaction: TTransaction,
    actor: Actor,
    input: AppendVersionInput
  ): Promise<void> => {
    if (!hasExactlyOneReference(input)) {
      throw recordError("INVALID_INPUT");
    }

    if (input.curatedReferenceId) {
      await assertCuratedReference(
        transaction,
        actor,
        input.curatedReferenceId,
        input.package.standardId
      );
    }

    if (input.sourceSnapshotId) {
      await assertSourceSnapshot(
        transaction,
        actor,
        input.sourceSnapshotId,
        input.package.standardId
      );
    }

    if (input.generationRequestId) {
      const request = await requireRow(transaction, "lesson_draft_requests", {
        tenant_id: actor.tenantId,
        id: input.generationRequestId,
      });
      if (request.teacher_id !== actor.actorId) {
        throw recordError("FORBIDDEN");
      }
    }

    for (const conceptId of input.conceptIds) {
      // Sequential reads keep the transaction ordered and stop at the first foreign referent.
      // eslint-disable-next-line no-await-in-loop
      const concept = await requireRow(transaction, "prerequisite_nodes", {
        tenant_id: actor.tenantId,
        id: conceptId,
      });
      if (concept.standard_id !== input.package.standardId) {
        throw recordError("FORBIDDEN");
      }
    }

    for (const edit of input.provenance.authoredEdits) {
      // eslint-disable-next-line no-await-in-loop
      const editActor = await requireRow(transaction, "actors", {
        id: edit.actorId,
      });
      if (editActor.is_active !== true) {
        throw recordError("FORBIDDEN");
      }
    }

    if (input.parentVersionId) {
      const parent = await requireRow(transaction, "lesson_versions", {
        tenant_id: actor.tenantId,
        id: input.parentVersionId,
      });
      if (parent.package_id !== input.package.id) {
        throw recordError("INVALID_INPUT");
      }
    }

    if (input.predecessorVersionId) {
      await requireRow(transaction, "lesson_versions", {
        tenant_id: actor.tenantId,
        id: input.predecessorVersionId,
      });
    }
  };

  const appendVersion = (
    actor: Actor,
    submitted: AppendVersionInput
  ): Promise<RecordMutationResult> => {
    return runWrite<AppendVersionInput>(
      actor,
      "append-version",
      submitted,
      async (transaction, input) => {
        const head = await assertAppendPackage(transaction, actor, input);
        await assertVersionReferences(transaction, actor, input);

        const lineage = resolveAppendLineage(input, head);
        const revision = lineage.expectedHeadRevision + 1;
        const contentHash = createContentHash({
          conceptIds: input.conceptIds,
          sections: input.sections,
          variantReferences: input.variantReferences,
        });
        const privateAnswerDigest = createPrivateAnswerDigest(
          input.privateAnswerRelationships
        );
        const validationResultHash = createValidationResultHash(
          input.validationResult
        );

        const version = lessonVersionSchema.parse({
          id: createId(),
          tenantId: actor.tenantId,
          packageId: input.package.id,
          revision,
          schemaVersion: "lesson-package-curated-v1",
          parentVersionId: lineage.parentVersionId,
          predecessorVersionId: input.predecessorVersionId,
          curatedReferenceId: input.curatedReferenceId,
          sourceSnapshotId: input.sourceSnapshotId ?? null,
          generationRequestId: input.generationRequestId,
          conceptIds: input.conceptIds,
          variantReferences: input.variantReferences,
          objectiveHash: input.objectiveHash,
          sections: input.sections,
          provenance: input.provenance,
          revisionKind: lineage.revisionKind,
          changedSectionIds: input.changedSectionIds,
          contentHash,
          packageHash: createPackageHash({ contentHash, privateAnswerDigest }),
          privateAnswerDigest,
          privateAnswerRelationships: input.privateAnswerRelationships,
          validationResult: input.validationResult,
          validationResultHash,
          ruleVersions: input.ruleVersions,
          createdAt: clock(),
        });

        await backend.insert(transaction, "lesson_versions", {
          id: version.id,
          tenant_id: version.tenantId,
          package_id: version.packageId,
          revision: version.revision,
          schema_version: version.schemaVersion,
          parent_version_id: version.parentVersionId,
          predecessor_version_id: version.predecessorVersionId,
          curated_reference_id: version.curatedReferenceId,
          source_snapshot_id: version.sourceSnapshotId,
          generation_request_id: version.generationRequestId,
          concept_ids: version.conceptIds,
          variant_references: version.variantReferences,
          objective_hash: version.objectiveHash,
          sections: version.sections,
          provenance: version.provenance,
          revision_kind: version.revisionKind,
          changed_section_ids: version.changedSectionIds,
          content_hash: version.contentHash,
          package_hash: version.packageHash,
          private_answer_digest: version.privateAnswerDigest,
          private_answer_relationships: version.privateAnswerRelationships,
          validation_result: version.validationResult,
          validation_result_hash: version.validationResultHash,
          rule_versions: version.ruleVersions,
          created_at: version.createdAt,
        });

        const affected = await backend.update(
          transaction,
          "lesson_packages",
          {
            tenant_id: actor.tenantId,
            id: version.packageId,
            head_revision: lineage.expectedHeadRevision,
          },
          { head_revision: revision, updated_at: clock() }
        );
        if (affected !== 1) {
          throw recordError("STALE_VERSION");
        }

        return { resultKind: "lesson-version", resultIds: [version.id] };
      }
    );
  };

  const publish = (
    actor: Actor,
    submitted: PublishInput
  ): Promise<RecordMutationResult> => {
    return runWrite<PublishInput>(
      actor,
      "publish",
      submitted,
      async (transaction, input) => {
        const version = await loadVersion(
          transaction,
          input.versionId,
          actor.tenantId
        );
        await requireOwnedPackage(transaction, actor, version.packageId);

        if (!version.validationResult.ok) {
          throw recordError("INVALID_INPUT");
        }
        const areHashesEqual =
          version.contentHash === input.contentHash &&
          version.packageHash === input.packageHash &&
          version.privateAnswerDigest === input.privateAnswerDigest;
        const isEvidenceEqual =
          version.validationResultHash === input.validationResultHash &&
          canonicalJson(version.ruleVersions) ===
            canonicalJson(input.ruleVersions);
        if (!areHashesEqual || !isEvidenceEqual) {
          throw recordError("STALE_VERSION");
        }

        const publication = publicationSchema.parse({
          id: createId(),
          tenantId: actor.tenantId,
          schemaVersion: "publication-v1",
          lessonVersionId: version.id,
          approvingActorId: actor.actorId,
          contentHash: version.contentHash,
          packageHash: version.packageHash,
          privateAnswerDigest: version.privateAnswerDigest,
          validationResultHash: version.validationResultHash,
          ruleVersions: version.ruleVersions,
          approvedAt: clock(),
          createdAt: clock(),
        });

        await backend.insert(transaction, "publications", {
          id: publication.id,
          tenant_id: publication.tenantId,
          schema_version: publication.schemaVersion,
          lesson_version_id: publication.lessonVersionId,
          approving_actor_id: publication.approvingActorId,
          content_hash: publication.contentHash,
          package_hash: publication.packageHash,
          private_answer_digest: publication.privateAnswerDigest,
          validation_result_hash: publication.validationResultHash,
          rule_versions: publication.ruleVersions,
          approved_at: publication.approvedAt,
          created_at: publication.createdAt,
        });

        return { resultKind: "publication", resultIds: [publication.id] };
      }
    );
  };

  const assign = (
    actor: Actor,
    submitted: AssignInput
  ): Promise<RecordMutationResult> => {
    return runWrite<AssignInput>(
      actor,
      "assign",
      submitted,
      async (transaction, input) => {
        const publication = await requirePublication(
          transaction,
          actor.tenantId,
          input.publicationId
        );
        const version = await loadVersion(
          transaction,
          publication.lessonVersionId,
          actor.tenantId
        );
        await requireOwnedPackage(transaction, actor, version.packageId);

        if (
          input.classId &&
          (actor.role !== "teacher" ||
            actor.rosterClassIds.every((classId) => classId !== input.classId))
        ) {
          throw recordError("FORBIDDEN");
        }

        const learner = await requireRow(transaction, "identities", {
          tenant_id: actor.tenantId,
          id: input.learnerId,
        });
        if (learner.role !== "student" || learner.is_active !== true) {
          throw recordError("FORBIDDEN");
        }
        const learnerMembership = await findOne(transaction, "memberships", {
          tenant_id: actor.tenantId,
          learner_id: input.learnerId,
          status: "active",
        });
        if (!learnerMembership) {
          throw recordError("FORBIDDEN");
        }

        const assignment = assignmentSchema.parse({
          id: createId(),
          tenantId: actor.tenantId,
          schemaVersion: "assignment-v1",
          publicationId: publication.id,
          learnerId: input.learnerId,
          assigningActorId: actor.actorId,
          createdAt: clock(),
        });

        await backend.insert(transaction, "assignments", {
          id: assignment.id,
          tenant_id: assignment.tenantId,
          schema_version: assignment.schemaVersion,
          publication_id: assignment.publicationId,
          learner_id: assignment.learnerId,
          assigning_actor_id: assignment.assigningActorId,
          created_at: assignment.createdAt,
        });

        return { resultKind: "assignment", resultIds: [assignment.id] };
      }
    );
  };

  const startRun = (
    actor: Actor,
    submitted: StartRunInput
  ): Promise<RecordMutationResult> => {
    return runWrite<StartRunInput>(
      actor,
      "start-run",
      submitted,
      async (transaction, input) => {
        if (actor.role !== "student") {
          throw recordError("FORBIDDEN");
        }
        const assignmentRow = await requireRow(transaction, "assignments", {
          tenant_id: actor.tenantId,
          id: input.assignmentId,
        });
        const assignment = mapAssignment(assignmentRow);
        if (assignment.learnerId !== actor.learnerId) {
          throw recordError("FORBIDDEN");
        }
        const publication = await requirePublication(
          transaction,
          actor.tenantId,
          assignment.publicationId
        );
        const version = await loadVersion(
          transaction,
          publication.lessonVersionId,
          actor.tenantId
        );
        if (
          version.variantReferences.every(
            (variant) => variant.variantId !== input.assignedVariantId
          )
        ) {
          throw recordError("INVALID_INPUT");
        }

        const existing = await findOne(transaction, "learner_runs", {
          tenant_id: actor.tenantId,
          assignment_id: assignment.id,
        });
        if (existing) {
          if (existing.learner_id !== actor.learnerId) {
            throw recordError("FORBIDDEN");
          }
          return {
            resultKind: "learner-run",
            resultIds: [existing.id as string],
          };
        }

        const run = learnerRunSchema.parse({
          id: createId(),
          tenantId: actor.tenantId,
          schemaVersion: "learner-run-v1",
          assignmentId: assignment.id,
          learnerId: actor.learnerId,
          publicationId: publication.id,
          assignedVariantId: input.assignedVariantId,
          stage: "assigned",
          firstResponseStatus: "pending",
          revision: 0,
          nextActivity: null,
          createdAt: clock(),
          updatedAt: clock(),
        });

        await backend.insert(transaction, "learner_runs", {
          id: run.id,
          tenant_id: run.tenantId,
          schema_version: run.schemaVersion,
          assignment_id: run.assignmentId,
          learner_id: run.learnerId,
          publication_id: run.publicationId,
          assigned_variant_id: run.assignedVariantId,
          stage: run.stage,
          first_response_status: run.firstResponseStatus,
          revision: run.revision,
          next_activity: run.nextActivity,
          created_at: run.createdAt,
          updated_at: run.updatedAt,
        });

        return { resultKind: "learner-run", resultIds: [run.id] };
      }
    );
  };

  const recordHint = (
    actor: Actor,
    submitted: RecordHintInput
  ): Promise<RecordMutationResult> => {
    return runWrite<RecordHintInput>(
      actor,
      "record-hint",
      submitted,
      async (transaction, input) => {
        const { run } = await requireRunForLearner(
          transaction,
          actor,
          input.runId
        );
        const publication = await requirePublication(
          transaction,
          actor.tenantId,
          run.publicationId
        );
        const version = await loadVersion(
          transaction,
          publication.lessonVersionId,
          actor.tenantId
        );
        if (!collectItemIds(version).has(input.itemId)) {
          throw recordError("INVALID_INPUT");
        }

        const existing = await backend.list(transaction, "assistance_events", {
          tenant_id: actor.tenantId,
          run_id: run.id,
          item_id: input.itemId,
        });
        const ordinal = existing.length + 1;

        const event = assistanceEventSchema.parse({
          id: createId(),
          tenantId: actor.tenantId,
          schemaVersion: "assistance-event-v1",
          runId: run.id,
          itemId: input.itemId,
          kind: "hint",
          ordinal,
          recordedAt: clock(),
        });

        await backend.insert(transaction, "assistance_events", {
          id: event.id,
          tenant_id: event.tenantId,
          schema_version: event.schemaVersion,
          run_id: event.runId,
          item_id: event.itemId,
          kind: event.kind,
          ordinal: event.ordinal,
          recorded_at: event.recordedAt,
        });

        await advanceRun(transaction, run, input.expectedRunRevision, {
          stage: "active",
        });

        return { resultKind: "assistance-event", resultIds: [event.id] };
      }
    );
  };

  const recordAttempt = (
    actor: Actor,
    submitted: RecordAttemptInput
  ): Promise<RecordMutationResult> => {
    return runWrite<RecordAttemptInput>(
      actor,
      "record-attempt",
      submitted,
      async (transaction, input) => {
        const { run } = await requireRunForLearner(
          transaction,
          actor,
          input.runId
        );
        const publication = await requirePublication(
          transaction,
          actor.tenantId,
          run.publicationId
        );
        const version = await loadVersion(
          transaction,
          publication.lessonVersionId,
          actor.tenantId
        );
        if (!collectItemIds(version).has(input.itemId)) {
          throw recordError("INVALID_INPUT");
        }

        if (input.priorAttemptId) {
          const prior = await requireRow(transaction, "learner_attempts", {
            tenant_id: actor.tenantId,
            id: input.priorAttemptId,
          });
          if (prior.run_id !== run.id || prior.item_id !== input.itemId) {
            throw recordError("INVALID_INPUT");
          }
        }

        for (const eventId of input.assistanceEventIds) {
          // eslint-disable-next-line no-await-in-loop
          const event = await requireRow(transaction, "assistance_events", {
            tenant_id: actor.tenantId,
            id: eventId,
          });
          if (event.run_id !== run.id || event.item_id !== input.itemId) {
            throw recordError("INVALID_INPUT");
          }
        }
        if (
          (input.assistanceState === "hinted" &&
            input.assistanceEventIds.length === 0) ||
          (input.assistanceState === "none" &&
            input.assistanceEventIds.length > 0)
        ) {
          throw recordError("INVALID_INPUT");
        }

        const existing = await backend.list(transaction, "learner_attempts", {
          tenant_id: actor.tenantId,
          run_id: run.id,
          item_id: input.itemId,
        });
        // #6: a completed submission consumes one of three attempts. A replay
        // never reaches this check because the receipt resolves first.
        if (existing.length >= attemptLimitPerItem) {
          throw recordError("ATTEMPT_LIMIT_REACHED");
        }
        const ordinal = existing.length + 1;

        const attempt = learnerAttemptSchema.parse({
          id: createId(),
          tenantId: actor.tenantId,
          schemaVersion: "attempt-v2",
          runId: run.id,
          publicationId: publication.id,
          lessonVersionId: version.id,
          itemId: input.itemId,
          ordinal,
          priorAttemptId: input.priorAttemptId,
          selectedPairs: input.selectedPairs,
          assistanceState: input.assistanceState,
          assistanceEventIds: input.assistanceEventIds,
          score: input.score,
          correctness: input.correctness,
          gradingRuleVersion: input.gradingRuleVersion,
          createdAt: clock(),
        });

        await backend.insert(transaction, "learner_attempts", {
          id: attempt.id,
          tenant_id: attempt.tenantId,
          schema_version: attempt.schemaVersion,
          run_id: attempt.runId,
          publication_id: attempt.publicationId,
          lesson_version_id: attempt.lessonVersionId,
          item_id: attempt.itemId,
          ordinal: attempt.ordinal,
          prior_attempt_id: attempt.priorAttemptId,
          selected_pairs: attempt.selectedPairs,
          assistance_state: attempt.assistanceState,
          assistance_event_ids: attempt.assistanceEventIds,
          score: attempt.score,
          correctness: attempt.correctness,
          grading_rule_version: attempt.gradingRuleVersion,
          created_at: attempt.createdAt,
        });

        await advanceRun(transaction, run, input.expectedRunRevision, {
          stage: "active",
          first_response_status: "submitted",
        });

        return { resultKind: "learner-attempt", resultIds: [attempt.id] };
      }
    );
  };

  const choose = (
    actor: Actor,
    submitted: ChooseInput
  ): Promise<RecordMutationResult> => {
    return runWrite<ChooseInput>(
      actor,
      "choose",
      submitted,
      async (transaction, input) => {
        const runRow = await requireRow(transaction, "learner_runs", {
          tenant_id: actor.tenantId,
          id: input.runId,
        });
        const run = mapRun(runRow);
        const assignmentRow = await requireRow(transaction, "assignments", {
          tenant_id: actor.tenantId,
          id: run.assignmentId,
        });
        if (mapAssignment(assignmentRow).assigningActorId !== actor.actorId) {
          throw recordError("FORBIDDEN");
        }

        const attemptsRows = await backend.list(
          transaction,
          "learner_attempts",
          { tenant_id: actor.tenantId, run_id: run.id },
          { column: "ordinal", direction: "asc" }
        );
        const attempts = attemptsRows.map(mapAttempt);
        const assistanceRows = await backend.list(
          transaction,
          "assistance_events",
          { tenant_id: actor.tenantId, run_id: run.id },
          { column: "ordinal", direction: "asc" }
        );
        const assistance = assistanceRows.map(mapAssistance);

        const currentEvidenceHash = createEvidenceHash({
          runId: run.id,
          publicationId: run.publicationId,
          learnerId: run.learnerId,
          attempts: evidenceAttempts(attempts),
          assistanceEvents: evidenceAssistanceEvents(assistance),
        });
        if (currentEvidenceHash !== input.evidenceHash) {
          throw recordError("STALE_VERSION");
        }

        const publication = await requirePublication(
          transaction,
          actor.tenantId,
          run.publicationId
        );
        const version = await loadVersion(
          transaction,
          publication.lessonVersionId,
          actor.tenantId
        );
        if (
          input.approvedTargetId &&
          !collectItemIds(version).has(input.approvedTargetId)
        ) {
          throw recordError("INVALID_INPUT");
        }

        const decision = teacherDecisionSchema.parse({
          id: createId(),
          tenantId: actor.tenantId,
          schemaVersion: "teacher-decision-v1",
          runId: run.id,
          teacherActorId: actor.actorId,
          evidenceHash: input.evidenceHash,
          proposal: input.proposal,
          action: input.action,
          approvedTargetId: input.approvedTargetId,
          createdAt: clock(),
        });

        await backend.insert(transaction, "teacher_decisions", {
          id: decision.id,
          tenant_id: decision.tenantId,
          schema_version: decision.schemaVersion,
          run_id: decision.runId,
          teacher_actor_id: decision.teacherActorId,
          evidence_hash: decision.evidenceHash,
          proposal: decision.proposal,
          action: decision.action,
          approved_target_id: decision.approvedTargetId,
          created_at: decision.createdAt,
        });

        await advanceRun(transaction, run, input.expectedRunRevision, {
          stage: input.action === "pause" ? "paused" : "advanced",
          next_activity:
            input.action === "pause" || !input.approvedTargetId
              ? null
              : { targetId: input.approvedTargetId },
        });

        return { resultKind: "teacher-decision", resultIds: [decision.id] };
      }
    );
  };

  const readAuthoring = (
    actor: Actor,
    submitted: ReadAuthoringInput
  ): Promise<AuthoringProjection> => {
    const parsed = parseOrThrow(readAuthoringInputSchema, submitted);
    return read(actor, "preview_draft", async (transaction) => {
      if (parsed.kind === "version") {
        const version = await loadVersion(
          transaction,
          parsed.versionId,
          actor.tenantId
        );
        const packageRow = await requireOwnedPackage(
          transaction,
          actor,
          version.packageId
        );
        return {
          package: packageProjection(packageRow),
          versions: [projectTeacherVersion(version)],
        };
      }

      const packageRow = await requireOwnedPackage(
        transaction,
        actor,
        parsed.packageId
      );
      const versionRows = await backend.list(
        transaction,
        "lesson_versions",
        { tenant_id: actor.tenantId, package_id: parsed.packageId },
        { column: "revision", direction: "desc" }
      );
      return {
        package: packageProjection(packageRow),
        versions: versionRows.map(mapVersion).map(projectTeacherVersion),
      };
    });
  };

  const readEvidence = (
    actor: Actor,
    submitted: ReadEvidenceInput
  ): Promise<TeacherEvidenceProjection> => {
    const parsed = parseOrThrow(readEvidenceInputSchema, submitted);
    return read(actor, "teacher_decision", async (transaction) => {
      const runRow = await requireRow(transaction, "learner_runs", {
        tenant_id: actor.tenantId,
        id: parsed.runId,
      });
      const run = mapRun(runRow);
      const assignmentRow = await requireRow(transaction, "assignments", {
        tenant_id: actor.tenantId,
        id: run.assignmentId,
      });
      if (mapAssignment(assignmentRow).assigningActorId !== actor.actorId) {
        throw recordError("FORBIDDEN");
      }
      const attemptsRows = await backend.list(
        transaction,
        "learner_attempts",
        { tenant_id: actor.tenantId, run_id: run.id },
        { column: "ordinal", direction: "asc" }
      );
      const attempts = attemptsRows.map(mapAttempt);
      const assistanceRows = await backend.list(
        transaction,
        "assistance_events",
        { tenant_id: actor.tenantId, run_id: run.id },
        { column: "ordinal", direction: "asc" }
      );
      const assistance = assistanceRows.map(mapAssistance);
      const decisionsRows = await backend.list(
        transaction,
        "teacher_decisions",
        { tenant_id: actor.tenantId, run_id: run.id },
        { column: "created_at", direction: "asc" }
      );
      const decisions = decisionsRows.map(mapDecision);
      return projectTeacherEvidence({
        run,
        attempts,
        assistanceEvents: assistance,
        decisions,
      });
    });
  };

  const readLesson = (
    actor: Actor,
    submitted: ReadLessonInput
  ): Promise<LessonReadResult> => {
    const parsed = parseOrThrow(readLessonInputSchema, submitted);
    return read(actor, "read_assignment", async (transaction) => {
      const { run } = await requireRunForLearner(
        transaction,
        actor,
        parsed.runId
      );
      const publication = await requirePublication(
        transaction,
        actor.tenantId,
        run.publicationId
      );
      const version = await loadVersion(
        transaction,
        publication.lessonVersionId,
        actor.tenantId
      );
      const attemptsRows = await backend.list(
        transaction,
        "learner_attempts",
        { tenant_id: actor.tenantId, run_id: run.id },
        { column: "ordinal", direction: "asc" }
      );
      const attempts = attemptsRows.map(mapAttempt);
      const assistanceRows = await backend.list(
        transaction,
        "assistance_events",
        { tenant_id: actor.tenantId, run_id: run.id },
        { column: "ordinal", direction: "asc" }
      );
      const assistance = assistanceRows.map(mapAssistance);
      return {
        lesson: projectStudentLesson({ version, run }),
        evidence: projectStudentEvidence({
          run,
          attempts,
          assistanceEvents: assistance,
        }),
        runRevision: run.revision,
      };
    });
  };

  const readAttemptContext = (
    actor: Actor,
    submitted: ReadAttemptContextInput
  ): Promise<AttemptContext> => {
    const parsed = parseOrThrow(readAttemptContextInputSchema, submitted);
    return read(actor, "submit_attempt", async (transaction) => {
      const { run } = await requireRunForLearner(
        transaction,
        actor,
        parsed.runId
      );
      const publication = await requirePublication(
        transaction,
        actor.tenantId,
        run.publicationId
      );
      const version = await loadVersion(
        transaction,
        publication.lessonVersionId,
        actor.tenantId
      );
      if (!collectItemIds(version).has(parsed.itemId)) {
        throw recordError("INVALID_INPUT");
      }
      const relationships = version.privateAnswerRelationships.filter(
        (relationship) => relationship.itemId === parsed.itemId
      );
      if (relationships.length === 0) {
        throw recordError("INVALID_INPUT");
      }
      return {
        runId: run.id,
        runRevision: run.revision,
        itemId: parsed.itemId,
        relationships,
      };
    });
  };

  return {
    kind: backend.kind,
    check: backend.check,
    storeGrounding,
    appendVersion,
    publish,
    assign,
    startRun,
    recordHint,
    recordAttempt,
    choose,
    readAuthoring,
    readEvidence,
    readLesson,
    readAttemptContext,
  };
};
