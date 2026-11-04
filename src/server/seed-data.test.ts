import { describe, expect, it } from "vitest";

import {
  A2UI_CATALOG_VERSION,
  a2uiCatalogVersionForId,
  a2uiCatalogs,
} from "@/shared/a2ui-contract";

import { builtInStandardsPacks } from "./curriculum/built-in-packs";
import { syntheticLearnerDirectory } from "./identity/synthetic-fixture";
import { getSyntheticSeedCounts } from "./persistence/seed-catalog";
import { assertSeedIntegrity, syntheticSeed } from "./seed-data";

describe("synthetic seed", () => {
  it("has stable unique identifiers and expected fixture counts", () => {
    expect(() => assertSeedIntegrity()).not.toThrow();
    expect(getSyntheticSeedCounts()).toStrictEqual({
      tenants: 1,
      identities: 2,
      standards: builtInStandardsPacks.length,
      graphNodes: 2,
      graphEdges: 1,
      activities: 1,
      activityVersions: 1,
      attempts: 1,
    });
  });

  // #110: the fixture and the live preview are one catalog identity.
  it("pins the live catalog the preview and renderer accept", () => {
    const { catalogVersion } = syntheticSeed.activityVersion;

    expect(catalogVersion).toBe(A2UI_CATALOG_VERSION);
    expect(
      a2uiCatalogVersionForId(a2uiCatalogs[A2UI_CATALOG_VERSION].catalogId)
    ).toBe(A2UI_CATALOG_VERSION);
  });

  it("keeps the private answer key out of the public seed projection", () => {
    const { publicContent } = syntheticSeed.activityVersion;
    const serialized = JSON.stringify(publicContent);

    expect(serialized).not.toContain("answerKey");
    expect(serialized).not.toContain("correctTargets");
    expect(
      Object.keys(publicContent).toSorted((a, b) => a.localeCompare(b))
    ).toStrictEqual(["prompt", "source", "targets"]);
  });

  // Two seeded students once shared one display name, so the publish picker
  // bound the identity without a membership and the film captured the wrong
  // learner. Every student a teacher can see in one class has its own name.
  it("gives every seeded student in a class a distinct display name", () => {
    const students = [
      ...syntheticSeed.identities
        .filter((identity) => identity.role === "student")
        .map((identity) => {
          return {
            tenantId: syntheticSeed.tenant.id,
            displayName: identity.displayName,
          };
        }),
      ...syntheticLearnerDirectory,
    ];
    const keys = students.map(
      (student) => `${student.tenantId}:${student.displayName}`
    );

    expect(new Set(keys).size).toBe(keys.length);
  });
});
