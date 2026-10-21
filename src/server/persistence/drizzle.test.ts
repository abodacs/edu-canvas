/* eslint-disable unicorn/single-line-block-comment-style -- import-x requires a single-line chunk-name comment for dynamic imports. */
import { describe, expect, it, vi } from "vitest";

import { createServerObservability } from "../observability.server";

import { createDrizzlePersistence } from "./drizzle";
import type postgresDefault from "postgres";

const postgresMock = vi.hoisted(() => {
  return vi.fn<() => never>(() => {
    throw new Error(
      "database connection failed for student identity_demo_student"
    );
  });
});

vi.mock(
  import(
    /* webpackChunkName: "postgres" */
    "postgres"
  ),
  () => {
    return {
      default: postgresMock as unknown as typeof postgresDefault,
    };
  }
);

describe("Drizzle PostgreSQL persistence", () => {
  it("reports an unavailable database through server observability", async () => {
    const events: unknown[] = [];
    const observability = createServerObservability({
      logger: (event) => {
        events.push(event);
      },
      sentry: null,
    });

    const result = await createDrizzlePersistence(
      "postgresql://user:password@db.example/app",
      { observability }
    ).check();

    expect(result).toMatchObject({
      status: "failed",
      kind: "postgres",
      code: "PERSISTENCE_UNAVAILABLE",
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      operation: "persistence.readiness",
      context: {
        dependency: "postgres",
      },
    });
    expect(JSON.stringify(events)).not.toContain("identity_demo_student");
  });
});
