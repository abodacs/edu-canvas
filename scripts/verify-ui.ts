/**
Per-route UI gate (`pnpm verify:ui [route ...]`).

One command every UI change runs before review. For each named view
(scripts/ui-gate/views.ts) it opens the built app at a desktop (1440) and a
phone (390) viewport, signed in as the view's audience, reaches the view's
state through real clicks, waits for its `ready` selector, and reports:

- axe-core serious and critical findings (colour contrast included),
- sideways scrolling,
- the distinct font sizes and radii that reached the screen,
- a screenshot, and with `--compare <dir>` the share of pixels that changed
  against an earlier run (use it to prove a refactor is zero-diff).

It is a ratchet like the token and census checks: the committed budget
(scripts/ui-gate-budget.json) records findings per view key and viewport, and
the run fails when any count grows. `--update` lowers the budget, never raises
it. A view that does not reach its state is a fatal `state` finding: it is
never skipped, measured, or ratcheted.

Selection: `--view <key>` (repeatable) runs one view; a bare path such as
`/workspace` runs every view under it; no selector runs every view.

Skip-safe like the student probe: no Chromium or no PostgreSQL prints one SKIP
line and exits 0. UI_GATE_REQUIRED=true turns a skip into a failure.
*/
/* eslint-disable no-await-in-loop -- views share one signed-in browser and run one at a time so screenshots stay deterministic. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright-core";

import { axeProblems, overflowProblems } from "./student-probe/checks";
import { loadEnvironmentFile, withScratchApp } from "./ui-gate/app";
import { gateSeedScripts, readSeedOutputs } from "./ui-gate/seed-output";
import { signedInState } from "./ui-gate/session";
import {
  allViews,
  assertUniqueKeys,
  findingKey,
  reachState,
  screenshotName,
  selectViews,
  viewUrl,
} from "./ui-gate/views";

import type { SeedOutputs } from "./ui-gate/seed-output";
import type { Audience, StorageState } from "./ui-gate/session";
import type { ViewSpec } from "./ui-gate/views";

import type { Browser, BrowserContext, Page } from "playwright-core";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;

const gateName = "verify:ui";
const budgetPath = path.join("scripts", "ui-gate-budget.json");
// After the state is reached, let fonts and the last paint settle before the
// screenshot. Not networkidle: signed-in pages keep a session poll open.
const settleMs = 1500;
interface Finding {
  readonly key: string;
  readonly view: string;
  readonly viewport: string;
  readonly axe: readonly string[];
  readonly overflow: readonly string[];
  readonly fontSizes: number;
  readonly radii: number;
  readonly screenshot: string;
  readonly changed?: string;
  /** The view never reached its state: always fatal, never ratcheted. */
  readonly state?: string;
}

interface Budget {
  readonly note: string;
  readonly routes: Record<string, { axe: number; overflow: number }>;
}

const isRequired = process.env.UI_GATE_REQUIRED === "true";

const skip = (reason: string): never => {
  const line = `SKIP ${gateName}: ${reason}`;
  if (isRequired) {
    console.error(`${line} (UI_GATE_REQUIRED=true, failing)`);
    process.exit(1);
  }
  console.log(line);
  process.exit(0);
};

const parseArguments = (
  args: readonly string[]
): {
  views: ViewSpec[];
  compare?: string;
  update: boolean;
  out: string;
} => {
  const valueOf = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };
  const keys = args.flatMap((arg, index) =>
    arg === "--view" && args[index + 1] ? [args[index + 1] ?? ""] : []
  );
  const flagValues = new Set(
    ["--compare", "--out"].map((flag) => valueOf(flag))
  );
  const paths = args.filter(
    (arg) => arg.startsWith("/") && !flagValues.has(arg)
  );
  const selected = selectViews(allViews, { keys, paths });
  if (selected.unknown.length > 0) {
    throw new Error(
      `unknown view or route ${selected.unknown.join(", ")}. Known views: ${allViews.map((view) => view.key).join(" ")}`
    );
  }
  const stamp = new Date().toISOString().replaceAll(/[:.]/gu, "-");
  return {
    views: selected.views,
    compare: valueOf("--compare"),
    update: args.includes("--update"),
    out: valueOf("--out") ?? path.join(".scratch", "ui-gate", stamp),
  };
};

const distinctValues = (
  page: Page
): Promise<{ fontSizes: number; radii: number }> =>
  page.evaluate(() => {
    const sizes = new Set<string>();
    const radii = new Set<string>();
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) {
        continue;
      }
      const style = getComputedStyle(element);
      if (style.visibility === "hidden") {
        continue;
      }
      const hasText = [...element.childNodes].some(
        (node) =>
          node.nodeType === Node.TEXT_NODE &&
          (node.textContent ?? "").trim().length > 0
      );
      if (hasText) {
        sizes.add(style.fontSize);
      }
      if (style.borderRadius !== "0px") {
        radii.add(style.borderRadius);
      }
    }
    return { fontSizes: sizes.size, radii: radii.size };
  });

