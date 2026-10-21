import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

import { withFoundationBootstrapLock } from "../src/server/persistence/bootstrap-lock.mjs";

const { resolve } = path;

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

export const runDatabaseMigrations = async (databaseUrl) => {
  assertDatabaseUrl(databaseUrl);

  const migrationsDirectory = fileURLToPath(
    new URL("../migrations/", import.meta.url)
  );
  const entries = await readdir(migrationsDirectory);
  const migrationFiles = entries
    .filter((file) => file.endsWith(".sql"))
    .toSorted((left, right) => left.localeCompare(right));

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
      await sql`
        create table if not exists app_migrations (
          name text primary key,
          checksum text not null,
          applied_at timestamptz not null default now()
        )
      `;
      await sql`
        alter table app_migrations
        add column if not exists checksum text
      `;

      for (const name of migrationFiles) {
        // Migrations apply in file order against one connection.
        // eslint-disable-next-line no-await-in-loop
        const contents = await readFile(
          `${migrationsDirectory}/${name}`,
          "utf-8"
        );
        const checksum = createHash("sha256")
          .update(contents, "utf-8")
          .digest("hex");
        // eslint-disable-next-line no-await-in-loop
        const [applied] = await sql`
          select checksum from app_migrations where name = ${name}
        `;

        if (!applied) {
          // eslint-disable-next-line no-await-in-loop
          await sql.begin(async (transaction) => {
            await transaction.unsafe(contents);
            await transaction`
              insert into app_migrations (name, checksum)
              values (${name}, ${checksum})
            `;
          });
          console.log(`Applied migration ${name}`);
        } else if (applied.checksum === null) {
          // eslint-disable-next-line no-await-in-loop
          await sql`
            update app_migrations
            set checksum = ${checksum}
            where name = ${name} and checksum is null
          `;
          console.log(`Baselined migration checksum ${name}`);
        } else if (applied.checksum !== checksum) {
          throw new Error(
            `Migration checksum mismatch for ${name}; applied migrations are immutable.`
          );
        }
      }
    });
  } finally {
    await sql.end({ timeout: 3 });
  }
};

const scriptArgumentIndex = 1;

if (
  process.argv.at(scriptArgumentIndex) &&
  import.meta.filename === resolve(process.argv.at(scriptArgumentIndex))
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
