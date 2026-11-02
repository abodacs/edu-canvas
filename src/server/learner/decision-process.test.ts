import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const runProbe = (): string => {
  return execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/decision-probe.ts"],
    { cwd: process.cwd(), encoding: "utf-8" }
  );
};

describe("decision process determinism", () => {
  it("produces byte-identical reveal and decision text in a second process", () => {
    const first = runProbe();
    const second = runProbe();

    expect(first.length).toBeGreaterThan(0);
    expect(second).toBe(first);
  }, 60_000);
});
