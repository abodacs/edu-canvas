import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { syntheticSeed } from "@/server/seed-data";
import {
  A2UI_CATALOG_VERSION,
  a2uiCatalogVersionForId,
  a2uiCatalogVersions,
  a2uiCatalogs,
} from "@/shared/a2ui-contract";

// Gate for issue #110: the seeded fixture and the live preview have to pin one
// catalog identity. Before this check the seed stored
// `edu-canvas-matching-v0` while every reader accepted only `matching-v1`, so
// one object carried two names and the fixture proved nothing about the live
// path. Both sides are imported here: a string comparison would make the gate
// pass whenever both names drifted together.
//
// Limits: the source scan is token-based. It stops a seed module from
// restating a catalog identifier as a literal, but it cannot prove that a new
// fixture renders through the live reader; the round-trip test in
// `src/integration/seed-catalog-roundtrip.test.ts` covers that half against
// PostgreSQL.

const { join, relative } = path;
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const seedRoot = join(projectRoot, "src", "server");
const seedModulePattern = /^seed(?:-[\w-]+)?\.ts$/u;
const seedTestPattern = /\.test\.ts$/u;

// A seed module must import the catalog identifier rather than write it down.
const literalCatalogPattern = /catalogVersion\s*:\s*["'`]/u;

const listSeedModules = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return listSeedModules(entryPath);
      }
      return seedModulePattern.test(entry.name) &&
        !seedTestPattern.test(entry.name)
        ? [entryPath]
        : [];
    })
  );
  return nested.flat();
};

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly detail: string;
}

const violations: Violation[] = [];

const seedDataFile = join("src", "server", "seed-data.ts");
const seedCatalog: string = syntheticSeed.activityVersion.catalogVersion;

if (seedCatalog !== A2UI_CATALOG_VERSION) {
  violations.push({
    file: seedDataFile,
    line: 0,
    detail: `the seed pins ${seedCatalog} but the live contract pins ${A2UI_CATALOG_VERSION}`,
  });
}

const seedCatalogVersion = a2uiCatalogVersions.find(
  (version) => version === seedCatalog
);
if (seedCatalogVersion) {
  const { catalogId } = a2uiCatalogs[seedCatalogVersion];
  if (a2uiCatalogVersionForId(catalogId) !== seedCatalogVersion) {
    violations.push({
      file: seedDataFile,
      line: 0,
      detail: `the catalog id ${catalogId} does not resolve back to ${seedCatalogVersion}`,
    });
  }
} else {
  violations.push({
    file: seedDataFile,
    line: 0,
    detail: `no reader accepts the seeded catalog ${seedCatalog}`,
  });
}

const seedModules = await listSeedModules(seedRoot);
const seedSources = await Promise.all(
  seedModules.map(async (filePath) => {
    return {
      relativePath: relative(projectRoot, filePath),
      contents: await readFile(filePath, "utf-8"),
    };
  })
);
for (const { relativePath, contents } of seedSources) {
  for (const [index, line] of contents.split("\n").entries()) {
    if (literalCatalogPattern.test(line)) {
      violations.push({
        file: relativePath,
        line: index + 1,
        detail:
          "restates a catalog identifier as a literal; import A2UI_CATALOG_VERSION from @/shared/a2ui-contract",
      });
    }
  }
}

if (violations.length > 0) {
  const report = violations
    .toSorted(
      (left, right) =>
        left.file.localeCompare(right.file) || left.line - right.line
    )
    .map((violation) => {
      return violation.line > 0
        ? `${violation.file}:${violation.line} ${violation.detail}`
        : `${violation.file} ${violation.detail}`;
    })
    .join("\n");
  throw new Error(
    `The seeded catalog must match the live contract (issue #110):\n${report}`
  );
}

console.log(
  `PASS the synthetic seed and the live contract pin ${A2UI_CATALOG_VERSION}, and no seed module restates a catalog identifier (${seedModules.map((filePath) => relative(projectRoot, filePath)).join(", ")}).`
);
