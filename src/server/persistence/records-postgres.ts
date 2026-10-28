import postgres from "postgres";

import { RecordUniqueViolationError, recordJsonColumns } from "./records-port";
import type {
  RecordBackend,
  RecordOrder,
  RecordTableName,
  RecordValue,
  StoredRow,
} from "./records-port";

type SqlClient = ReturnType<typeof postgres>;
type SqlTransaction = postgres.TransactionSql;
type SqlParameter = string | number | boolean | null;

const maxErrorDepth = 5;

const isScalarParameter = (value: RecordValue): value is SqlParameter => {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
};

const toParameter = (value: RecordValue): SqlParameter =>
  value === null || isScalarParameter(value) ? value : JSON.stringify(value);

const createSqlClient = (databaseUrl: string): SqlClient => {
  return postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    max_lifetime: 30,
    prepare: false,
  });
};

const findUniqueViolation = (
  error: unknown
): RecordUniqueViolationError | undefined => {
  let current: unknown = error;
  for (let depth = 0; depth < maxErrorDepth; depth += 1) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    const record = current as Record<string, unknown>;
    if (record.code === "23505") {
      const constraint =
        typeof record.constraint === "string" ? record.constraint : "";
      return new RecordUniqueViolationError(constraint, { cause: error });
    }
    current = record.cause;
  }
  return undefined;
};

const jsonColumns = (table: RecordTableName): ReadonlySet<string> =>
  new Set(recordJsonColumns[table]);

const whereClause = (
  where: Readonly<Record<string, RecordValue>>
): { readonly text: string; readonly params: SqlParameter[] } => {
  const entries = Object.entries(where);
  return {
    text: entries
      .map(([column], index) => `"${column}" = $${index + 1}`)
      .join(" and "),
    params: entries.map(([, value]) => toParameter(value)),
  };
};

export interface PostgresRecordBackendOptions {
  readonly databaseUrl: string;
}

export const createPostgresRecordBackend = (
  options: PostgresRecordBackendOptions
): RecordBackend<SqlTransaction> => {
  const { databaseUrl } = options;

  const insert = async (
    transaction: SqlTransaction,
    table: RecordTableName,
    values: Readonly<Record<string, RecordValue>>
  ): Promise<void> => {
    const columns = Object.keys(values);
    const json = jsonColumns(table);
    const columnSql = columns.map((column) => `"${column}"`).join(", ");
    const valueSql = columns
      .map((column, index) =>
        json.has(column) ? `$${index + 1}::text::jsonb` : `$${index + 1}`
      )
      .join(", ");
    const parameters = columns.map((column) => toParameter(values[column]));
    try {
      await transaction.unsafe(
        `insert into "${table}" (${columnSql}) values (${valueSql})`,
        parameters
      );
    } catch (error) {
      const violation = findUniqueViolation(error);
      if (violation) {
        throw violation;
      }
      throw error;
    }
  };

  const findOne = async (
    transaction: SqlTransaction,
    table: RecordTableName,
    where: Readonly<Record<string, RecordValue>>
  ): Promise<StoredRow | undefined> => {
    const clause = whereClause(where);
    const rows = await transaction.unsafe(
      `select * from "${table}" where ${clause.text} limit 1`,
      clause.params
    );
    return rows[0] as StoredRow | undefined;
  };

  const list = async (
    transaction: SqlTransaction,
    table: RecordTableName,
    where: Readonly<Record<string, RecordValue>>,
    order?: RecordOrder,
    limit?: number
  ): Promise<StoredRow[]> => {
    const clause = whereClause(where);
    const orderSql = order
      ? ` order by "${order.column}" ${order.direction}`
      : "";
    const limitSql = limit === undefined ? "" : ` limit ${limit}`;
    const rows = await transaction.unsafe(
      `select * from "${table}" where ${clause.text}${orderSql}${limitSql}`,
      clause.params
    );
    return rows as StoredRow[];
  };

  const update = async (
    transaction: SqlTransaction,
    table: RecordTableName,
    where: Readonly<Record<string, RecordValue>>,
    values: Readonly<Record<string, RecordValue>>
  ): Promise<number> => {
    const entries = Object.entries(values);
    const json = jsonColumns(table);
    const setSql = entries
      .map(([column], index) => {
        return json.has(column)
          ? `"${column}" = $${index + 1}::text::jsonb`
          : `"${column}" = $${index + 1}`;
      })
      .join(", ");
    const whereEntries = Object.entries(where);
    const offset = entries.length;
    const whereSql = whereEntries
      .map(([column], index) => `"${column}" = $${offset + index + 1}`)
      .join(" and ");
    const parameters = [
      ...entries.map(([, value]) => toParameter(value)),
      ...whereEntries.map(([, value]) => toParameter(value)),
    ];
    try {
      const rows = await transaction.unsafe(
        `update "${table}" set ${setSql} where ${whereSql} returning "id"`,
        parameters
      );
      return rows.length;
    } catch (error) {
      const violation = findUniqueViolation(error);
      if (violation) {
        throw violation;
      }
      throw error;
    }
  };

  return {
    kind: "postgres",
    check: async () => {
      const client = createSqlClient(databaseUrl);
      try {
        await client`select 1 as ok`;
        return true;
      } catch {
        return false;
      } finally {
        await client.end({ timeout: 3 });
      }
    },
    withTransaction: async <T>(
      work: (transaction: SqlTransaction) => Promise<T>
    ): Promise<T> => {
      const client = createSqlClient(databaseUrl);
      try {
        const result = await client.begin((transaction) => work(transaction));
        return result as unknown as T;
      } finally {
        await client.end({ timeout: 3 });
      }
    },
    setTenant: async (transaction, tenantId) => {
      await transaction.unsafe("select set_config('app.tenant_id', $1, true)", [
        tenantId,
      ]);
    },
    insert,
    findOne,
    list,
    update,
  };
};
