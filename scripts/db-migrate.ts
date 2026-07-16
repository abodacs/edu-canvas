import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import postgres from 'postgres'

import { readServerConfig } from '@/server/config'

import { withFoundationBootstrapLock } from '@/server/persistence/bootstrap-lock'

function getDatabaseUrl(): string {
  const config = readServerConfig(process.env)
  if (config.issues.length > 0 || !config.databaseUrl) {
    console.error(
      JSON.stringify(
        {
          message:
            'Database migration requires a valid DATABASE_URL and synthetic mode.',
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
  const databaseUrl = getDatabaseUrl()
  const migrationsDirectory = fileURLToPath(
    new URL('../migrations/', import.meta.url),
  )
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort()

  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    prepare: false,
  })

  try {
    await withFoundationBootstrapLock(sql, async () => {
      await sql`
        create table if not exists app_migrations (
          name text primary key,
          applied_at timestamptz not null default now()
        )
      `

      for (const name of migrationFiles) {
        const applied = await sql`
          select name from app_migrations where name = ${name}
        `
        if (applied.length > 0) continue

        const contents = await readFile(
          `${migrationsDirectory}/${name}`,
          'utf8',
        )
        await sql.begin(async (transaction) => {
          await transaction.unsafe(contents)
          await transaction`
            insert into app_migrations (name) values (${name})
          `
        })
        console.log(`Applied migration ${name}`)
      }
    })
  } finally {
    await sql.end({ timeout: 3 })
  }
}

await main()