/**
Share of pixels that differ between two PNGs, measured in a blank page's canvas
(no app CSP) so the gate needs no image dependency.
*/
const toDataUrl = (file: string): string =>
  `data:image/png;base64,${readFileSync(file).toString("base64")}`;

// Runs in the browser; self-contained because Playwright serializes it.
const pixelShareInPage = async ([left, right]: readonly [
  string,
  string,
]): Promise<number> => {
  const images: ImageBitmap[] = [];
  for (const source of [left, right]) {
    const response = await fetch(source);
    const blob = await response.blob();
    images.push(await createImageBitmap(blob));
  }
  const [a, b] = images;
  if (!a || !b || a.width !== b.width || a.height !== b.height) {
    return -1;
  }
  const data: Uint8ClampedArray[] = [];
  for (const image of [a, b]) {
    const canvas = new OffscreenCanvas(image.width, image.height);
    const drawing = canvas.getContext("2d");
    if (!drawing) {
      throw new Error("no 2d context");
    }
    drawing.drawImage(image, 0, 0);
    data.push(drawing.getImageData(0, 0, image.width, image.height).data);
  }
  const [pa, pb] = data;
  if (!pa || !pb) {
    return -1;
  }
  let changed = 0;
  for (let index = 0; index < pa.length; index += 4) {
    if (
      pa[index] !== pb[index] ||
      pa[index + 1] !== pb[index + 1] ||
      pa[index + 2] !== pb[index + 2]
    ) {
      changed += 1;
    }
  }
  return changed / (pa.length / 4);
};

const changedShare = async (
  context: BrowserContext,
  before: string,
  after: string
): Promise<string> => {
  const page = await context.newPage();
  const share = await page.evaluate(pixelShareInPage, [
    toDataUrl(before),
    toDataUrl(after),
  ] as const);
  await page.close();
  return share < 0 ? "size changed" : `${(share * 100).toFixed(3)}%`;
};

const inspectView = async (
  browser: Browser,
  view: ViewSpec,
  viewport: (typeof VIEWPORTS)[number],
  options: {
    readonly baseUrl: string;
    readonly seed: SeedOutputs;
    readonly out: string;
    readonly compare?: string;
    readonly storageState?: StorageState;
  }
): Promise<Finding> => {
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
    storageState: options.storageState,
  });
  const file = screenshotName(view, viewport.name);
  const screenshot = path.join(options.out, file);
  const base = {
    key: findingKey(view, viewport.name),
    view: view.key,
    viewport: viewport.name,
    screenshot,
  };
  try {
    const page = await context.newPage();
    await page.goto(
      viewUrl(options.baseUrl, view, {
        seed: options.seed,
        viewport: viewport.name,
      }),
      { waitUntil: "load" }
    );
    try {
      await reachState(page, view);
    } catch (error) {
      // Keep the evidence of the wrong screen, but never measure it.
      await page.screenshot({ path: screenshot, fullPage: true });
      return {
        ...base,
        axe: [],
        overflow: [],
        fontSizes: 0,
        radii: 0,
        state: error instanceof Error ? error.message : String(error),
      };
    }
    await page.waitForTimeout(settleMs);
    await page.screenshot({ path: screenshot, fullPage: true });
    const previous = options.compare
      ? path.join(options.compare, file)
      : undefined;
    return {
      ...base,
      axe: await axeProblems(page),
      overflow: await overflowProblems(page),
      ...(await distinctValues(page)),
      changed:
        previous && existsSync(previous)
          ? await changedShare(context, previous, screenshot)
          : undefined,
    };
  } finally {
    await context.close();
  }
};

const inspect = async (
  browser: Browser,
  options: {
    readonly baseUrl: string;
    readonly seed: SeedOutputs;
    readonly views: readonly ViewSpec[];
    readonly out: string;
    readonly compare?: string;
  }
): Promise<Finding[]> => {
  mkdirSync(options.out, { recursive: true });
  const findings: Finding[] = [];
  const states = new Map<Audience, StorageState>();
  for (const audience of ["teacher", "student"] as const) {
    if (options.views.some((view) => view.audience === audience)) {
      states.set(
        audience,
        await signedInState(browser, options.baseUrl, audience)
      );
    }
  }

  for (const view of options.views) {
    for (const viewport of VIEWPORTS) {
      findings.push(
        await inspectView(browser, view, viewport, {
          ...options,
          storageState: states.get(view.audience),
        })
      );
    }
  }
  return findings;
};

