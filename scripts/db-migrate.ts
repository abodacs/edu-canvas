import { runDatabaseMigrations } from './db-migrate-runtime.mjs'

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    console.error('Database migration requires DATABASE_URL.')
    throw new Error('Database migration configuration is invalid.')
  }

  return databaseUrl
}

async function main() {
  await runDatabaseMigrations(getDatabaseUrl())
}

await main()
