import { afterAll, describe, expect, it } from "vitest";

import postgres from "postgres";

import { createPostgresIdentityPersistence } from "../persistence/identity-postgres";
import { ensureSyntheticIdentityFixture } from "./synthetic-fixture";

/**
 * The deterministic provider provisions the synthetic fixture on every
 * sign-in flow, so a replay against real PostgreSQL must be safe. Regression
 * for the delegation pack case s0-smoke: the second provision died on the
 * tenants slug unique index because `on conflict (id)` does not arbitrate the
 * other constraint. Gates itself on RUN_DATABASE_TESTS and DATABASE_URL.
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
  const opened: postgres.Sql[] = [];

  afterAll(async () => {
    await Promise.all(opened.map((client) => client.end({ timeout: 3 })));
  });

  // Two full sequential provisions on a cold database exceed the default.
  it(
    "replays the fixture without unique-constraint failures",
    { timeout: 60_000 },
    async () => {
      const client = postgres(requireUrl(), { max: 1 });
      opened.push(client);

      const persistence = createPostgresIdentityPersistence(
        process.env.DATABASE_URL as string
      );

      await expect(
        ensureSyntheticIdentityFixture(persistence)
      ).resolves.toBeUndefined();
      await expect(
        ensureSyntheticIdentityFixture(persistence)
      ).resolves.toBeUndefined();
    }
  );
});
