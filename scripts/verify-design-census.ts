import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Design-census budget for the UX revamp.
//
// verify-design-tokens.ts catches literals in source. This catches the thing a
// source lint cannot see: how many distinct values actually reach the screen.
// The 2026-11-02 census found 44 font sizes, 64 line heights and 20 radii on 15 pages - a type system that exists nowhere except in the author's head.
//
// Input is the JSON produced by `pnpm census:capture`
// (scripts/design-census-capture.ts), kept at scripts/design-census.json so a
// fresh clone can run the check without a browser. Regenerate it after a UI
// change (needs a build, Chromium, and PostgreSQL):
//
//   pnpm build && pnpm census:capture --write
//
// Like the token check this is a RATCHET: the budget starts at today's numbers
// and may only fall. It also fails when the record set is too small, so a
// truncated capture cannot report a clean result.

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const { join, relative } = path;

const BUDGET_PATH = join(projectRoot, "scripts", "design-census-budget.json");
const DEFAULT_CENSUS = join(projectRoot, "scripts", "design-census.json");

interface TextBlock {
  readonly color: string;
  /** Fills from the text's own element outward to the first opaque one, `;`-joined. */
  readonly background: string;
  readonly size: string;
  readonly weight: string;
  readonly text: string;
}

interface Page {
  readonly page?: string;
  readonly error?: string;
  readonly radius?: Record<string, unknown>;
  readonly fontSize?: Record<string, unknown>;
  readonly fontWeight?: Record<string, unknown>;
  readonly lineHeight?: Record<string, unknown>;
  readonly boxShadow?: Record<string, unknown>;
  readonly background?: Record<string, unknown>;
  readonly borderColor?: Record<string, unknown>;
  readonly fontFamily?: Record<string, unknown>;
  readonly text?: readonly TextBlock[];
}

interface Budget {
  readonly note: string;
  readonly minPages: number;
  readonly maxAaFailures: number;
  readonly maxDistinct: Record<string, number>;
  /** A one-time, reviewed raise recorded when coverage grew; kept across updates. */
  readonly coverageRebaseline?: unknown;
}

const KEYS = [
  "fontSize",
  "lineHeight",
  "fontWeight",
  "fontFamily",
  "radius",
  "boxShadow",
  "background",
  "borderColor",
] as const;

const OKLCH = /oklch\((?<body>[^)]+)\)/iu;
const RGBA = /rgba?\((?<body>[^)]+)\)/u;
const SPLIT = /[,\s/]+/u;
const UNIT = /[a-z%]+/giu;

const toNumber = (value = "0"): number => Number(value.replaceAll(UNIT, ""));

const oklchToRgb = (
  lightness: number,
  chroma: number,
  hueDegrees: number
): number[] => {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((value) => {
    const channel =
      value <= 0.0031308
        ? 12.92 * value
        : 1.055 * Math.max(value, 0) ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(1, channel));
  });
};

const parseColour = (
  value: string
): { r: number; g: number; b: number; a: number } | null => {
  const okl = OKLCH.exec(value);
  if (okl) {
    const parts = (okl.groups?.body ?? "").split(SPLIT).filter(Boolean);
    const parsed = toNumber(parts[0]);
    const lightness = parsed > 1 ? parsed / 100 : parsed;
    const [r = 0, g = 0, b = 0] = oklchToRgb(
      lightness,
      toNumber(parts[1]),
      toNumber(parts[2])
    );
    return { r, g, b, a: parts[3] ? toNumber(parts[3]) : 1 };
  }
  const rgb = RGBA.exec(value);
  if (!rgb) {
    return null;
  }
  const parts = (rgb.groups?.body ?? "").split(SPLIT).filter(Boolean);
  return {
    r: toNumber(parts[0]) / 255,
    g: toNumber(parts[1]) / 255,
    b: toNumber(parts[2]) / 255,
    a: parts[3] ? toNumber(parts[3]) : 1,
  };
};

const linearise = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const luminance = (colour: { r: number; g: number; b: number }): number => {
  return (
    0.2126 * linearise(colour.r) +
    0.7152 * linearise(colour.g) +
    0.0722 * linearise(colour.b)
  );
};

const contrast = (
  foreground: { r: number; g: number; b: number },
  background: { r: number; g: number; b: number }
): number => {
  const values = [luminance(foreground), luminance(background)].toSorted(
    (a, b) => b - a
  );
  const high = values[0] ?? 0;
  const low = values[1] ?? 0;
  return (high + 0.05) / (low + 0.05);
};

const requiredContrast = (block: TextBlock): number => {
  const size = toNumber(block.size);
  const weight = toNumber(block.weight);
  const isLarge = size >= 24 || (size >= 18.66 && weight >= 700);
  return isLarge ? 3 : 4.5;
};

/**
The colour a reader sees behind the text: translucent fills are composited
over the fills beneath them, over white when none is opaque. A tint read as its
raw colour would compare the text with itself.
*/
const effectiveBackground = (
  block: TextBlock
): { r: number; g: number; b: number; a: number } | null => {
  const stack = block.background.split(";").filter((fill) => fill.length > 0);
  if (stack.length === 0) {
    return parseColour("rgba(0, 0, 0, 0)");
  }
  if (stack.length === 1) {
    return parseColour(stack[0] ?? "");
  }
  let composite = { r: 1, g: 1, b: 1 };
  for (const fill of stack.toReversed()) {
    const colour = parseColour(fill);
    if (!colour) {
      return null;
    }
    composite = {
      r: colour.a * colour.r + (1 - colour.a) * composite.r,
      g: colour.a * colour.g + (1 - colour.a) * composite.g,
      b: colour.a * colour.b + (1 - colour.a) * composite.b,
    };
  }
  return { ...composite, a: 1 };
};

