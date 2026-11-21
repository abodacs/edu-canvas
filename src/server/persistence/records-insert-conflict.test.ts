import { describe, expect, it, vi } from "vitest";

import { createPostgresRecordBackend } from "./records-postgres";

const capturedStatements = vi.hoisted(() => {
  return {
    sql: [] as string[],
  };
});

vi.mock(import("postgres"), async (importOriginal) => {
  const actual = await importOriginal();
  const transaction = {
    unsafe: async (statement: string) => {
      capturedStatements.sql.push(statement);
      return await Promise.resolve([]);
    },
  };
  const client = {
    begin: async (work: (query: typeof transaction) => Promise<unknown>) => {
      return await work(transaction);
    },
    end: async () => {},
  };
  return {
    ...actual,
    default: Object.assign(() => client, actual.default),
  };
});

describe("records postgres insert conflict option", () => {
  it("appends the conflict clause when the option is set", async () => {
    capturedStatements.sql.length = 0;
    const backend = createPostgresRecordBackend({
      databaseUrl: "postgres://stub.invalid/db",
    });
    await backend.withTransaction(async (transaction) => {
      await backend.insert(
        transaction,
        "learner_runs",
        { id: "run_1", tenant_id: "tenant_1" },
        { onConflictDoNothing: true }
      );
    });

    expect(capturedStatements.sql[0]).toContain("on conflict do nothing");
  });

  it("leaves the plain insert without a conflict clause", async () => {
    capturedStatements.sql.length = 0;
    const backend = createPostgresRecordBackend({
      databaseUrl: "postgres://stub.invalid/db",
    });
    await backend.withTransaction(async (transaction) => {
      await backend.insert(transaction, "learner_runs", {
        id: "run_2",
        tenant_id: "tenant_1",
      });
    });

    expect(capturedStatements.sql[0]).not.toContain("on conflict");
  });
});
