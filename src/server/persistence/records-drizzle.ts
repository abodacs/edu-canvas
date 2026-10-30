import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { RecordUniqueViolationError, recordJsonColumns } from "./records-port";
import type {
  RecordBackend,
  RecordOrder,
  RecordTableName,
  RecordValue,
  StoredRow,
} from "./records-port";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PostgresJsTransaction } from "drizzle-orm/postgres-js";

type DrizzleTransaction = PostgresJsTransaction<
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>;

const maxErrorDepth = 5;

const createSqlClient = (databaseUrl: string) => {
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

const quoted = (identifier: string) => sql.raw(`"${identifier}"`);

const jsonColumns = (table: RecordTableName): ReadonlySet<string> =>
  new Set(recordJsonColumns[table]);

const boundValue = (isJson: boolean, value: RecordValue) =>
  isJson ? sql`${JSON.stringify(value)}::text::jsonb` : sql`${value}`;

const whereClause = (where: Readonly<Record<string, RecordValue>>) => {
  return sql.join(
    Object.entries(where).map(
      ([column, value]) => sql`${quoted(column)} = ${value}`
    ),
    sql` and `
  );
};

export interface DrizzleRecordBackendOptions {
  readonly databaseUrl: string;
}

export const createDrizzleRecordBackend = (
  options: DrizzleRecordBackendOptions
): RecordBackend<DrizzleTransaction> => {
  const { databaseUrl } = options;

  const insert = async (
    transaction: DrizzleTransaction,
    table: RecordTableName,
    values: Readonly<Record<string, RecordValue>>
  ): Promise<void> => {
    const json = jsonColumns(table);
    const columns = sql.join(
      Object.keys(values).map((column) => quoted(column)),
      sql`, `
    );
    const bound = sql.join(
      Object.entries(values).map(([column, value]) =>
        boundValue(json.has(column), value)
      ),
      sql`, `
    );
    try {
      await transaction.execute(
        sql`insert into ${quoted(table)} (${columns}) values (${bound})`
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
    transaction: DrizzleTransaction,
    table: RecordTableName,
    where: Readonly<Record<string, RecordValue>>
  ): Promise<StoredRow | undefined> => {
    const rows = await transaction.execute(
      sql`select * from ${quoted(table)} where ${whereClause(where)} limit 1`
    );
    return rows[0] as StoredRow | undefined;
  };

  const list = async (
    transaction: DrizzleTransaction,
    table: RecordTableName,
    where: Readonly<Record<string, RecordValue>>,
    order?: RecordOrder,
    limit?: number
  ): Promise<StoredRow[]> => {
    const base = sql`select * from ${quoted(table)} where ${whereClause(where)}`;
    const ordered = order
      ? sql`${base} order by ${quoted(order.column)} ${sql.raw(order.direction)}`
      : base;
    const query =
      limit === undefined ? ordered : sql`${ordered} limit ${limit}`;
    const rows = await transaction.execute(query);
    return rows as StoredRow[];
  };

  const update = async (
    transaction: DrizzleTransaction,
    table: RecordTableName,
    where: Readonly<Record<string, RecordValue>>,
    values: Readonly<Record<string, RecordValue>>
  ): Promise<number> => {
    const json = jsonColumns(table);
    const setSql = sql.join(
      Object.entries(values).map(
        ([column, value]) =>
          sql`${quoted(column)} = ${boundValue(json.has(column), value)}`
      ),
      sql`, `
    );
    try {
      const rows = await transaction.execute(
        sql`update ${quoted(table)} set ${setSql} where ${whereClause(where)} returning "id"`
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
    withTransaction: async (work) => {
      const client = createSqlClient(databaseUrl);
      const database = drizzle({ client });
      try {
        return await database.transaction((transaction) =>
          work(transaction as DrizzleTransaction)
        );
      } finally {
        await client.end({ timeout: 3 });
      }
    },
    setTenant: async (transaction, tenantId) => {
      await transaction.execute(
        sql`select set_config('app.tenant_id', ${tenantId}, true)`
      );
    },
    insert,
    findOne,
    list,
    update,
  };
};
