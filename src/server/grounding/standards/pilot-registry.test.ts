import { describe, expect, it } from "vitest";

import {
  PILOT_BOUNDARY_ENTRIES,
  PILOT_REGISTRY_VERSION,
  PILOT_STANDARD_REGISTRY,
  findRegistryEntry,
} from "./pilot-registry";
import {
  recordedColdRuns,
  recordedEvidence,
} from "./fixtures/learning-commons-replay";

const pilotEntries = PILOT_STANDARD_REGISTRY.entries.filter((entry) => {
  return entry.kind === "pilot";
});

describe("pilot standard registry (issue 218)", () => {
  it("pins a version and the eight supported pilot rows", () => {
    expect(PILOT_REGISTRY_VERSION).toMatch(/^pilot-registry-v\d+$/u);
    expect(pilotEntries).toHaveLength(8);
    expect(new Set(pilotEntries.map((entry) => entry.id)).size).toBe(8);

    const combinations = pilotEntries.map((entry) => {
      return `${entry.jurisdiction}\0${entry.statementCode}`;
    });
    expect(new Set(combinations).size).toBe(8);
  });

  it("matches every pilot row to a recorded cold run", () => {
    for (const entry of pilotEntries) {
      const run = recordedColdRuns.find((candidate) => {
        return (
          candidate.row.jurisdiction === entry.jurisdiction &&
          candidate.row.code === entry.statementCode
        );
      });
      expect(run, `${entry.id} has no recorded run`).toBeDefined();
      expect(run?.resolvedStandard.statementCode).toBe(entry.statementCode);
      expect(run?.resolvedStandard.jurisdiction).toBe(entry.jurisdiction);
    }
  });

  it("covers both jurisdictions for the four fraction and operations codes", () => {
    const codes = new Set(pilotEntries.map((entry) => entry.statementCode));
    expect(codes).toStrictEqual(
      new Set(["4.NF.A.1", "4.NF.A.2", "3.NF.A.3", "4.OA.A.3"])
    );
    expect(
      new Set(pilotEntries.map((entry) => entry.jurisdiction))
    ).toStrictEqual(new Set(["Multi-State", "California"]));
  });

  it.each(PILOT_BOUNDARY_ENTRIES)(
    "records the boundary expectation for $id",
    (boundary) => {
      const lookup = findRegistryEntry(PILOT_STANDARD_REGISTRY, {
        jurisdiction: boundary.jurisdiction,
        statementCode: boundary.statementCode,
      });
      const expected =
        boundary.id === "ela-progression"
          ? "resolved"
          : boundary.expectedGaps[0];
      const actual = lookup.ok ? "resolved" : lookup.gap.code;
      expect(actual).toBe(expected);
    }
  );

  it("resolves the recorded ELA boundary row so the progression warning is visible", () => {
    expect(recordedEvidence.elaBoundary.progressionIsError).toBeTruthy();
    const lookup = findRegistryEntry(PILOT_STANDARD_REGISTRY, {
      jurisdiction: "Multi-State",
      statementCode: recordedEvidence.elaBoundary.resolvedCode,
    });
    expect(lookup.ok).toBeTruthy();
    expect(
      PILOT_STANDARD_REGISTRY.entries.find((entry) => {
        return (
          entry.statementCode === recordedEvidence.elaBoundary.resolvedCode
        );
      })?.kind
    ).toBe("boundary");
  });

  it("adds a row as data without changing resolution code", () => {
    const extended = {
      ...PILOT_STANDARD_REGISTRY,
      entries: [
        ...PILOT_STANDARD_REGISTRY.entries,
        {
          id: "multi-state-4.NBT.B.6",
          kind: "pilot" as const,
          jurisdiction: "Multi-State",
          statementCode: "4.NBT.B.6",
          subject: "Mathematics",
          grade: 4,
          frameworkId: "ccss-math",
          prerequisiteResolution: "direct" as const,
          provenance: {
            license: "CC BY 4.0",
            attribution: "Learning Commons Knowledge Graph",
            sourceLink: "https://www.learningcommons.org/",
          },
          expectedGaps: [],
        },
      ],
    };

    expect(
      findRegistryEntry(extended, {
        jurisdiction: "Multi-State",
        statementCode: "4.NBT.B.6",
      })
    ).toMatchObject({ ok: true, entry: { id: "multi-state-4.NBT.B.6" } });
  });
});
