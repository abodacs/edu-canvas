import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import postgres from 'postgres'

import { withFoundationBootstrapLock } from '../src/server/persistence/bootstrap-lock.mjs'

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
    await withFoundationBootstrapLock(sql, async () => {
      await sql`
        create table if not exists app_migrations (
          name text primary key,
          checksum text not null,
          applied_at timestamptz not null default now()
        )
      `
      await sql`
        alter table app_migrations
        add column if not exists checksum text
      `

      for (const name of migrationFiles) {
        const contents = await readFile(
          `${migrationsDirectory}/${name}`,
          'utf8',
        )
        const checksum = createHash('sha256')
          .update(contents, 'utf8')
          .digest('hex')
        const [applied] = await sql`
          select checksum from app_migrations where name = ${name}
        `

        if (applied) {
          if (applied.checksum === null) {
            await sql`
              update app_migrations
              set checksum = ${checksum}
              where name = ${name} and checksum is null
            `
            console.log(`Baselined migration checksum ${name}`)
            continue
          }

          if (applied.checksum !== checksum) {
            throw new Error(
              `Migration checksum mismatch for ${name}; applied migrations are immutable.`,
            )
          }
          continue
        }

        await sql.begin(async (transaction) => {
          await transaction.unsafe(contents)
          await transaction`
            insert into app_migrations (name, checksum)
            values (${name}, ${checksum})
          `
        })
        console.log(`Applied migration ${name}`)
      }
    })
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
