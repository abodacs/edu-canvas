import { getTableColumns } from "drizzle-orm";
import type { Column } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { recordJsonColumns, recordTableNames } from "./records-port";
import type { RecordTableName } from "./records-port";
import { tablesByStoredName } from "./records-seeded";

const jsonColumnNames = (table: RecordTableName): Set<string> => {
  const columns: Record<string, Column> = getTableColumns(
    tablesByStoredName[table]
  );
  return new Set(
    Object.values(columns)
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
