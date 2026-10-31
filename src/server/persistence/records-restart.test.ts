import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const isEnabled = process.env.RUN_DATABASE_TESTS === "true";
const isRun = Boolean(databaseUrl && isEnabled);

const runProbe = (
  probeArguments: readonly string[]
): Record<string, unknown> => {
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/records-restart-probe.ts", ...probeArguments],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: "utf-8",
    }
  );
  return JSON.parse(output) as Record<string, unknown>;
};

describe.skipIf(!isRun)("record restart", () => {
  it("a second process reads records committed by the first", () => {
    const write = runProbe(["--phase", "write"]);
    const read = runProbe([
      "--phase",
      "read",
      "--run-id",
      String(write.runId),
      "--learner-run-id",
      String(write.learnerRunId),
    ]);

    expect(read.ok).toBeTruthy();
    expect(read.attempts).toBe(1);
    expect(read.decisions).toBe(1);
    expect(read.stage).toBe("advanced");
  }, 120_000);
});
