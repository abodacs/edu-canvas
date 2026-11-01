import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The map gate.
 *
 * `ARCHITECTURE.md` owns module ownership and decision identifiers. Prose can
 * drift silently, so this check derives the truth from the tree and rejects
 * three specific disagreements:
 *
 * 1. A context directory under `src/server/` with no ownership row.
 * 2. Two decision records sharing one `AgDR-NNNN` identifier.
 * 3. A cited decision record that does not exist.
 *
 * It reads files only. It does not prove that a row's description is accurate.
 */

const { join } = path;
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const serverRoot = join(projectRoot, "src", "server");
const agdrRoot = join(projectRoot, "docs", "agdr");
const architecturePath = join(projectRoot, "ARCHITECTURE.md");

const agdrFilename = /^(?<identifier>AgDR-\d{4})-[^/]+\.md$/u;
const contextPath = /src\/server\/(?<context>[a-z][a-z0-9-]*)\//gu;
const agdrCitation = /docs\/agdr\/(?<file>[^)\s]+\.md)/gu;

const issues: string[] = [];

const architecture = await readFile(architecturePath, "utf-8");

const serverEntries = await readdir(serverRoot, { withFileTypes: true });

const contextDirectories = serverEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .toSorted((left, right) => left.localeCompare(right));

const documentedContexts = new Set<string>();
for (const match of architecture.matchAll(contextPath)) {
  const context = match.groups?.context;
  if (context) {
    documentedContexts.add(context);
  }
}

for (const directory of contextDirectories) {
  if (!documentedContexts.has(directory)) {
    issues.push(
      `src/server/${directory}/ has no ownership row in ARCHITECTURE.md; every context must be mapped.`
    );
  }
}

const agdrEntries = await readdir(agdrRoot);
const decisionFiles = agdrEntries.filter((file) => file.endsWith(".md"));
const identifierOwner = new Map<string, string>();

for (const file of decisionFiles) {
  const identifier = agdrFilename.exec(file)?.groups?.identifier;
  if (identifier) {
    const owner = identifierOwner.get(identifier);
    if (owner) {
      issues.push(
        `${identifier} is claimed by both docs/agdr/${owner} and docs/agdr/${file}; decision identifiers must be unique.`
      );
    } else {
      identifierOwner.set(identifier, file);
    }
  } else {
    issues.push(`docs/agdr/${file} has no AgDR-NNNN identifier in its name.`);
  }
}

for (const match of architecture.matchAll(agdrCitation)) {
  const cited = match.groups?.file;
  if (cited && !decisionFiles.includes(cited)) {
    issues.push(
      `ARCHITECTURE.md cites docs/agdr/${cited}, which does not exist.`
    );
  }
}

if (issues.length > 0) {
  console.error("FAIL architecture map");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  console.error(
    `Contexts found: ${contextDirectories.join(", ")}. Documented: ${[...documentedContexts].toSorted((left, right) => left.localeCompare(right)).join(", ")}.`
  );
  process.exitCode = 1;
} else {
  console.log(
    `PASS architecture map: ${contextDirectories.length} contexts mapped, ${decisionFiles.length} decision identifiers unique, every citation resolves.`
  );
}
