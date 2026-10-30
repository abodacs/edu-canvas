import { describe, expect, it } from "vitest";

import { assertSeedIntegrity, demoSeed, getDemoSeedCounts } from "./seed-data";

describe("synthetic seed", () => {
  it("has stable unique identifiers and expected fixture counts", () => {
    expect(() => assertSeedIntegrity()).not.toThrow();
    expect(getDemoSeedCounts()).toStrictEqual({
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

  it("keeps the private answer key out of the public seed projection", () => {
    const { publicContent } = demoSeed.activityVersion;
    const serialized = JSON.stringify(publicContent);

    expect(serialized).not.toContain("answerKey");
    expect(serialized).not.toContain("correctTargets");
    expect(
      Object.keys(publicContent).toSorted((a, b) => a.localeCompare(b))
    ).toStrictEqual(["prompt", "source", "targets"]);
  });
});
