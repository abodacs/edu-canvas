import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { withFoundationBootstrapLock } from "../src/server/persistence/bootstrap-lock.mjs";

const migrationsTable = "__edu_canvas_drizzle_migrations";
const migrationsSchema = "drizzle";
const noPendingMigrations = 0;
const singleMigration = 1;
const migrationsDirectory = fileURLToPath(
  new URL("../drizzle/", import.meta.url)
);
const ledgerTable = `${migrationsSchema}.${migrationsTable}`;

const parseDatabaseUrl = (databaseUrl) => {
  try {
    return new URL(databaseUrl);
  } catch {
    return null;
  }
};

const isPostgresProtocol = (url) =>
  ["postgres:", "postgresql:"].includes(url.protocol);

const assertDatabaseUrl = (databaseUrl) => {
  const url = parseDatabaseUrl(databaseUrl);
  if (!url || !isPostgresProtocol(url)) {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
};

const readJournal = async () => {
  const journalPath = path.join(migrationsDirectory, "meta/_journal.json");
  const { entries } = JSON.parse(await readFile(journalPath, "utf-8"));
  const migrations = readMigrationFiles({
    migrationsFolder: migrationsDirectory,
  });
  const ordered = [];
  let previousWhen = -Infinity;

  for (const [index, entry] of entries.entries()) {
    const when = Number(entry.when);
    if (when <= previousWhen) {
      throw new Error(
        `Migration journal is not strictly ordered at ${entry.tag}; regenerate the migration instead of reordering it.`
      );
    }
    previousWhen = when;
    ordered.push({ tag: entry.tag, when, hash: migrations[index].hash });
  }

  return ordered;
};

const assertLedgerMatchesJournal = async (sql, entries) => {
  if (!entries.length) {
    return noPendingMigrations;
  }

  const [ledger] = await sql`
    select to_regclass(${ledgerTable}) is not null as exists
  `;
  if (!ledger.exists) {
    return entries.length;
  }

  const [applied] = await sql`
    select coalesce(max(created_at), 0) as last, array_agg(hash) as hashes
    from ${sql.unsafe(ledgerTable)}
  `;
  const last = Number(applied.last);
  const hashes = new Set(applied.hashes);

  for (const entry of entries) {
    if (entry.when > last) {
      continue;
    }
    if (!hashes.has(entry.hash)) {
      throw new Error(
        `Migration ${entry.tag} has no ledger entry and is not newer than the newest applied migration. ` +
          "It was edited after apply, or generated with a stale journal timestamp. Revert the edit, or regenerate the migration."
      );
    }
  }

  return entries.filter((entry) => !hashes.has(entry.hash)).length;
};

export const runDatabaseMigrations = async (databaseUrl) => {
  assertDatabaseUrl(databaseUrl);

  const connectionOptions = {
    max: 1,
    prepare: false,
    // postgres.js reads these option names in snake_case.
    // eslint-disable-next-line camelcase -- third-party option name.
    connect_timeout: 5,
    // eslint-disable-next-line camelcase -- third-party option name.
    idle_timeout: 5,
  };
  const sql = postgres(databaseUrl, connectionOptions);

  try {
    await withFoundationBootstrapLock(sql, async () => {
      const entries = await readJournal();
      const pending = await assertLedgerMatchesJournal(sql, entries);

      await migrate(drizzle(sql), {
        migrationsFolder: migrationsDirectory,
        migrationsSchema,
        migrationsTable,
      });

      const suffix = pending === singleMigration ? "" : "s";
      console.log(
        pending === noPendingMigrations
          ? "Database schema is current; no migrations applied."
          : `Applied ${pending} migration${suffix}.`
      );
    });
  } finally {
    await sql.end({ timeout: 3 });
  }
};

const scriptArgumentIndex = 1;

const describeError = (error) => {
  const cause = Error.isError(error) ? error.cause : undefined;
  if (Error.isError(cause)) {
    return cause.message;
  }
  return Error.isError(error) ? error.message : "Unknown error.";
};

if (
  process.argv.at(scriptArgumentIndex) &&
  import.meta.filename === path.resolve(process.argv.at(scriptArgumentIndex))
) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    try {
      await runDatabaseMigrations(databaseUrl);
    } catch (error) {
      console.error("Database migration failed:", describeError(error));
      process.exitCode = 1;
    }
  } else {
    console.error("Database migration requires DATABASE_URL.");
    process.exitCode = 1;
  }
}