const readBudget = (): Budget | undefined =>
  existsSync(budgetPath)
    ? (JSON.parse(readFileSync(budgetPath, "utf-8")) as Budget)
    : undefined;

const writeBudget = (findings: readonly Finding[]): void => {
  const previous = readBudget()?.routes ?? {};
  const routes = { ...previous };
  for (const finding of findings) {
    if (finding.state !== undefined) {
      continue;
    }
    const before = previous[finding.key];
    routes[finding.key] = {
      axe: Math.min(finding.axe.length, before?.axe ?? Number.MAX_SAFE_INTEGER),
      overflow: Math.min(
        finding.overflow.length,
        before?.overflow ?? Number.MAX_SAFE_INTEGER
      ),
    };
  }
  const next: Budget = {
    note: "Ratchet ceiling for scripts/verify-ui.ts: blocking findings per view key and viewport. Counts may only fall; regenerate with --update after a reduction.",
    routes: Object.fromEntries(
      Object.entries(routes).toSorted(([a], [b]) => a.localeCompare(b))
    ),
  };
  writeFileSync(budgetPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Updated ${budgetPath}`);
};

const report = (findings: readonly Finding[], out: string): number => {
  const budget = readBudget()?.routes ?? {};
  let failed = 0;
  console.log(
    `${"view".padEnd(28)} ${"axe".padStart(4)} ${"x-scroll".padStart(8)} ${"sizes".padStart(5)} ${"radii".padStart(5)}  changed`
  );
  for (const finding of findings) {
    if (finding.state !== undefined) {
      failed += 1;
      console.log(`${finding.key.padEnd(28)} FAIL (state)`);
      console.log(`    ${finding.state}`);
      continue;
    }
    const ceiling = budget[finding.key] ?? { axe: 0, overflow: 0 };
    const grew =
      finding.axe.length > ceiling.axe ||
      finding.overflow.length > ceiling.overflow;
    if (grew) {
      failed += 1;
    }
    console.log(
      `${finding.key.padEnd(28)} ${String(finding.axe.length).padStart(4)} ${String(finding.overflow.length).padStart(8)} ${String(finding.fontSizes).padStart(5)} ${String(finding.radii).padStart(5)}  ${finding.changed ?? "-"}${grew ? "  FAIL (over budget)" : ""}`
    );
    for (const problem of [...finding.axe, ...finding.overflow]) {
      console.log(`    ${problem}`);
    }
  }
  const mocks = allViews
    .filter(
      (view) =>
        view.mock && findings.some((finding) => finding.view === view.key)
    )
    .map(
      (view) =>
        `  ${view.key.padEnd(19)} .impeccable/mocks/screens/${view.mock ?? ""}.html`
    );
  console.log(
    `\nScreenshots: ${out}\nCompare against the approved mocks:\n${mocks.join("\n")}`
  );
  console.log(
    failed === 0
      ? `\n${gateName}: ${findings.length} views within budget.`
      : `\n${gateName}: ${failed} of ${findings.length} views failed.`
  );
  return failed === 0 ? 0 : 1;
};

const main = async (): Promise<number> => {
  loadEnvironmentFile();
  assertUniqueKeys(allViews);
  let options: ReturnType<typeof parseArguments>;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(
      `${gateName}: ${error instanceof Error ? error.message : String(error)}`
    );
    return 1;
  }
  const chromiumPath =
    process.env.UI_GATE_CHROMIUM ?? chromium.executablePath();
  if (!existsSync(chromiumPath)) {
    skip(
      `no Chromium at ${chromiumPath} (install with \`pnpm exec playwright-core install chromium\` or set UI_GATE_CHROMIUM)`
    );
  }

  const outcome = await withScratchApp(
    {
      prefix: "edu_canvas_ui_gate",
      seedScripts: gateSeedScripts,
    },
    async ({ baseUrl, seedOutputs }) => {
      const seed = readSeedOutputs(seedOutputs);
      const browser = await chromium.launch({ executablePath: chromiumPath });
      try {
        const findings = await inspect(browser, {
          baseUrl,
          seed,
          views: options.views,
          out: options.out,
          compare: options.compare,
        });
        if (options.update) {
          writeBudget(findings);
        }
        return report(findings, options.out);
      } finally {
        await browser.close();
      }
    }
  );
  if (outcome.kind === "missing-build") {
    console.error(
      `${gateName}: .output/server/index.mjs is missing; run pnpm build first.`
    );
    return 1;
  }
  if (outcome.kind === "skipped") {
    return skip(outcome.reason);
  }
  return outcome.value;
};

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`${gateName} failed:`, error);
  process.exitCode = 1;
}
