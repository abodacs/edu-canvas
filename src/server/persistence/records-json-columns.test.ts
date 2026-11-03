import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { recordJsonColumns, recordTableNames } from "./records-port";
import type { RecordTableName } from "./records-port";
import { tablesByStoredName } from "./records-seeded";

// The PostgreSQL adapter stringifies every value it writes and casts only the
// columns in `recordJsonColumns` back to jsonb. A jsonb column missing from
// that list stores a JSON string scalar, so the record parse reads
// "expected object, received string". This binds the list to the jsonb
// columns the schema declares, in both directions.
const jsonColumnNames = (table: RecordTableName): Set<string> => {
  const columns = Object.values(getTableColumns(tablesByStoredName[table]));
  return new Set(
    columns
      .filter((column) => column.dataType === "json")
      .map((column) => column.name)
  );
};

describe("record json column list", () => {
  it("names every jsonb column the schema declares", () => {
    const drift: string[] = [];
    for (const table of recordTableNames) {
      const listed = new Set(recordJsonColumns[table]);
      for (const column of jsonColumnNames(table)) {
        if (!listed.has(column)) {
          drift.push(`${table}.${column}`);
        }
      }
    }

    expect(drift).toStrictEqual([]);
  });

  it("names only jsonb columns the schema declares", () => {
    const drift: string[] = [];
    for (const table of recordTableNames) {
      const declared = jsonColumnNames(table);
      for (const column of recordJsonColumns[table] ?? []) {
        if (!declared.has(column)) {
          drift.push(`${table}.${column}`);
        }
      }
    }

    expect(drift).toStrictEqual([]);
  });
});
