/* eslint-disable no-magic-numbers -- the constants below are self-explanatory */
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const DEFAULT_RUNS = 3;
const MIN_RUNS = 1;
const runs = Number(process.env.RUNS ?? DEFAULT_RUNS);

if (!Number.isSafeInteger(runs) || runs < MIN_RUNS) {
  throw new Error(`RUNS must be a positive integer, got ${process.env.RUNS}`);
}

const tools = ["tsc", "tsrs"];
const results = {};

for (const tool of tools) {
  const samples = [];
  let last;

  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    const result = spawnSync(`node_modules/.bin/${tool}`, ["--noEmit"], {
      cwd: process.cwd(),
      encoding: "utf-8",
    });
    samples.push(performance.now() - startedAt);

    if (result.error) {
      throw result.error;
    }

    last = result;
  }

  samples.sort((a, b) => a - b);
  results[tool] = {
    exitCode: last.status,
    medianMs: Math.round(samples[Math.floor(samples.length / 2)]),
    output: `${last.stdout}${last.stderr}`.trim(),
  };
}

const isParity =
  results.tsc.exitCode === results.tsrs.exitCode &&
  results.tsc.output === results.tsrs.output;

console.log(
  JSON.stringify(
    {
      runs,
      tools: results,
      isParity,
      speedup: Number(
        (results.tsc.medianMs / results.tsrs.medianMs).toFixed(1)
      ),
    },
    null,
    2
  )
);

if (!isParity) {
  console.error("Diagnostics differ between tsc and tsrs.");
  process.exitCode = 1;
}
