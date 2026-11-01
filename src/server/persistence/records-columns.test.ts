import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "../../../drizzle/schema";
import { recordTableColumns } from "./records-port";

/**
The record layer names its columns twice: once in `drizzle/schema.ts`, which owns
the migration journal, and once in the seeded backend's allowlist. Nothing in
the runtime reads the schema, so a rename there would surface only as failing SQL
in production. This binds the two.
*/
const tablesByName = new Map<string, PgTable>();
for (const exported of Object.values(schema)) {
  if (is(exported, PgTable)) {
    tablesByName.set(getTableName(exported), exported);
  }
}

describe("record column allowlist", () => {
  it("names only tables the schema declares", () => {
    const missing = Object.keys(recordTableColumns).filter((table) => {
      return !tablesByName.has(table);
    });

    expect(missing).toStrictEqual([]);
  });

  it("names only columns the schema declares", () => {
    const drift: string[] = [];
    for (const [table, columns] of Object.entries(recordTableColumns)) {
      const declared = tablesByName.get(table);
      if (!declared) {
        continue;
      }
      // `getTableColumns` keys by the TypeScript property; the allowlist and
      // every query name the stored column.
      const schemaColumns = new Set(
        Object.values(getTableColumns(declared)).map((column) => column.name)
      );
      for (const column of columns) {
        if (!schemaColumns.has(column)) {
          drift.push(`${table}.${column}`);
        }
      }
    }

    expect(drift).toStrictEqual([]);
  });
});
