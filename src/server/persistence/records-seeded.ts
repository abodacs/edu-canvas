import { getTableColumns, getTableName } from "drizzle-orm";

import {
  actors,
  assistanceEvents,
  assignments,
  curatedReferences,
  identities,
  identitySessions,
  learnerAttempts,
  learnerRuns,
  lessonDraftRequests,
  lessonPackages,
  lessonVersions,
  memberships,
  operationReceipts,
  prerequisiteNodes,
  publications,
  sourceSnapshots,
  standards,
  teacherDecisions,
  tenants,
} from "../../../drizzle/schema";
import {
  RecordUniqueViolationError,
  recordUniqueConstraints,
} from "./records-port";
import type {
  RecordBackend,
  RecordOrder,
  RecordTableName,
  RecordValue,
  StoredRow,
  UniqueConstraint,
} from "./records-port";
import type { PgTable } from "drizzle-orm/pg-core";

export interface SeededRecordBackend extends RecordBackend<undefined> {
  seed: (table: RecordTableName, rows: readonly StoredRow[]) => void;
}

const cloneRows = (rows: readonly StoredRow[]): StoredRow[] =>
  structuredClone([...rows]);

const matches = (
  row: StoredRow,
  where: Readonly<Record<string, RecordValue>>
) => Object.entries(where).every(([column, value]) => row[column] === value);

const compareValues = (left: unknown, right: unknown): number => {
  if (left === right) {
    return 0;
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left) < String(right) ? -1 : 1;
};

/**
 * In-memory implementation of the record port. It enforces the same unique constraints as PostgreSQL and rolls the whole store back when the work throws. It is not restart-durable; PostgreSQL is the durability authority.
 */
/**
The seeded double rejects a column the real table does not have, so a mapper that
invents a name fails in tests instead of in production. The column set comes from
the schema; this file owns only the name-to-table binding, which `Record<
RecordTableName, PgTable>` forces to be total.
*/
const tablesByStoredName = {
  actors,
  assignments,
  assistance_events: assistanceEvents,
  curated_references: curatedReferences,
  identities,
  identity_sessions: identitySessions,
  learner_attempts: learnerAttempts,
  learner_runs: learnerRuns,
  lesson_draft_requests: lessonDraftRequests,
  lesson_packages: lessonPackages,
  lesson_versions: lessonVersions,
  memberships,
  operation_receipts: operationReceipts,
  prerequisite_nodes: prerequisiteNodes,
  publications,
  source_snapshots: sourceSnapshots,
  standards,
  teacher_decisions: teacherDecisions,
  tenants,
} as const satisfies Record<RecordTableName, PgTable>;

const columnsOf = (table: RecordTableName): readonly string[] => {
  const bound = tablesByStoredName[table];
  const stored = getTableName(bound);
  if (stored !== table) {
    throw new Error(`Record table ${table} is bound to ${stored}.`);
  }
  return Object.values(getTableColumns(bound)).map((column) => column.name);
};

