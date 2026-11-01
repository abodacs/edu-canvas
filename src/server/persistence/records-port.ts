export type RecordValue =
  | string
  | number
  | boolean
  | null
  | readonly unknown[]
  | Record<string, unknown>;

export type StoredRow = Record<string, unknown>;

/**
Every table the records boundary reads. Write operations only target the ten record tables; the identity, curriculum, and generation tables are read-only referents.

The column sets live in `drizzle/schema.ts`, which owns the tables and the
migration journal. `records-seeded.ts` binds each name to its table, and the
binding is total by type, so a new table cannot be added here without one.
*/
export const recordTableNames = [
  "curated_references",
  "lesson_packages",
  "lesson_versions",
  "publications",
  "assignments",
  "learner_runs",
  "assistance_events",
  "learner_attempts",
  "teacher_decisions",
  "operation_receipts",
  "actors",
  "tenants",
  "memberships",
  "identity_sessions",
  "identities",
  "standards",
  "prerequisite_nodes",
  "lesson_draft_requests",
  "source_snapshots",
] as const;

export type RecordTableName = (typeof recordTableNames)[number];

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
