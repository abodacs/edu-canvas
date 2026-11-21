import { readFileSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Counts } from "./comment-ratchet";
import ts from "typescript";
import { clampCeiling, isDirectiveComment } from "./comment-ratchet";

// AgDR-0019: src/ carries no comments. Durable knowledge lives in AgDRs, the
// glossary, names, and tests; machine directives stay until their suppression
// is fixed at the source and are reported separately.
//
// Counts are comment lines per file, extracted from the TypeScript AST so a
// "//" inside a string or template literal never counts. The budget is a
// ratchet: `--update` may lower a ceiling, never raise it, and a file absent
// from the budget tolerates zero comments.

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const scanRoot = path.join(projectRoot, "src");
const budgetPath = path.join(projectRoot, "scripts", "comment-budget.json");
const generatedFiles = new Set([path.join("src", "routeTree.gen.ts")]);

const listFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? await listFiles(entryPath)
        : await Promise.resolve([entryPath]);
    })
  );
  return nested.flat();
};

interface CommentRecord {
  readonly file: string;
  readonly line: number;
  readonly endLine: number;
  readonly pos: number;
  readonly end: number;
  readonly directive: boolean;
  readonly text: string;
}

const collectComments = (
  filePath: string,
  relativePath: string
): CommentRecord[] => {
  const sourceText = readFileSync(filePath, "utf-8");
  // setParentNodes attaches parent links so comment ranges resolve per token.
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
  const found = new Map<number, ts.CommentRange>();
  const visit = (node: ts.Node): void => {
    for (const range of ts.getLeadingCommentRanges(
      sourceText,
      node.getFullStart()
    ) ?? []) {
      found.set(range.pos, range);
    }
    for (const range of ts.getTrailingCommentRanges(
      sourceText,
      node.getEnd()
    ) ?? []) {
      found.set(range.pos, range);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...found.values()]
    .toSorted((left, right) => left.pos - right.pos)
    .map((range) => {
      const slice = sourceText.slice(range.pos, range.end);
      const line = sourceText.slice(0, range.pos).split("\n").length;
      const endLine = line + slice.split("\n").length - 1;
      return {
        file: relativePath,
        line,
        endLine,
        pos: range.pos,
        end: range.end,
        directive: isDirectiveComment(slice),
        text: slice,
      };
    });
};

const parseBudgetFiles = (
  contents: string
): { note: string; files: Counts } => {
  try {
    const parsed: unknown = JSON.parse(contents);
    if (typeof parsed !== "object" || parsed === null) {
      return { note: "", files: {} };
    }
    const record = parsed as { note?: unknown; files?: unknown };
    const note = typeof record.note === "string" ? record.note : "";
    const files: Counts = {};
    if (typeof record.files === "object" && record.files !== null) {
      for (const [file, count] of Object.entries(record.files)) {
        if (typeof count === "number") {
          files[file] = count;
        }
      }
    }
    return { note, files };
  } catch {
    return { note: "", files: {} };
  }
};

const main = async (): Promise<void> => {
  const update = process.argv.includes("--update");
  const jsonIndex = process.argv.indexOf("--json");
  const jsonPath =
    jsonIndex === -1 ? undefined : (process.argv[jsonIndex + 1] ?? undefined);

  const scanned = await listFiles(scanRoot);
  const files = scanned
    .filter((file) => /\.tsx?$/u.test(file))
    .filter((file) => !generatedFiles.has(path.relative(projectRoot, file)))
    .toSorted();

  const records: CommentRecord[] = [];
  const counts: Counts = {};
  for (const file of files) {
    const relativePath = path.relative(projectRoot, file);
    const commentRecords = collectComments(file, relativePath);
    records.push(...commentRecords);
    // Only prose comments count against the ratchet; machine directives stay
    // exempt (AgDR-0019 §2) and are reported in the summary line instead.
    const lines = commentRecords
      .filter((record) => !record.directive)
      .reduce((sum, record) => sum + (record.endLine - record.line + 1), 0);
    if (lines > 0) {
      counts[relativePath] = lines;
    }
  }

  const prose = records.filter((record) => !record.directive);
  const directives = records.filter((record) => record.directive);

  if (jsonPath !== undefined) {
    await writeFile(jsonPath, `${JSON.stringify(records, null, 2)}\n`);
    console.log(
      `Wrote ${records.length} comments (${directives.length} directives) to ${jsonPath}`
    );
    return;
  }

  const budgetContents = await readFile(budgetPath, "utf-8").catch(() => "{}");
  const { note, files: previous } = parseBudgetFiles(budgetContents);

  if (update) {
    const { files: clamped, refused } = clampCeiling(previous, counts);
    if (refused.length > 0) {
      console.error(
        `Comment counts grew; --update may only lower ceilings:\n${refused.join("\n")}`
      );
      process.exitCode = 1;
      return;
    }
    await writeFile(
      budgetPath,
      `${JSON.stringify(
        {
          note,
          files: clamped,
        },
        null,
        2
      )}\n`
    );
    console.log(
      `Budget updated: ${Object.keys(clamped).length} file(s), ${Object.values(
        clamped
      ).reduce((sum, value) => sum + value, 0)} comment lines.`
    );
    return;
  }

  const problems = Object.entries(counts)
    .filter(([file, count]) => count > (previous[file] ?? 0))
    .map(
      ([file, count]) =>
        `${file}: ${count} comment lines > ${previous[file] ?? 0}`
    );
  if (problems.length > 0) {
    console.error(
      `Comment budget exceeded (AgDR-0019):\n${problems.join("\n")}`
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `PASS src/ holds ${prose.length} comment lines and ${directives.length} machine directives, inside budget.`
  );
};

await main();
