import { describe, expect, it } from "vitest";

import { builtInStandardsPacks } from "@/server/curriculum/built-in-packs";
import { syntheticSeed } from "@/server/seed-data";

import { getSyntheticSeedCounts, seededStandardRows } from "./seed-catalog";

describe("seeded standards", () => {
  it("derives one row per built-in pack", () => {
    const rows = seededStandardRows
      .map((row) => ({ id: row.id, code: row.code }))
      .toSorted((left, right) => left.id.localeCompare(right.id));
    const expected = builtInStandardsPacks
      .map((pack) => ({ id: pack.standardId, code: pack.standardCode }))
      .toSorted((left, right) => left.id.localeCompare(right.id));

    expect(rows).toStrictEqual(expected);
  });

  it("keeps the existing 4.NF.A.1 row unchanged", () => {
    expect(
      seededStandardRows.find((row) => row.id === syntheticSeed.standard.id)
    ).toStrictEqual({
      id: syntheticSeed.standard.id,
      code: syntheticSeed.standard.code,
      name: syntheticSeed.standard.name,
      subject: syntheticSeed.standard.subject,
      gradeBand: syntheticSeed.standard.gradeBand,
    });
  });

  it("counts every seeded standard", () => {
    expect(getSyntheticSeedCounts().standards).toBe(
      builtInStandardsPacks.length
    );
  });
});
