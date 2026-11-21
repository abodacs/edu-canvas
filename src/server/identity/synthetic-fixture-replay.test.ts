import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { createPostgresIdentityPersistence } from "../persistence/identity-postgres";
import { ensureSyntheticIdentityFixture } from "./synthetic-fixture";

const databaseUrl = process.env.DATABASE_URL;
const isRun = process.env.RUN_DATABASE_TESTS === "true" && Boolean(databaseUrl);

const requireUrl = (): string => {
  if (databaseUrl === undefined || databaseUrl === "") {
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
