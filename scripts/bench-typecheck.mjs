/* eslint-disable no-magic-numbers -- timing constants and median math are self-explanatory */
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const DEFAULT_RUNS = 3;
const MIN_RUNS = 1;
const MEDIAN_MIDDLE = 2;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const readRuns = () => {
  const runs = Number(process.env.RUNS ?? DEFAULT_RUNS);

  if (!Number.isSafeInteger(runs) || runs < MIN_RUNS) {
    throw new Error(`RUNS must be a positive integer, got ${process.env.RUNS}`);
  }

  return runs;
};

const runs = readRuns();
const isWindows = process.platform === "win32";

const median = (samples) => {
  const middle = Math.floor(samples.length / MEDIAN_MIDDLE);

  return samples.length % MEDIAN_MIDDLE === 0
    ? (samples[middle - 1] + samples[middle]) / MEDIAN_MIDDLE
    : samples[middle];
};

const formatSpeedup = (ratio) =>
  ratio === null ? null : Number(ratio.toFixed(1));

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
      maxBuffer: MAX_BUFFER_BYTES,
      shell: isWindows,
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
    medianMs: Math.round(median(samples)),
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
      speedup: formatSpeedup(
        results.tsrs.medianMs === 0
          ? null
          : results.tsc.medianMs / results.tsrs.medianMs
      ),
    },
    null,
    2
  )
);

if (!isParity) {
  console.error("Diagnostics differ between tsc and tsrs.");

  const tscLines = new Set(results.tsc.output.split("\n").filter(Boolean));
  const tsrsLines = new Set(results.tsrs.output.split("\n").filter(Boolean));

  console.error("Only in tsc:");
  for (const line of tscLines) {
    if (!tsrsLines.has(line)) {
      console.error(`  ${line}`);
    }
  }

  console.error("Only in tsrs:");
  for (const line of tsrsLines) {
    if (!tscLines.has(line)) {
      console.error(`  ${line}`);
    }
  }

  process.exitCode = 1;
}
