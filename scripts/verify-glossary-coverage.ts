import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The glossary gate.
 *
 * The rule is "no term without a work object, no work object without a type".
 * Every table in `drizzle/schema.ts` and every stored-record schema under
 * `src/server/records/` must be claimed by exactly one glossary entry, through
 * an `Implementing names:` line. A listed name must exist, so a renamed type
 * cannot leave a stale glossary behind.
 *
 * It reads files only. It does not prove a definition's meaning is correct.
 */

const { join, relative } = path;
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const ignoredDirectories = new Set([
  ".git",
  ".output",
  "coverage",
  "node_modules",
]);

const glossaryFilename = "GLOSSARY.md";
const implementingLine = /\*\*Implementing names:\*\*/u;
const backticked = /`(?<name>[A-Za-z0-9_-]+)`/gu;
const termHeading = /^### (?<term>.+)$/u;
const tableDeclaration = /pgTable\(\s*"(?<table>[a-z0-9_]+)"/gu;
const recordSchema = /^export const (?<schema>\w+Schema) /gmu;
const recordSchemaFiles = [
  join(projectRoot, "src", "server", "records", "authoring.ts"),
  join(projectRoot, "src", "server", "records", "delivery.ts"),
];

const issues: string[] = [];

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return entry.name.startsWith(".") || ignoredDirectories.has(entry.name)
          ? []
          : walk(entryPath);
      }
      return entry.name === glossaryFilename ? [entryPath] : [];
    })
  );
  return nested.flat();
};

const schemaSource = await readFile(
  join(projectRoot, "drizzle", "schema.ts"),
  "utf-8"
);
const tables = schemaSource
  .matchAll(tableDeclaration)
  .map((match) => match.groups?.table)
  .filter((name): name is string => Boolean(name))
  .toArray();

const schemaSources = await Promise.all(
  recordSchemaFiles.map((file) => readFile(file, "utf-8"))
);
const recordSchemas = schemaSources
  .flatMap((contents) => contents.matchAll(recordSchema).toArray())
  .map((match) => match.groups?.schema)
  .filter(
    (name): name is string =>
      typeof name === "string" && !name.endsWith("InputSchema")
  );

const glossaryPaths = await walk(projectRoot);
const glossaryFiles = glossaryPaths.toSorted((left, right) =>
  left.localeCompare(right)
);

const glossarySources = await Promise.all(
  glossaryFiles.map(async (file) => {
    const contents = await readFile(file, "utf-8");
    return { contents, label: relative(projectRoot, file) };
  })
);

if (glossarySources.length === 0) {
  issues.push("no GLOSSARY.md found; the domain language has no home.");
}

const claimedBy = new Map<string, string>();
const declaredNames: { name: string; term: string; file: string }[] = [];

for (const { contents, label } of glossarySources) {
  let currentTerm: string | undefined;

  for (const line of contents.split("\n")) {
    const heading = termHeading.exec(line);
    if (heading?.groups?.term) {
      currentTerm = heading.groups.term.trim();
    }

    if (!implementingLine.test(line)) {
      continue;
    }

    const names = line
      .matchAll(backticked)
      .map((match) => match.groups?.name)
      .filter((name): name is string => Boolean(name))
      .toArray();

    if (!currentTerm) {
      issues.push(
        `${label} lists implementing names before any ### term heading.`
      );
    }

    const term = currentTerm ?? "?";
    for (const name of names) {
      declaredNames.push({ name, term, file: label });
      const owner = claimedBy.get(name);
      if (owner) {
        issues.push(
          `\`${name}\` is claimed by both "${owner}" and "${term}"; one work object, one term.`
        );
      } else {
        claimedBy.set(name, term);
      }
    }
  }
}

for (const table of tables) {
  if (!claimedBy.has(table)) {
    issues.push(`table \`${table}\` is not claimed by any glossary term.`);
  }
}

for (const schema of recordSchemas) {
  if (!claimedBy.has(schema)) {
    issues.push(
      `record schema \`${schema}\` is not claimed by any glossary term.`
    );
  }
}

const knownNames = new Set(tables);
for (const name of recordSchemas) {
  knownNames.add(name);
}
for (const { name, term, file } of declaredNames) {
  if (!knownNames.has(name)) {
    issues.push(`${file} maps "${term}" to \`${name}\`, which does not exist.`);
  }
}

if (issues.length > 0) {
  console.error("FAIL glossary coverage");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  console.error(
    `${glossarySources.length} glossary file(s), ${tables.length} tables, ${recordSchemas.length} record schemas, ${claimedBy.size} claimed names.`
  );
  process.exitCode = 1;
} else {
  console.log(
    `PASS glossary coverage: ${tables.length} tables and ${recordSchemas.length} record schemas map to ${glossarySources.length} glossary file(s).`
  );
}
