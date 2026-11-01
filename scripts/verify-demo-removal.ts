import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Gate for issue #162: the demo-mode runtime is gone, and no code path may
// reintroduce it. The removal was a rename plus a deleted configuration flag,
// so nothing stopped a parallel change from re-adding the old flag to a setup
// guide or copying the old seed name into a new test. Both happened while this
// change was open. Any occurrence now fails `pnpm check` unless the path is a
// dated historical record.
//
// Limits: the list is token-based, not semantic. A caller that re-implements
// the removed behavior under new names passes; the dependency-cruiser rule
// `runtime-imports-in-memory-store` covers the runtime half.

const { join, relative, sep } = path;
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const scanRoots = ["src", "scripts", "docs", "drizzle", ".github"];
const scanFiles = [
  "README.md",
  "ARCHITECTURE.md",
  "CONTRIBUTING.md",
  "AGENTS.md",
  "CODING_STANDARDS.md",
  "ROADMAP.md",
  ".env.example",
  ".dependency-cruiser.cjs",
  "fly.toml",
  "package.json",
];
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".example",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

// Each removed identifier and the replacement an editor should use instead.
const removedIdentifiers: readonly (readonly [string, string])[] = [
  ["DEMO_MODE", "SYNTHETIC_DATA_ONLY plus a required DATABASE_URL"],
  ["demoMode", "no runtime flag; compose PostgreSQL"],
  ["INVALID_DEMO_MODE", "no runtime flag; configuration is explicit"],
  ["PersistenceMode", "PersistenceKind"],
  ["demoSeed", "syntheticSeed"],
  ["getDemoSeedCounts", "getSyntheticSeedCounts"],
  ["readDemoCounts", "readSeedCounts"],
  ["createDemoCurriculumContext", "createSyntheticCurriculumContext"],
  ["seededDemoMode", "no seeded runtime mode"],
];

// The checker and the rule table have to name the identifiers they forbid.
const exemptFiles = new Set([
  "AGENTS.md",
  join("scripts", "verify-demo-removal.ts"),
]);

// Dated records keep their original wording. Everything else must describe the
// current runtime.
const historicalFiles = new Set([
  join("docs", "hackathon", "meta-global-2026", "ic1-baseline-2026-10-27.md"),
]);

const isHistoricalRecord = (relativePath: string): boolean => {
  return (
    historicalFiles.has(relativePath) ||
    relativePath.startsWith(`docs${sep}archive${sep}`) ||
    (relativePath.startsWith(`docs${sep}hackathon${sep}`) &&
      relativePath.includes(`${sep}evidence${sep}`))
  );
};

const isTextFile = (filePath: string): boolean =>
  textExtensions.has(path.extname(filePath));

const listFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = join(directory, entry.name);
      return entry.isDirectory()
        ? listFiles(entryPath)
        : Promise.resolve([entryPath]);
    })
  );
  return nested.flat();
};

const rootFiles = await Promise.all(
  scanRoots.map((root) => listFiles(join(projectRoot, root)))
);
const files = [
  ...rootFiles.flat(),
  ...scanFiles.map((file) => join(projectRoot, file)),
];

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly identifier: string;
  readonly replacement: string;
}

const collectViolations = async (filePath: string): Promise<Violation[]> => {
  const relativePath = relative(projectRoot, filePath);
  if (
    !isTextFile(filePath) ||
    exemptFiles.has(relativePath) ||
    isHistoricalRecord(relativePath)
  ) {
    return [];
  }
  const contents = await readFile(filePath, "utf-8");
  const isClean = removedIdentifiers.every(
    ([identifier]) => !contents.includes(identifier)
  );
  if (isClean) {
    return [];
  }
  return contents.split("\n").flatMap((line, index) => {
    return removedIdentifiers
      .filter(([identifier]) => line.includes(identifier))
      .map(([identifier, replacement]) => {
        return {
          file: relativePath,
          line: index + 1,
          identifier,
          replacement,
        };
      });
  });
};

const results = await Promise.all(
  files.map((filePath) => collectViolations(filePath))
);
const violations = results.flat();

if (violations.length > 0) {
  const report = violations
    .toSorted(
      (left, right) =>
        left.file.localeCompare(right.file) || left.line - right.line
    )
    .map(
      (violation) =>
        `${violation.file}:${violation.line} uses ${violation.identifier}; use ${violation.replacement}`
    )
    .join("\n");
  throw new Error(
    `Demo-mode runtime identifiers are forbidden (issue #162):\n${report}`
  );
}

console.log(
  "PASS no demo-mode runtime identifiers outside dated historical records."
);
