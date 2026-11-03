import { describe, expect, it } from "vitest";

import {
  A2UI_CATALOG_VERSION,
  a2uiCatalogVersionForId,
  a2uiCatalogs,
} from "@/shared/a2ui-contract";

import {
  assertSeedIntegrity,
  syntheticSeed,
  getSyntheticSeedCounts,
} from "./seed-data";

describe("synthetic seed", () => {
  it("has stable unique identifiers and expected fixture counts", () => {
    expect(() => assertSeedIntegrity()).not.toThrow();
    expect(getSyntheticSeedCounts()).toStrictEqual({
      tenants: 1,
      identities: 2,
      standards: 1,
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
});
