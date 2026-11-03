import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { createPostgresIdentityPersistence } from "../persistence/identity-postgres";
import { ensureSyntheticIdentityFixture } from "./synthetic-fixture";

/**
 * The deterministic provider provisions the synthetic fixture on every
 * sign-in flow, so a replay against real PostgreSQL must be safe. Regression
 * for the delegation pack case s0-smoke: the second provision died on the
 * tenants slug unique index because `on conflict (id)` does not arbitrate the
 * other constraint. Gates itself on RUN_DATABASE_TESTS and DATABASE_URL.
 *
 * The fixture writes identities that the seed-count parity suite also
 * counts, and vitest orders the two files unpredictably, so this suite
 * provisions into a throwaway database beside DATABASE_URL and drops it.
 */

const databaseUrl = process.env.DATABASE_URL;
const isRun = process.env.RUN_DATABASE_TESTS === "true" && Boolean(databaseUrl);

const requireUrl = (): string => {
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for the synthetic fixture database tests."
    );
  }
  return databaseUrl;
};

describe.skipIf(!isRun)("synthetic identity fixture on postgres", () => {
  const scratchName = `edu_canvas_fixture_replay_${randomUUID().replaceAll("-", "")}`;
  const scratchUrl = (): string => {
    const url = new URL(requireUrl());
    url.pathname = `/${scratchName}`;
    return url.toString();
  };
  let admin: postgres.Sql | undefined;

  beforeAll(async () => {
    admin = postgres(requireUrl(), { max: 1 });
    await admin.unsafe(`create database ${scratchName}`);
    const migrator = postgres(scratchUrl(), { max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle(migrator), {
        migrationsFolder: "drizzle",
        migrationsSchema: "drizzle",
        migrationsTable: "__edu_canvas_drizzle_migrations",
      });
    } finally {
      await migrator.end({ timeout: 3 });
    }
  }, 120_000);

  afterAll(async () => {
    if (!admin) {
      return;
    }
    await admin.unsafe(`drop database if exists ${scratchName} with (force)`);
    await admin.end({ timeout: 3 });
  });

  // Two full sequential provisions on a cold database exceed the default.
  it(
    "replays the fixture without unique-constraint failures",
    { timeout: 60_000 },
    async () => {
      const persistence = createPostgresIdentityPersistence(scratchUrl());

      await expect(
        ensureSyntheticIdentityFixture(persistence)
      ).resolves.toBeUndefined();
      await expect(
        ensureSyntheticIdentityFixture(persistence)
      ).resolves.toBeUndefined();
    }
  );
});
