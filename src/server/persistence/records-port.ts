export type RecordValue =
  | string
  | number
  | boolean
  | null
  | readonly unknown[]
  | Record<string, unknown>;

export type StoredRow = Record<string, unknown>;

/**
 * Every table the records boundary reads. Write operations only target the ten record tables; the identity, curriculum, and generation tables are read-only referents.
 */
export const recordTableColumns = {
  curated_references: [
    "id",
    "tenant_id",
    "teacher_actor_id",
    "schema_version",
    "kind",
    "standard_id",
    "reference_key",
    "reference_version",
    "title",
    "attribution",
    "source_locator",
    "reviewed_content",
    "content_hash",
    "created_at",
  ],
  lesson_packages: [
    "id",
    "tenant_id",
    "teacher_actor_id",
    "standard_id",
    "title",
    "head_revision",
    "created_at",
    "updated_at",
  ],
  lesson_versions: [
    "id",
    "tenant_id",
    "package_id",
    "revision",
    "schema_version",
    "parent_version_id",
    "predecessor_version_id",
    "curated_reference_id",
    "source_snapshot_id",
    "generation_request_id",
    "concept_ids",
    "variant_references",
    "objective_hash",
    "sections",
    "provenance",
    "revision_kind",
    "changed_section_ids",
    "content_hash",
    "package_hash",
    "private_answer_digest",
    "private_answer_relationships",
    "validation_result",
    "validation_result_hash",
    "rule_versions",
    "created_at",
  ],
  publications: [
    "id",
    "tenant_id",
    "schema_version",
    "lesson_version_id",
    "approving_actor_id",
    "content_hash",
    "package_hash",
    "private_answer_digest",
    "validation_result_hash",
    "rule_versions",
    "approved_at",
    "created_at",
  ],
  assignments: [
    "id",
    "tenant_id",
    "schema_version",
    "publication_id",
    "learner_id",
    "assigning_actor_id",
    "created_at",
  ],
  learner_runs: [
    "id",
    "tenant_id",
    "schema_version",
    "assignment_id",
    "learner_id",
    "publication_id",
    "assigned_variant_id",
    "stage",
    "first_response_status",
    "revision",
    "next_activity",
    "created_at",
    "updated_at",
  ],
  assistance_events: [
    "id",
    "tenant_id",
    "schema_version",
    "run_id",
    "item_id",
    "kind",
    "ordinal",
    "recorded_at",
  ],
  learner_attempts: [
    "id",
    "tenant_id",
    "schema_version",
    "run_id",
    "publication_id",
    "lesson_version_id",
    "item_id",
    "ordinal",
    "prior_attempt_id",
    "selected_pairs",
    "assistance_state",
    "assistance_event_ids",
    "score",
    "correctness",
    "grading_rule_version",
    "created_at",
  ],
  teacher_decisions: [
    "id",
    "tenant_id",
    "schema_version",
    "run_id",
    "teacher_actor_id",
    "evidence_hash",
    "proposal",
    "action",
    "approved_target_id",
    "created_at",
  ],
  operation_receipts: [
    "id",
    "tenant_id",
    "schema_version",
    "actor_id",
    "membership_id",
    "authorization_revision",
    "action",
    "operation_key",
    "input_hash",
    "result_kind",
    "result_ids",
    "created_at",
  ],
  actors: [
    "id",
    "display_name",
    "is_active",
    "authorization_revision",
    "created_at",
  ],
  tenants: ["id", "slug", "name", "synthetic_data_only", "created_at"],
  memberships: [
    "id",
    "actor_id",
    "tenant_id",
    "role",
    "status",
    "learner_id",
    "revision",
    "created_at",
  ],
  identity_sessions: [
    "session_id",
    "actor_id",
    "membership_id",
    "tenant_id",
    "authorization_revision",
    "revision",
    "revoked_at",
    "absolute_expires_at",
    "created_at",
  ],
  identities: ["id", "tenant_id", "role", "is_active", "created_at"],
  standards: ["id", "tenant_id", "code", "name", "created_at"],
  prerequisite_nodes: ["id", "tenant_id", "standard_id"],
  lesson_draft_requests: ["id", "tenant_id", "teacher_id"],
  source_snapshots: [
    "id",
    "tenant_id",
    "teacher_id",
    "standard_id",
    "mode",
    "file_name",
    "file_format",
    "file_size_bytes",
    "page_count",
    "content_hash",
    "extracted_text",
    "state",
    "gaps",
    "failure_reason",
    "unverified_alignment",
    "alignment_acknowledged_at",
    "synthetic_material_confirmed",
    "required_skills_confirmed_at",
    "reviewed_at",
    "used_at",
    "expires_at",
    "replaces_snapshot_id",
    "created_at",
    "updated_at",
  ],
} as const;

