import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  actors,
  assistanceEvents,
  assignments,
  curatedReferences,
  identities,
  identitySessions,
  learnerAttempts,
  learnerRuns,
  lessonDraftRequests,
  lessonPackages,
  lessonVersions,
  memberships,
  operationReceipts,
  prerequisiteNodes,
  publications,
  sourceSnapshots,
  standards,
  teacherDecisions,
  tenants,
} from "../../../drizzle/schema";
import { recordTableColumns } from "./records-port";
import type { PgTable } from "drizzle-orm/pg-core";

// The record layer names its columns twice: once in drizzle/schema.ts, which owns the migration journal, and once in the seeded backend's allowlist.
// Nothing at runtime reads the schema, so a renamed column would surface only
// as failing SQL in production. This binds the two.
const boundTables: readonly (readonly [string, PgTable])[] = [
  ["actors", actors],
  ["assignments", assignments],
  ["assistance_events", assistanceEvents],
  ["curated_references", curatedReferences],
  ["identities", identities],
  ["identity_sessions", identitySessions],
  ["learner_attempts", learnerAttempts],
  ["learner_runs", learnerRuns],
  ["lesson_draft_requests", lessonDraftRequests],
  ["lesson_packages", lessonPackages],
  ["lesson_versions", lessonVersions],
  ["memberships", memberships],
  ["operation_receipts", operationReceipts],
  ["prerequisite_nodes", prerequisiteNodes],
  ["publications", publications],
  ["source_snapshots", sourceSnapshots],
  ["standards", standards],
  ["teacher_decisions", teacherDecisions],
  ["tenants", tenants],
];

const tableByName = new Map(boundTables);

// getTableColumns keys by TypeScript property; every query names the column.
const storedColumnNames = (table: PgTable): Set<string> => {
  return new Set(
    Object.values(getTableColumns(table)).map((column) => column.name)
  );
};

describe("record column allowlist", () => {
  it("binds every allowlisted table", () => {
    const unbound = Object.keys(recordTableColumns).filter(
      (table) => !tableByName.has(table)
    );

    expect(unbound).toStrictEqual([]);
  });

  it("names only columns the schema declares", () => {
    const drift: string[] = [];
    const entries = Object.entries(recordTableColumns);
    for (const [table, columns] of entries) {
      const declared = tableByName.get(table);
      if (!declared) {
        continue;
      }
      const schemaColumns = storedColumnNames(declared);
      for (const column of columns) {
        if (!schemaColumns.has(column)) {
          drift.push(`${table}.${column}`);
        }
      }
    }

    expect(drift).toStrictEqual([]);
  });

  it("matches the schema's own table names", () => {
    const renames = boundTables
      .filter(([stored, table]) => getTableName(table) !== stored)
      .map(([stored, table]) => `${stored} is ${getTableName(table)}`);

    expect(renames).toStrictEqual([]);
  });
});