export const createSeededRecordBackend = (
  seed: Partial<Record<RecordTableName, readonly StoredRow[]>> = {}
): SeededRecordBackend => {
  let tables = new Map<RecordTableName, StoredRow[]>();

  const rowsFor = (table: RecordTableName): StoredRow[] => {
    const existing = tables.get(table);
    if (existing) {
      return existing;
    }
    const created: StoredRow[] = [];
    tables.set(table, created);
    return created;
  };

  const assertColumns = (
    table: RecordTableName,
    values: Readonly<Record<string, RecordValue>>
  ): void => {
    const allowed = new Set<string>(columnsOf(table));
    for (const column of Object.keys(values)) {
      if (!allowed.has(column)) {
        throw new Error(`Unknown column ${column} on ${table}.`);
      }
    }
  };

  const doesViolate = (
    table: RecordTableName,
    candidate: StoredRow,
    constraint: UniqueConstraint,
    ignore?: StoredRow
  ): boolean => {
    const values = constraint.columns.map((column) => candidate[column]);
    const hasMissingValue = values.some(
      (value) => value === null || value === undefined
    );
    return (
      !hasMissingValue &&
      rowsFor(table).some((row) => {
        return (
          row !== ignore &&
          constraint.columns.every(
            (column, index) => row[column] === values[index]
          )
        );
      })
    );
  };

  const insert = (
    _transaction: undefined,
    table: RecordTableName,
    values: Readonly<Record<string, RecordValue>>
  ): Promise<void> => {
    assertColumns(table, values);
    const candidate = structuredClone(values) as StoredRow;
    const constraints = recordUniqueConstraints[table] ?? [];
    for (const constraint of constraints) {
      if (doesViolate(table, candidate, constraint)) {
        throw new RecordUniqueViolationError(constraint.name);
      }
    }
    rowsFor(table).push(candidate);
    return Promise.resolve();
  };

  const findOne = (
    _transaction: undefined,
    table: RecordTableName,
    where: Readonly<Record<string, RecordValue>>
  ): Promise<StoredRow | undefined> => {
    const row = rowsFor(table).find((entry) => matches(entry, where));
    return Promise.resolve(row ? structuredClone(row) : undefined);
  };

  const list = (
    _transaction: undefined,
    table: RecordTableName,
    where: Readonly<Record<string, RecordValue>>,
    order?: RecordOrder,
    limit?: number
  ): Promise<StoredRow[]> => {
    let rows = rowsFor(table).filter((entry) => matches(entry, where));
    if (order) {
      rows = rows.toSorted((left, right) => {
        return (
          compareValues(left[order.column], right[order.column]) *
          (order.direction === "asc" ? 1 : -1)
        );
      });
    }
    if (limit !== undefined) {
      rows = rows.slice(0, limit);
    }
    return Promise.resolve(rows.map((row) => structuredClone(row)));
  };

  const update = (
    _transaction: undefined,
    table: RecordTableName,
    where: Readonly<Record<string, RecordValue>>,
    values: Readonly<Record<string, RecordValue>>
  ): Promise<number> => {
    assertColumns(table, values);
    const constraints = recordUniqueConstraints[table] ?? [];
    let affected = 0;
    for (const row of rowsFor(table)) {
      if (!matches(row, where)) {
        continue;
      }
      const candidate = { ...row, ...structuredClone(values) } as StoredRow;
      for (const constraint of constraints) {
        if (doesViolate(table, candidate, constraint, row)) {
          throw new RecordUniqueViolationError(constraint.name);
        }
      }
      Object.assign(row, structuredClone(values));
      affected += 1;
    }
    return Promise.resolve(affected);
  };

  const snapshot = (): Map<RecordTableName, StoredRow[]> => {
    const copy = new Map<RecordTableName, StoredRow[]>();
    for (const [table, rows] of tables) {
      copy.set(table, cloneRows(rows));
    }
    return copy;
  };

  const restore = (snap: Map<RecordTableName, StoredRow[]>): void => {
    const restored = new Map<RecordTableName, StoredRow[]>();
    for (const [table, rows] of snap) {
      restored.set(table, cloneRows(rows));
    }
    tables = restored;
  };

  const backend: SeededRecordBackend = {
    kind: "seeded-demo",
    check: () => Promise.resolve(true),
    withTransaction: async (work) => {
      const snap = snapshot();
      try {
        return await work(undefined);
      } catch (error) {
        restore(snap);
        throw error;
      }
    },
    setTenant: () => Promise.resolve(),
    insert,
    findOne,
    list,
    update,
    seed: (table, rows) => {
      for (const row of rows) {
        assertColumns(table, row as Record<string, RecordValue>);
      }
      rowsFor(table).push(...cloneRows(rows));
    },
  };

  for (const [table, rows] of Object.entries(seed)) {
    if (rows) {
      backend.seed(table as RecordTableName, rows);
    }
  }

  return backend;
};
