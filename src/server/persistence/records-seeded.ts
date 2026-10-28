import {
  RecordUniqueViolation,
  recordTableColumns,
  recordUniqueConstraints,
  type RecordBackend,
  type RecordOrder,
  type RecordTableName,
  type RecordValue,
  type StoredRow,
  type UniqueConstraint,
} from "./records-port";

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
 * In-memory implementation of the record port. It enforces the same unique
 * constraints as PostgreSQL and rolls the whole store back when the work
 * throws, so the logical contract tests can run without a database. It is not
 * restart-durable; PostgreSQL is the durability authority.
 */
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
    const allowed = new Set<string>(recordTableColumns[table]);
    for (const column of Object.keys(values)) {
      if (!allowed.has(column)) {
        throw new Error(`Unknown column ${column} on ${table}.`);
      }
    }
  };

  const violates = (
    table: RecordTableName,
    candidate: StoredRow,
    constraint: UniqueConstraint,
    ignore?: StoredRow
  ): boolean => {
    const values = constraint.columns.map((column) => candidate[column]);
    if (values.some((value) => value === null || value === undefined)) {
      return false;
    }
    return rowsFor(table).some(
      (row) =>
        row !== ignore &&
        constraint.columns.every(
          (column, index) => row[column] === values[index]
        )
    );
  };

  const insert = async (
    _transaction: undefined,
    table: RecordTableName,
    values: Readonly<Record<string, RecordValue>>
  ): Promise<void> => {
    assertColumns(table, values);
    const candidate = structuredClone(values) as StoredRow;
    for (const constraint of recordUniqueConstraints[table] ?? []) {
      if (violates(table, candidate, constraint)) {
        throw new RecordUniqueViolation(constraint.name);
      }
    }
    rowsFor(table).push(candidate);
  };

  const findOne = async (
    _transaction: undefined,
    table: RecordTableName,
    where: Readonly<Record<string, RecordValue>>
  ): Promise<StoredRow | undefined> => {
    const row = rowsFor(table).find((entry) => matches(entry, where));
    return row ? structuredClone(row) : undefined;
  };

  const list = async (
    _transaction: undefined,
    table: RecordTableName,
    where: Readonly<Record<string, RecordValue>>,
    order?: RecordOrder,
    limit?: number
  ): Promise<StoredRow[]> => {
    let rows = rowsFor(table).filter((entry) => matches(entry, where));
    if (order) {
      rows = [...rows].sort(
        (left, right) =>
          compareValues(left[order.column], right[order.column]) *
          (order.direction === "asc" ? 1 : -1)
      );
    }
    if (limit !== undefined) {
      rows = rows.slice(0, limit);
    }
    return rows.map((row) => structuredClone(row));
  };

  const update = async (
    _transaction: undefined,
    table: RecordTableName,
    where: Readonly<Record<string, RecordValue>>,
    values: Readonly<Record<string, RecordValue>>
  ): Promise<number> => {
    assertColumns(table, values);
    let affected = 0;
    for (const row of rowsFor(table)) {
      if (!matches(row, where)) {
        continue;
      }
      const candidate = { ...row, ...structuredClone(values) } as StoredRow;
      for (const constraint of recordUniqueConstraints[table] ?? []) {
        if (violates(table, candidate, constraint, row)) {
          throw new RecordUniqueViolation(constraint.name);
        }
      }
      Object.assign(row, structuredClone(values));
      affected += 1;
    }
    return affected;
  };

  const snapshot = (): Map<RecordTableName, StoredRow[]> =>
    new Map(
      [...tables.entries()].map(([table, rows]) => [table, cloneRows(rows)])
    );

  const restore = (snap: Map<RecordTableName, StoredRow[]>): void => {
    tables = new Map(
      [...snap.entries()].map(([table, rows]) => [table, cloneRows(rows)])
    );
  };

  const backend: SeededRecordBackend = {
    kind: "seeded-demo",
    check: async () => true,
    withTransaction: async (work) => {
      const snap = snapshot();
      try {
        return await work(undefined);
      } catch (error) {
        restore(snap);
        throw error;
      }
    },
    setTenant: async () => undefined,
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
