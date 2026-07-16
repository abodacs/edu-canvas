import { readServerConfig } from '@/server/config'
import { seedFoundationDatabase } from '@/server/persistence/seed-postgres'
import { demoSeed } from '@/server/seed-data'

function getDatabaseUrl(): string {
  const config = readServerConfig(process.env)
  if (config.issues.length > 0 || !config.databaseUrl) {
    console.error(
      JSON.stringify(
        {
          message:
            'Database seeding requires a valid DATABASE_URL and synthetic mode.',
          issues: config.issues,
        },
        null,
        2,
      ),
    )
    throw new Error('Database seed configuration is invalid.')
  }

  return config.databaseUrl
}

await seedFoundationDatabase(getDatabaseUrl())
console.log('Seeded ' + demoSeed.tenant.slug + ' idempotently.')
