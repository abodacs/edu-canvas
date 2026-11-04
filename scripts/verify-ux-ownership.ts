import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { judgeSliceDiff, mapIssues, ownershipMapSchema } from "./ux-ownership";

/**
 * The UX ownership gate.
 *
 * `pnpm verify:ux-ownership` checks the map in scripts/ux-ownership.json
 * against the tracked files. `--diff <base> --slice <name>` also judges the
 * files the branch changed since its merge base with <base>.
 */

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const mapPath = fileURLToPath(new URL("ux-ownership.json", import.meta.url));

const git = (...gitArguments: string[]): string[] =>
  execFileSync("git", gitArguments, { cwd: projectRoot, encoding: "utf-8" })
    .split("\n")
    .filter((line) => line.length > 0);

const readOption = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} needs a value.`);
  }
  return value;
};

const map = ownershipMapSchema.parse(
  JSON.parse(readFileSync(mapPath, "utf-8"))
);
const trackedFiles = git("ls-files");
const issues = mapIssues(map, trackedFiles);

const base = readOption("--diff");
const slice = readOption("--slice");
if ((base === undefined) !== (slice === undefined)) {
  throw new Error("--diff and --slice must be given together.");
}

if (base !== undefined && slice !== undefined) {
  const changedFiles = git("diff", "--name-only", `${base}...HEAD`);
  const verdict = judgeSliceDiff(map, slice, changedFiles);
  issues.push(...verdict.violations);
  for (const file of verdict.unowned) {
    console.log(`note: ${file} has no UX owner.`);
  }
  console.log(
    `${changedFiles.length} changed file(s) judged for slice ${slice} against ${base}.`
  );
}

if (issues.length > 0) {
  console.error("UX ownership check failed:");
  for (const issue of issues) {
    console.error(`  - ${issue}`);
  }
  process.exit(1);
}

console.log(
  `UX ownership map holds: ${Object.keys(map.owners).length} owners, ${trackedFiles.length} tracked files checked.`
);