const contrastFailure = (page: Page, block: TextBlock): string | null => {
  const foreground = parseColour(block.color);
  const background = effectiveBackground(block);
  if (!foreground || !background || foreground.a < 0.95) {
    return null;
  }
  const required = requiredContrast(block);
  const ratio = contrast(foreground, background);
  if (ratio >= required) {
    return null;
  }
  const label = `${page.page ?? "?"}: ${ratio.toFixed(2)}:1 (needs ${required})`;
  return `${label} "${block.text.slice(0, 40)}"`;
};

const collectFailures = (pages: readonly Page[]): string[] => {
  const failures: string[] = [];
  for (const page of pages) {
    if (!page.text) {
      continue;
    }
    for (const block of page.text) {
      const failure = contrastFailure(page, block);
      if (failure) {
        failures.push(failure);
      }
    }
  }
  return failures;
};

const distinctCounts = (pages: readonly Page[]): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const key of KEYS) {
    const union = new Set<string>();
    for (const page of pages) {
      const values = Object.keys(page[key] ?? {});
      for (const value of values) {
        union.add(value);
      }
    }
    result[key] = union.size;
  }
  return result;
};

const readJson = async <T>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
};

const writeBudget = async (result: {
  pages: number;
  distinct: Record<string, number>;
  failures: number;
}): Promise<void> => {
  const previous = await readJson<Budget>(BUDGET_PATH);
  const next: Budget = {
    note: "Ratchet ceiling for scripts/verify-design-census.ts. Counts may only fall; regenerate with --update after a reduction.",
    minPages: Math.max(result.pages, previous?.minPages ?? 0),
    maxAaFailures: Math.min(
      result.failures,
      previous?.maxAaFailures ?? Number.MAX_SAFE_INTEGER
    ),
    maxDistinct: Object.fromEntries(
      KEYS.map((key) => {
        const seen = result.distinct[key] ?? 0;
        const ceiling = previous?.maxDistinct[key] ?? Number.MAX_SAFE_INTEGER;
        return [key, Math.min(seen, ceiling)];
      })
    ),
    ...(previous?.coverageRebaseline === undefined
      ? {}
      : { coverageRebaseline: previous.coverageRebaseline }),
  };
  await writeFile(BUDGET_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  console.log(`Updated ${relative(projectRoot, BUDGET_PATH)}`);
};

const budgetProblems = (
  result: { pages: number; distinct: Record<string, number>; failures: number },
  budget: Budget
): string[] => {
  const problems: string[] = [];
  if (result.pages < budget.minPages) {
    problems.push(
      `only ${result.pages} pages in the census, expected at least ${budget.minPages}; a truncated capture must not pass`
    );
  }
  for (const key of KEYS) {
    const now = result.distinct[key] ?? 0;
    const ceiling = budget.maxDistinct[key] ?? 0;
    if (now > ceiling) {
      problems.push(`${key}: ${ceiling} -> ${now} distinct values`);
    }
  }
  if (result.failures > budget.maxAaFailures) {
    problems.push(`AA failures: ${budget.maxAaFailures} -> ${result.failures}`);
  }
  return problems;
};

const printTable = (
  result: { pages: number; distinct: Record<string, number>; failures: number },
  budget: Budget,
  source: string
): void => {
  console.log(`Design census: ${result.pages} pages from ${source}`);
  for (const key of KEYS) {
    const now = result.distinct[key] ?? 0;
    const ceiling = budget.maxDistinct[key] ?? 0;
    console.log(
      `  ${key.padEnd(14)} ${String(now).padStart(4)} / ceiling ${String(ceiling).padStart(4)}${now > ceiling ? "  FAIL" : ""}`
    );
  }
  console.log(
    `  ${"aaFailures".padEnd(14)} ${String(result.failures).padStart(4)} / ceiling ${String(budget.maxAaFailures).padStart(4)}`
  );
};

const main = async (): Promise<string[]> => {
  const argv = process.argv.slice(2);
  const censusPath =
    argv.find((argument) => !argument.startsWith("--")) ?? DEFAULT_CENSUS;
  const parsed = (await readJson<Page[]>(censusPath)) ?? [];
  const pages = parsed.filter((page) => !page.error);
  const result = {
    pages: pages.length,
    distinct: distinctCounts(pages),
    failures: collectFailures(pages).length,
  };

  if (argv.includes("--update")) {
    await writeBudget(result);
    return [];
  }

  const budget = await readJson<Budget>(BUDGET_PATH);
  if (!budget) {
    return [
      `no budget at ${relative(projectRoot, BUDGET_PATH)}; run with --update once`,
    ];
  }

  printTable(result, budget, relative(projectRoot, censusPath));
  const problems = budgetProblems(result, budget);
  if (problems.length === 0) {
    console.log("\nDesign census budget holds.");
    return [];
  }
  for (const failure of collectFailures(pages).slice(0, 12)) {
    problems.push(`  ${failure}`);
  }
  return problems;
};

const problems = await main();
if (problems.length > 0) {
  const lines = problems.map((problem) => `  - ${problem}`);
  console.error(`\nDesign census budget failed:\n${lines.join("\n")}`);
}
process.exitCode = problems.length > 0 ? 1 : 0;
