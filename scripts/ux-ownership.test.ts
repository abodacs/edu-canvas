import { describe, expect, it } from "vitest";

import { judgeSliceDiff, mapIssues, ownershipMapSchema } from "./ux-ownership";

const fixtureMap = ownershipMapSchema.parse({
  note: "fixture",
  owners: {
    foundation: ["src/styles/base.css", "src/components/ui/**"],
    review: ["src/styles/review.css"],
    publish: ["src/styles/publish.css"],
    landing: ["src/components/landing/**"],
  },
  pending: { "src/components/landing/**": "created by the slice" },
  deleted: ["src/components/auth/account-header.tsx"],
});

const trackedFiles = [
  "src/styles/base.css",
  "src/components/ui/button.tsx",
  "src/styles/review.css",
  "src/styles/publish.css",
  "src/server/seed-data.ts",
];

describe(mapIssues, () => {
  it("accepts a map with one owner per file", () => {
    expect(mapIssues(fixtureMap, trackedFiles)).toStrictEqual([]);
  });

  it("rejects a file claimed by two owners", () => {
    const map = {
      ...fixtureMap,
      owners: { ...fixtureMap.owners, review: ["src/styles/*.css"] },
    };
    expect(mapIssues(map, trackedFiles)).toContain(
      "src/styles/base.css matches 2 owners: foundation, review."
    );
  });

  it("rejects a pattern listed twice", () => {
    const map = {
      ...fixtureMap,
      owners: { ...fixtureMap.owners, publish: ["src/styles/review.css"] },
    };
    expect(mapIssues(map, trackedFiles)).toContainEqual(
      expect.stringContaining("pattern src/styles/review.css is listed twice")
    );
  });

  it("rejects a pattern that matches nothing", () => {
    const map = {
      ...fixtureMap,
      owners: { ...fixtureMap.owners, publish: ["src/styles/publsh.css"] },
    };
    expect(mapIssues(map, trackedFiles)).toContainEqual(
      expect.stringContaining(
        "pattern src/styles/publsh.css (publish) matches no tracked file"
      )
    );
  });

  it("rejects a pending entry that now matches files", () => {
    expect(
      mapIssues(fixtureMap, [
        ...trackedFiles,
        "src/components/landing/scene.tsx",
      ])
    ).toContainEqual(
      expect.stringContaining("is listed in pending but now matches")
    );
  });

  it("rejects a deleted path that is still tracked", () => {
    expect(
      mapIssues(fixtureMap, [
        ...trackedFiles,
        "src/components/auth/account-header.tsx",
      ])
    ).toStrictEqual([
      "src/components/auth/account-header.tsx is listed as deleted but is still tracked.",
    ]);
  });
});

describe(judgeSliceDiff, () => {
  it("allows the slice's own files and reports unowned ones", () => {
    expect(
      judgeSliceDiff(fixtureMap, "review", [
        "src/styles/review.css",
        "src/server/seed-data.ts",
      ])
    ).toStrictEqual({ violations: [], unowned: ["src/server/seed-data.ts"] });
  });

  it("denies another slice's file and a foundation file", () => {
    const verdict = judgeSliceDiff(fixtureMap, "review", [
      "src/styles/publish.css",
      "src/components/ui/button.tsx",
      "src/components/auth/account-header.tsx",
    ]);
    expect(verdict.violations).toStrictEqual([
      "src/styles/publish.css is owned by publish, not review.",
      "src/components/ui/button.tsx is owned by foundation, not review.",
      "src/components/auth/account-header.tsx is owned by foundation, not review.",
    ]);
  });

  it("rejects an unknown slice and the foundation as a slice", () => {
    expect(() => judgeSliceDiff(fixtureMap, "billing", [])).toThrow(
      'unknown slice "billing"'
    );
    expect(() => judgeSliceDiff(fixtureMap, "foundation", [])).toThrow(
      "unknown slice"
    );
  });
});
