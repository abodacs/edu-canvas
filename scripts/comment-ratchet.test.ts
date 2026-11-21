import { describe, expect, it } from "vitest";
import { clampCeiling, isDirectiveComment, totalOf } from "./comment-ratchet";

describe("comment ceiling clamp", () => {
  it("keeps counts that fall and prunes files that reached zero", () => {
    const result = clampCeiling(
      { "src/a.ts": 4, "src/b.ts": 2 },
      { "src/a.ts": 1, "src/c.ts": 3 }
    );
    expect(result.files).toStrictEqual({ "src/a.ts": 1, "src/c.ts": 3 });
    expect(result.refused).toStrictEqual([]);
  });

  it("refuses a raise and keeps the previous ceiling for that file", () => {
    const result = clampCeiling({ "src/a.ts": 2 }, { "src/a.ts": 9 });
    expect(result.files).toStrictEqual({ "src/a.ts": 2 });
    expect(result.refused).toStrictEqual(["src/a.ts: 2 -> 9"]);
  });

  it("treats an absent previous ceiling as zero and accepts any first count", () => {
    const result = clampCeiling({}, { "src/new.ts": 5 });
    expect(result.files).toStrictEqual({ "src/new.ts": 5 });
    expect(result.refused).toStrictEqual([]);
  });

  it("refuses nothing when a file falls to zero", () => {
    const result = clampCeiling({ "src/a.ts": 3 }, {});
    expect(result.files).toStrictEqual({});
    expect(result.refused).toStrictEqual([]);
  });

  it("totals a per-file map", () => {
    expect(totalOf({ "src/a.ts": 2, "src/b.ts": 3 })).toBe(5);
    expect(totalOf(undefined)).toBe(0);
  });
});

describe("directive classification", () => {
  it.each([
    "@ts-expect-error the provider stub needs it",
    "@ts-ignore",
    "@ts-nocheck",
    "eslint-disable-next-line unicorn/prefer-spread",
    "oxlint-disable",
    "biome-ignore -- reason",
    "prettier-ignore",
    "v8 ignore next",
    "@__PURE__",
  ])("recognises %s", (text) => {
    expect(isDirectiveComment(text)).toBeTruthy();
  });

  it.each([
    "the provider expects a lease here",
    "TODO: fix the lease",
    "disable the limiter before the call",
  ])("keeps prose out of the directive set: %s", (text) => {
    expect(isDirectiveComment(text)).toBeFalsy();
  });
});
