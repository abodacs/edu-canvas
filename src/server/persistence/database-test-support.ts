import postgres from "postgres";

export const isRunDatabaseTests =
  process.env.RUN_DATABASE_TESTS === "true" &&
  Boolean(process.env.DATABASE_URL);

export const requireDatabaseUrl = (): string => {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === "") {
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

export const withTenantSql = async <T>(
  tenantId: string,
  work: (transaction: postgres.TransactionSql) => Promise<T>
): Promise<T> => {
  return await withRawDatabase(async (sql) => {
    return await sql.begin<Promise<T>>(async (transaction) => {
      await transaction`select set_config('app.tenant_id', ${tenantId}, true)`;
      return await work(transaction);
    });
  });
};
