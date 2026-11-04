import { describe, expect, it } from "vitest";

import {
  PILOT_REGISTRY_VERSION,
  PILOT_STANDARD_REGISTRY,
  findRegistryEntry,
  gradeFromStatementCode,
} from "./pilot-registry";
import {
  recordedColdRuns,
  recordedEvidence,
  recordedFreeTextEvidence,
} from "./fixtures/learning-commons-replay";
import { LEARNING_COMMONS_REST_ORIGIN } from "./learning-commons-rest";

const pilotEntries = PILOT_STANDARD_REGISTRY.entries.filter((entry) => {
  return entry.kind === "pilot";
});

// The boundary matrix is a test expectation, not production registry data.
const PILOT_BOUNDARY_ENTRIES = [
  {
    id: "unsupported-jurisdiction",
    jurisdiction: "Atlantis",
    statementCode: "4.NF.A.1",
    expectedGaps: ["unsupported-envelope"] as const,
  },
  {
    id: "out-of-envelope-grade",
    jurisdiction: "Multi-State",
    statementCode: "9.ZZ.Z.9",
    expectedGaps: ["unsupported-envelope"] as const,
  },
  {
    id: "absent-code",
    jurisdiction: "Multi-State",
    statementCode: "4.NF.A.99",
    expectedGaps: ["standard-absent"] as const,
  },
  {
    id: "ela-progression",
    jurisdiction: "Multi-State",
    statementCode: "RI.5.2",
    expectedGaps: ["prerequisites-unavailable"] as const,
  },
] as const;

describe("pilot standard registry (issue 218)", () => {
  it("derives the grade from a math or ELA statement code", () => {
    expect(gradeFromStatementCode("4.NF.A.1")).toBe(4);
    expect(gradeFromStatementCode("RI.5.2")).toBe(5);
  });

  it("pins a version and the four supported pilot rows", () => {
    expect(PILOT_REGISTRY_VERSION).toMatch(/^pilot-registry-v\d+$/u);
    expect(pilotEntries).toHaveLength(4);
    expect(new Set(pilotEntries.map((entry) => entry.id)).size).toBe(4);

    const combinations = pilotEntries.map((entry) => {
      return `${entry.jurisdiction}\0${entry.statementCode}`;
    });
    expect(new Set(combinations).size).toBe(4);
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

  it("covers the four fraction and operations codes in Multi-State only", () => {
    const codes = new Set(pilotEntries.map((entry) => entry.statementCode));
    expect(codes).toStrictEqual(
      new Set(["4.NF.A.1", "4.NF.A.2", "3.NF.A.3", "4.OA.A.3"])
    );
    // Product decision 2026-11-04: the pilot ships Multi-State only.
    expect(
      new Set(pilotEntries.map((entry) => entry.jurisdiction))
    ).toStrictEqual(new Set(["Multi-State"]));
    expect(
      new Set(
        PILOT_STANDARD_REGISTRY.envelopes.map(
          (envelope) => envelope.jurisdiction
        )
      )
    ).toStrictEqual(new Set(["Multi-State"]));
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

  it("treats free-text evidence as context, never as the resolution input", () => {
    const documented = recordedFreeTextEvidence.rows.filter((row) => {
      return (
        row.kind === "documented" && row.expectedCode !== null && row.rest?.ok
      );
    });
    const restHits = documented.filter((row) => {
      return row.rest?.codes.includes(row.expectedCode ?? "");
    });

    expect(restHits.length).toBeGreaterThan(0);
    expect(recordedFreeTextEvidence.environment.restOrigin).toBe(
      LEARNING_COMMONS_REST_ORIGIN
    );
    expect(
      findRegistryEntry(PILOT_STANDARD_REGISTRY, {
        jurisdiction: "Multi-State",
        statementCode: "explain equivalent fractions",
      }).ok
    ).toBeFalsy();
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
