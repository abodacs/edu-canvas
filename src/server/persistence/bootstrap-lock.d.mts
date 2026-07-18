import type postgres from 'postgres'

export type SqlClient = ReturnType<typeof postgres>

export function withFoundationBootstrapLock<T>(
  sql: SqlClient,
  work: () => Promise<T>,
): Promise<T>
