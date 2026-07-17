import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import postgres from 'postgres'

const bootstrapLockName = 'edu-canvas:foundation-bootstrap'

function assertDatabaseUrl(databaseUrl) {
  try {
    const url = new URL(databaseUrl)
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
      throw new Error('unsupported protocol')
    }
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.')
  }
}

export async function runDatabaseMigrations(databaseUrl) {
  assertDatabaseUrl(databaseUrl)

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
    await sql`
      select set_config('statement_timeout', '30000', false),
             set_config('lock_timeout', '5000', false),
             set_config('idle_in_transaction_session_timeout', '60000', false)
    `

    const [lock] = await sql`
      select pg_try_advisory_lock(
        hashtextextended(${bootstrapLockName}, 0)
      ) as acquired
    `

    if (!lock.acquired) {
      throw new Error(
        'Another foundation migration or seed process is already running.',
      )
    }

    try {
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
    } finally {
      await sql`
        select pg_advisory_unlock(
          hashtextextended(${bootstrapLockName}, 0)
        )
      `
    }
  } finally {
    await sql.end({ timeout: 3 })
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    console.error('Database migration requires DATABASE_URL.')
    process.exitCode = 1
  } else {
    try {
      await runDatabaseMigrations(databaseUrl)
    } catch (error) {
      console.error(
        'Database migration failed:',
        error instanceof Error ? error.message : 'Unknown error.',
      )
      process.exitCode = 1
    }
  }
}
