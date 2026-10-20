import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readDemoSnapshot } from "@/server/demo/read-model";
import { demoSnapshotSchema } from "@/shared/demo-contract.schema";

const { dirname, extname, join, relative, resolve, sep } = path;
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = join(projectRoot, "src");
const sourceExtensions = new Set([".ts", ".tsx"]);
const importPattern =
  /(?:from\s+|import\s*\(\s*)['"](?<specifier>[^'"]+)['"]/gu;
const globalStateModules = new Set([
  "jotai",
  "mobx",
  "redux",
  "valtio",
  "zustand",
  "@reduxjs/toolkit",
]);
const globalStateCalls = /\b(?:createStore|configureStore|createSlice)\s*\(/u;
const globalStateFile =
  /(?:^|\/)(?:store|global-state|app-state)\.(?:ts|tsx)$/u;

type SourceScope =
  "components" | "lib" | "routes" | "server" | "shared" | "other";

const listSourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return listSourceFiles(entryPath);
      }

      return sourceExtensions.has(extname(entry.name)) ? [entryPath] : [];
    })
  );

  return nested.flat();
};

const sourceScope = (filePath: string): SourceScope => {
  const pathFromSource = relative(sourceRoot, filePath);
  const [topLevel] = pathFromSource.split(sep);

  return ["components", "lib", "routes", "server", "shared"].includes(topLevel)
    ? (topLevel as SourceScope)
    : "other";
};

const resolveSourceImport = (
  importer: string,
  specifier: string
): string | undefined => {
  let candidate: string;
  if (specifier.startsWith("@/") || specifier.startsWith("#/")) {
    candidate = join(sourceRoot, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    candidate = resolve(dirname(importer), specifier);
  } else {
    return undefined;
  }

  const candidates = [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    `${candidate}.js`,
    `${candidate}.jsx`,
    join(candidate, "index.ts"),
    join(candidate, "index.tsx"),
  ];

  return candidates.find((candidatePath) => existsSync(candidatePath));
};

interface ImportContext {
  readonly importer: string;
  readonly specifier: string;
  readonly importedFile: string | undefined;
  readonly importerScope: SourceScope;
  readonly importedScope: SourceScope | undefined;
}

const describeImport = ({
  importer,
  specifier,
  importedFile,
}: ImportContext) => {
  return `${relative(projectRoot, importer)} imports ${relative(
    projectRoot,
    importedFile ?? specifier
  )}`;
};

const isBrowserUnsafeSpecifier = (specifier: string): boolean => {
  return (
    specifier === "postgres" ||
    specifier.startsWith("node:") ||
    specifier.startsWith("postgres/")
  );
};

const runtimeScopes: ReadonlySet<SourceScope> = new Set([
  "server",
  "routes",
  "components",
]);
const deliveryScopes: ReadonlySet<SourceScope> = new Set([
  "server",
  "routes",
  "other",
]);

interface ImportRule {
  readonly applies: (context: ImportContext) => boolean;
  readonly message: (context: ImportContext) => string;
}

const importRules: readonly ImportRule[] = [
  {
    applies: ({ importerScope, importedScope }) => {
      return (
        importerScope === "shared" &&
        importedScope !== undefined &&
        runtimeScopes.has(importedScope)
      );
    },
    message: (context) =>
      `${describeImport(context)}; shared modules cannot depend on runtime modules.`,
  },
  {
    applies: ({ importerScope, specifier }) =>
      importerScope === "shared" && isBrowserUnsafeSpecifier(specifier),
    message: ({ importer, specifier }) =>
      `${relative(projectRoot, importer)} imports ${specifier}; shared modules must remain browser-safe.`,
  },
  {
    applies: ({ importerScope, importedScope }) => {
      return (
        importerScope === "components" &&
        importedScope !== undefined &&
        deliveryScopes.has(importedScope)
      );
    },
    message: (context) =>
      `${describeImport(context)}; UI modules cannot own runtime or delivery behavior.`,
  },
  {
    applies: ({ importerScope, importedScope }) => {
      return (
        importerScope === "server" &&
        (importedScope === "routes" || importedScope === "components")
      );
    },
    message: (context) =>
      `${describeImport(context)}; server modules cannot depend on delivery or UI modules.`,
  },
  {
    applies: ({ importerScope, importedScope, specifier }) => {
      return (
        importerScope === "routes" &&
        importedScope === "server" &&
        !specifier.endsWith(".server") &&
        !specifier.endsWith("/server-function")
      );
    },
    message: ({ importer, specifier }) =>
      `${relative(projectRoot, importer)} imports ${specifier}; routes may cross only named delivery seams.`,
  },
  {
    applies: ({ specifier }) => globalStateModules.has(specifier),
    message: ({ importer, specifier }) =>
      `${relative(projectRoot, importer)} imports ${specifier}; global mutable state needs an explicit owner and decision record.`,
  },
];

const checkImportRules = (
  importer: string,
  specifier: string,
  importedFile: string | undefined,
  issues: string[]
): void => {
  const context: ImportContext = {
    importer,
    specifier,
    importedFile,
    importerScope: sourceScope(importer),
    importedScope: importedFile ? sourceScope(importedFile) : undefined,
  };

  for (const rule of importRules) {
    if (rule.applies(context)) {
      issues.push(rule.message(context));
    }
  }
};

const auditSourceFile = async (file: string): Promise<string[]> => {
  const issues: string[] = [];
  const contents = await readFile(file, "utf-8");
  const pathFromSource = relative(sourceRoot, file);

  if (globalStateFile.test(pathFromSource)) {
    issues.push(
      `${
        pathFromSource
      } looks like an unowned global-state module; keep state local or document its owner.`
    );
  }

  if (globalStateCalls.test(contents)) {
    issues.push(
      `${
        pathFromSource
      } creates a global store; state ownership must be explicit before adding one.`
    );
  }

  for (const match of contents.matchAll(importPattern)) {
    const specifier = match.groups?.specifier;
    if (!specifier) {
      continue;
    }

    checkImportRules(
      file,
      specifier,
      resolveSourceImport(file, specifier),
      issues
    );
  }

  return issues;
};

const checkSourceStructure = async (files: string[]): Promise<string[]> => {
  const issueGroups = await Promise.all(files.map(auditSourceFile));
  return issueGroups.flat();
};

const checkPublicContract = async (): Promise<string[]> => {
  const snapshot = await readDemoSnapshot("student", {});
  const result = demoSnapshotSchema.safeParse(snapshot);
  const issues: string[] = [];

  if (!result.success) {
    issues.push(
      `the seeded demo snapshot does not satisfy the shared runtime contract: ${
        result.error.message
      }`
    );
  }

  if (JSON.stringify(snapshot).includes("answerKey")) {
    issues.push("the public demo snapshot contains the private answer key.");
  }

  return issues;
};

const files = await listSourceFiles(sourceRoot);
const issues = [
  ...(await checkSourceStructure(files)),
  ...(await checkPublicContract()),
];

if (issues.length > 0) {
  console.error("FAIL architecture harness");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    "PASS architecture harness: layer imports, state ownership, and public contract are intact."
  );
}
