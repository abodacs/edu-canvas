import { readDatabaseBootstrapConfig } from '@/server/config'

import { runDatabaseMigrations } from './db-migrate-runtime.mjs'

function getDatabaseUrl(): string {
  const config = readDatabaseBootstrapConfig(process.env)
  if (config.issues.length > 0 || !config.databaseUrl) {
    console.error(
      JSON.stringify(
        {
          message:
            'Database migration requires a valid DATABASE_URL and synthetic data mode.',
          issues: config.issues,
        },
        null,
        2,
      ),
    )
    throw new Error('Database migration configuration is invalid.')
  }

  return config.databaseUrl
}

async function main() {
  await runDatabaseMigrations(getDatabaseUrl())
}

await main()