export type RecordTableName = keyof typeof recordTableColumns;

export const recordJsonColumns: Partial<
  Record<RecordTableName, readonly string[]>
> = {
  curated_references: ["reviewed_content"],
  lesson_versions: [
    "concept_ids",
    "variant_references",
    "sections",
    "provenance",
    "changed_section_ids",
    "private_answer_relationships",
    "validation_result",
    "rule_versions",
  ],
  publications: ["rule_versions"],
  source_snapshots: ["gaps"],
  learner_runs: ["next_activity"],
  learner_attempts: ["selected_pairs", "assistance_event_ids"],
  teacher_decisions: ["proposal"],
  operation_receipts: ["result_ids"],
};

export interface UniqueConstraint {
  readonly name: string;
  readonly columns: readonly string[];
}

export const recordUniqueConstraints: Partial<
  Record<RecordTableName, readonly UniqueConstraint[]>
> = {
  curated_references: [
    {
      name: "curated_references_tenant_id_id_key",
      columns: ["tenant_id", "id"],
    },
  ],
  lesson_packages: [
    { name: "lesson_packages_tenant_id_id_key", columns: ["tenant_id", "id"] },
  ],
  lesson_versions: [
    { name: "lesson_versions_tenant_id_id_key", columns: ["tenant_id", "id"] },
    {
      name: "lesson_versions_package_id_revision_key",
      columns: ["tenant_id", "package_id", "revision"],
    },
  ],
  publications: [
    { name: "publications_tenant_id_id_key", columns: ["tenant_id", "id"] },
    {
      name: "publications_tenant_id_lesson_version_id_key",
      columns: ["tenant_id", "lesson_version_id"],
    },
  ],
  assignments: [
    { name: "assignments_tenant_id_id_key", columns: ["tenant_id", "id"] },
  ],
  learner_runs: [
    { name: "learner_runs_tenant_id_id_key", columns: ["tenant_id", "id"] },
    {
      name: "learner_runs_tenant_id_assignment_id_key",
      columns: ["tenant_id", "assignment_id"],
    },
  ],
  assistance_events: [
    {
      name: "assistance_events_tenant_id_id_key",
      columns: ["tenant_id", "id"],
    },
    {
      name: "assistance_events_run_item_ordinal_key",
      columns: ["tenant_id", "run_id", "item_id", "ordinal"],
    },
  ],
  learner_attempts: [
    {
      name: "learner_attempts_tenant_id_id_key",
      columns: ["tenant_id", "id"],
    },
    {
      name: "learner_attempts_run_item_ordinal_key",
      columns: ["tenant_id", "run_id", "item_id", "ordinal"],
    },
  ],
  teacher_decisions: [
    {
      name: "teacher_decisions_tenant_id_id_key",
      columns: ["tenant_id", "id"],
    },
  ],
  operation_receipts: [
    {
      name: "operation_receipts_tenant_id_id_key",
      columns: ["tenant_id", "id"],
    },
    {
      name: "operation_receipts_actor_action_key_key",
      columns: ["tenant_id", "actor_id", "action", "operation_key"],
    },
  ],
};

export class RecordUniqueViolationError extends Error {
  readonly constraint: string;

  constructor(constraint: string, options?: ErrorOptions) {
    super("A record unique constraint rejected the write.", options);
    this.name = "RecordUniqueViolationError";
    this.constraint = constraint;
  }
}

export interface RecordOrder {
  readonly column: string;
  readonly direction: "asc" | "desc";
}

export interface RecordBackend<TTransaction> {
  readonly kind: "seeded-demo" | "postgres";
  check: () => Promise<boolean>;
  withTransaction: <T>(
    work: (transaction: TTransaction) => Promise<T>
  ) => Promise<T>;
  setTenant: (transaction: TTransaction, tenantId: string) => Promise<void>;
  insert: (
    transaction: TTransaction,
    table: RecordTableName,
    values: Readonly<Record<string, RecordValue>>
  ) => Promise<void>;
  findOne: (
    transaction: TTransaction,
    table: RecordTableName,
    where: Readonly<Record<string, RecordValue>>
  ) => Promise<StoredRow | undefined>;
  list: (
    transaction: TTransaction,
    table: RecordTableName,
    where: Readonly<Record<string, RecordValue>>,
    order?: RecordOrder,
    limit?: number
  ) => Promise<StoredRow[]>;
  update: (
    transaction: TTransaction,
    table: RecordTableName,
    where: Readonly<Record<string, RecordValue>>,
    values: Readonly<Record<string, RecordValue>>
  ) => Promise<number>;
}
