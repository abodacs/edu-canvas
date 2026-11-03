import { describe, expect, it } from "vitest";

import { createPostgresRecordBackend } from "./records-postgres";

/**
 * The learner run-start write races against itself when the surface
 * double-fires its start request (delegation pack case s0-smoke): two
 * transactions pass the receipt lookup, and the loser aborts on the
 * `learner_runs` natural key. The insert gains a conflict clause so the
 * loser skips the insert and re-reads the winner's row instead. This suite
 * pins the SQL the backend builds for that option.
 */

describe("records postgres insert conflict option", () => {
  const captured: string[] = [];
  const transaction = {
    unsafe: (sql: string): Promise<unknown> => {
      captured.push(sql);
      return Promise.resolve([]);
    },
  };

  it("appends the conflict clause when the option is set", async () => {
    captured.length = 0;
    const backend = createPostgresRecordBackend({
      databaseUrl: "postgres://stub.invalid/db",
    });
    await backend.insert(
      transaction as never,
      "learner_runs",
      { id: "run_1", tenant_id: "tenant_1" },
      { onConflictDoNothing: true }
    );

    expect(captured[0]).toContain("on conflict do nothing");
  });

  it("leaves the plain insert without a conflict clause", async () => {
    captured.length = 0;
    const backend = createPostgresRecordBackend({
      databaseUrl: "postgres://stub.invalid/db",
    });
    await backend.insert(transaction as never, "learner_runs", {
      id: "run_2",
      tenant_id: "tenant_1",
    });

    expect(captured[0]).not.toContain("on conflict");
  });
});
