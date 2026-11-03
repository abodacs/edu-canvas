import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { clampCeiling, totalOf } from "./design-token-ratchet.ts";
import type { Counts } from "./design-token-ratchet.ts";

// Design-token gate for the UX revamp.
//
// The warm direction in b5472de never reached src/: it lived in
// .impeccable/mocks/screens/base.css, no check referenced it, and the port was a
// checklist step. This script makes the token layer load-bearing instead of
// documented.
//
// It is a RATCHET. The shipped stylesheet already violates every rule below, so
// an absolute gate would be red on the day it lands and disabled within a week.
// The committed baseline records today's counts; the script fails when any
// count grows. Counts may fall at any time; `--update` rewrites the baseline so
// a reduction becomes the new ceiling. Never raise a number by hand - that is
// the failure this file exists to prevent.
//
// Limits: token-based, not semantic. A component that reproduces a raw colour
// through a new custom property declared in the token block passes; the review
// rule in AGENTS.md covers that gap.

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const { join, relative } = path;

const BASELINE_PATH = join(
  projectRoot,
  "scripts",
  "design-token-baseline.json"
);
const STYLESHEET_ROOT = join(projectRoot, "src", "styles.css");
const STYLESHEET_DIR = join(projectRoot, "src", "styles");
const TSX_ROOTS = [
  join(projectRoot, "src", "components"),
  join(projectRoot, "src", "routes"),
];

const RULES = [
  "raw-color",
  "literal-radius",
  "literal-font-size",
  "literal-font-family",
  "literal-shadow",
  "teacher-alias",
  "undefined-token",
  "inline-style-literal",
] as const;

type RuleId = (typeof RULES)[number];
interface Baseline {
  readonly note: string;
  readonly rules: Record<RuleId, Counts>;
}
interface ScanState {
  readonly counts: Record<string, Counts>;
  readonly declared: Set<string>;
  readonly referenced: Map<string, string>;
  file: string;
}

