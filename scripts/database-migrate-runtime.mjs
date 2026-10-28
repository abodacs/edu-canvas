import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const journal = JSON.parse(await readFile(journalPath, "utf-8"));
  const entries = [];
  let previousWhen = -Infinity;

  for (const entry of journal.entries) {
    if (Number(entry.when) <= previousWhen) {
      throw new Error(
        `Migration journal is not strictly ordered at ${entry.tag}; regenerate the migration instead of reordering it.`
      );
    }
    previousWhen = Number(entry.when);
    // eslint-disable-next-line no-await-in-loop -- journal order is sequential.
    const contents = await readFile(
      path.join(migrationsDirectory, `${entry.tag}.sql`),
      "utf-8"
    );
    entries.push({
      tag: entry.tag,
      when: Number(entry.when),
      hash: createHash("sha256").update(contents, "utf-8").digest("hex"),
    });
  }

  return entries;
};

const assertLedgerMatchesJournal = async (sql, entries) => {
  if (!entries.length) {
    return entries.length;
  }

  const [ledger] = await sql`
    select to_regclass(${ledgerTable}) is not null as exists
  `;
  if (!ledger.exists) {
    return entries.length;
  }

  const [applied] = await sql`
    select coalesce(max(created_at), 0) as last, array_agg(hash) as hashes
    from drizzle.__edu_canvas_drizzle_migrations
  `;
  const last = Number(applied.last);
  const hashes = new Set(applied.hashes);

  for (const entry of entries) {
    if (entry.when > last) {
      continue;
    }
    if (!hashes.has(entry.hash)) {
      throw new Error(
        `Migration ${entry.tag} is unapplied but is not newer than the last applied migration. ` +
          "Drizzle would skip it silently; regenerate the migration so its journal timestamp is current."
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

if (
  process.argv.at(scriptArgumentIndex) &&
  import.meta.filename === path.resolve(process.argv.at(scriptArgumentIndex))
) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    try {
      await runDatabaseMigrations(databaseUrl);
    } catch (error) {
      console.error(
        "Database migration failed:",
        Error.isError(error) ? error.message : "Unknown error."
      );
      process.exitCode = 1;
    }
  } else {
    console.error("Database migration requires DATABASE_URL.");
    process.exitCode = 1;
  }
}
