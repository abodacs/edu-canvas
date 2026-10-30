import postgres from "postgres";

/**
Shared plumbing for database contract tests. They drive the real configured backend, so every suite gates itself on these values and skips otherwise.
*/
export const isRunDatabaseTests =
  process.env.RUN_DATABASE_TESTS === "true" &&
  Boolean(process.env.DATABASE_URL);

export const requireDatabaseUrl = (): string => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set for database contract tests.");
  }
  return databaseUrl;
};

export const withRawDatabase = async <T>(
  work: (sql: ReturnType<typeof postgres>) => Promise<T>
): Promise<T> => {
  const sql = postgres(requireDatabaseUrl(), { max: 1, prepare: false });

  try {
    return await work(sql);
  } finally {
    await sql.end({ timeout: 3 });
  }
};

/**
Run one transaction with the tenant-local session variable every row-level policy expects, mirroring how the persistence adapters scope their writes. The cast papers over postgres.js's tuple-oriented `UnwrapPromiseArray`; awaited query results here are ordinary promises.
*/
export const withTenantSql = async <T>(
  tenantId: string,
  work: (transaction: postgres.TransactionSql) => Promise<T>
): Promise<T> => {
  return (await withRawDatabase((sql) => {
    return sql.begin(async (transaction) => {
      await transaction`select set_config('app.tenant_id', ${tenantId}, true)`;
      return work(transaction);
    });
  })) as T;
};