const COLOUR_PATTERNS = [
  /#[0-9a-fA-F]{3,8}\b/u,
  /\brgba?\(\s*[\d.]/u,
  /\bhsla?\(\s*[\d.]/u,
  /\boklch\(\s*[\d.]/u,
];
const LENGTH_LITERAL = /(?:^|\s)[\d.]+(?:px|rem|em|vw|vh|ch|%)/u;
const COLOUR_PROPERTIES =
  /^(?:color|background|background-color|border|border-(?:top|right|bottom|left)|border-color|border-(?:top|right|bottom|left)-color|outline|outline-color|fill|stroke|text-decoration-color|accent-color)$/u;
const RADIUS_PROPERTIES =
  /^(?:border-radius|border-(?:start|end)-(?:start|end)-radius)$/u;
const DECLARATION_TOKEN = /var\((?<name>--[\w-]+)/gu;

const hasColourLiteral = (value: string): boolean =>
  COLOUR_PATTERNS.some((pattern) => pattern.test(value));

const stripComments = (source: string): string[] => {
  const lines: string[] = [];
  let isComment = false;
  for (const raw of source.split("\n")) {
    let text = "";
    let cursor = 0;
    while (cursor < raw.length) {
      if (isComment) {
        const end = raw.indexOf("*/", cursor);
        if (end === -1) {
          cursor = raw.length;
        } else {
          isComment = false;
          cursor = end + 2;
        }
      } else {
        const start = raw.indexOf("/*", cursor);
        if (start === -1) {
          text += raw.slice(cursor);
          cursor = raw.length;
        } else {
          text += raw.slice(cursor, start);
          isComment = true;
          cursor = start + 2;
        }
      }
    }
    lines.push(text.trim());
  }
  return lines;
};

const parseDeclaration = (
  text: string
): { property: string; value: string } | null => {
  const colon = text.indexOf(":");
  if (colon <= 0) {
    return null;
  }
  const property = text.slice(0, colon).trim();
  if (!/^[a-z-]+$/u.test(property)) {
    return null;
  }
  const trimmed = text.slice(colon + 1).trim();
  return {
    property,
    value: trimmed.endsWith(";") ? trimmed.slice(0, -1).trim() : trimmed,
  };
};

const classify = (property: string, value: string): RuleId | null => {
  const hasVariable = value.includes("var(");
  if (!hasVariable && property === "font-size" && LENGTH_LITERAL.test(value)) {
    return "literal-font-size";
  }
  if (!hasVariable && property === "font-family") {
    return "literal-font-family";
  }
  if (!hasVariable && property === "box-shadow" && value !== "none") {
    return "literal-shadow";
  }
  if (
    !hasVariable &&
    RADIUS_PROPERTIES.test(property) &&
    LENGTH_LITERAL.test(value)
  ) {
    return "literal-radius";
  }
  return COLOUR_PROPERTIES.test(property) && hasColourLiteral(value)
    ? "raw-color"
    : null;
};

const incrementFor = (
  counts: Record<string, Counts>,
  rule: RuleId,
  file: string
): void => {
  const perFile = counts[rule] ?? {};
  perFile[file] = (perFile[file] ?? 0) + 1;
  counts[rule] = perFile;
};

const scanLine = (text: string, state: ScanState): void => {
  const colon = text.indexOf(":");
  if (text.startsWith("--") && colon > 2) {
    state.declared.add(text.slice(0, colon).trim());
  } else {
    const declaration = parseDeclaration(text);
    const rule = declaration
      ? classify(declaration.property, declaration.value)
      : null;
    if (rule) {
      incrementFor(state.counts, rule, state.file);
    }
  }

  for (const match of text.matchAll(DECLARATION_TOKEN)) {
    const name = match.groups?.name;
    if (name && !state.referenced.has(name)) {
      state.referenced.set(name, state.file);
    }
  }

  if (text.includes("var(--teacher-")) {
    incrementFor(state.counts, "teacher-alias", state.file);
  }
};

const stylesheetFiles = async (): Promise<string[]> => {
  const entries = await readdir(STYLESHEET_DIR, { withFileTypes: true });
  const nested = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
    .map((entry) => join(STYLESHEET_DIR, entry.name))
    .toSorted();
  return [STYLESHEET_ROOT, ...nested];
};

// Every stylesheet shares one declaration set: a token declared in
// styles/tokens.css is defined for every surface file.
const scanStylesheets = async (): Promise<{
  counts: Record<string, Counts>;
  declaredCount: number;
  fileCount: number;
}> => {
  const files = await stylesheetFiles();
  const sources = await Promise.all(
    files.map((file) => readFile(file, "utf-8"))
  );
  const state: ScanState = {
    counts: {},
    declared: new Set<string>(),
    referenced: new Map<string, string>(),
    file: "",
  };

  for (const [index, file] of files.entries()) {
    state.file = relative(projectRoot, file);
    for (const text of stripComments(sources[index] ?? "")) {
      if (text.length > 0) {
        scanLine(text, state);
      }
    }
  }

  const missing: Counts = {};
  for (const [name, file] of state.referenced) {
    if (!state.declared.has(name)) {
      missing[`${file}  ${name}`] = 1;
    }
  }
  if (Object.keys(missing).length > 0) {
    state.counts["undefined-token"] = missing;
  }

  return {
    counts: state.counts,
    declaredCount: state.declared.size,
    fileCount: files.length,
  };
};

const collectTsx = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups: (string[] | Promise<string[]>)[] = [];
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      groups.push(collectTsx(full));
    } else if (entry.name.endsWith(".tsx")) {
      groups.push([full]);
    }
  }
  const nested = await Promise.all(groups);
  return nested.flat();
};

const INLINE_STYLE = /style=\{\{(?<body>[\s\S]{0,400}?)\}\}/gu;

const inlineLiteralCount = (source: string): number => {
  let count = 0;
  for (const match of source.matchAll(INLINE_STYLE)) {
    const body = match.groups?.body ?? "";
    if (hasColourLiteral(body) || /\b\d+(?:px|rem)\b/u.test(body)) {
      count += 1;
    }
  }
  return count;
};

const scanTsx = async (): Promise<Counts> => {
  const groups = await Promise.all(TSX_ROOTS.map((root) => collectTsx(root)));
  const files = groups.flat();
  const sources = await Promise.all(
    files.map((file) => readFile(file, "utf-8"))
  );
  const counts: Counts = {};

  for (const [index, file] of files.entries()) {
    const found = inlineLiteralCount(sources[index] ?? "");
    if (found > 0) {
      counts[relative(projectRoot, file)] = found;
    }
  }
  return counts;
};

const readBaseline = async (): Promise<Baseline | undefined> => {
  try {
    return JSON.parse(await readFile(BASELINE_PATH, "utf-8")) as Baseline;
  } catch {
    return undefined;
  }
};

const writeBaseline = async (counts: Record<string, Counts>): Promise<void> => {
  const previous = await readBaseline();
  const { rules, refused } = clampCeiling(RULES, previous?.rules, counts);
  const next: Baseline = {
    note: "Ratchet ceiling for scripts/verify-design-tokens.ts. Counts may only fall; regenerate with --update after a reduction.",
    rules: rules as Record<RuleId, Counts>,
  };
  await writeFile(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  console.log(`Updated ${relative(projectRoot, BASELINE_PATH)}`);
  for (const entry of refused) {
    console.error(`  kept old ceiling, count grew: ${entry}`);
  }
  if (refused.length > 0) {
    process.exitCode = 1;
  }
};

const report = (
  current: Record<string, Counts>,
  baseline: Baseline
): string[] => {
  const grown: string[] = [];
  console.log("Ratchet (current / ceiling):");
  for (const rule of RULES) {
    const now = totalOf(current[rule]);
    const ceiling = totalOf(baseline.rules[rule]);
    const isGrown = now > ceiling;
    if (isGrown) {
      grown.push(`${rule}: ${ceiling} -> ${now}`);
    }
    console.log(
      `  ${rule.padEnd(22)} ${String(now).padStart(5)} / ceiling ${String(ceiling).padStart(5)}${isGrown ? "  FAIL" : ""}`
    );
  }
  return grown;
};

const main = async (): Promise<string[] | null> => {
  const { counts, declaredCount, fileCount } = await scanStylesheets();
  const current = { ...counts };
  const inline = await scanTsx();
  if (Object.keys(inline).length > 0) {
    current["inline-style-literal"] = inline;
  }

  if (process.argv.includes("--update")) {
    await writeBaseline(current);
    return null;
  }

  console.log(
    `Design tokens: ${declaredCount} declarations across ${fileCount} stylesheets`
  );
  const baseline = JSON.parse(
    await readFile(BASELINE_PATH, "utf-8")
  ) as Baseline;
  return report(current, baseline);
};

const grown = await main();
if (grown === null) {
  // --update reported its own outcome and exit code.
} else if (grown.length === 0) {
  console.log("\nDesign-token ratchet holds.");
} else {
  const lines = grown.map((entry) => `  - ${entry}`);
  console.error(
    `\nDesign-token ratchet failed. These counts grew:\n${lines.join(
      "\n"
    )}\n\nUse a token (var(--...)) or a semantic class instead of a literal. ` +
      `If the change is genuinely unavoidable, that is a design decision: raise it in review, do not edit the baseline.`
  );
}
if (grown !== null) {
  process.exitCode = grown.length > 0 ? 1 : 0;
}
