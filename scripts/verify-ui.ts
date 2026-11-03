/**
Per-route UI gate (`pnpm verify:ui [route ...]`).

One command every UI change runs before review. For each route it opens the
built app at a desktop (1440) and a phone (390) viewport, signed in as the
route's audience, and reports:

- axe-core serious and critical findings (colour contrast included),
- sideways scrolling,
- the distinct font sizes and radii that reached the screen,
- a screenshot, and with `--compare <dir>` the share of pixels that changed
  against an earlier run (use it to prove a refactor is zero-diff).

It is a ratchet like the token and census checks: the committed budget
(scripts/ui-gate-budget.json) records findings per route and viewport, and
the run fails when any count grows. `--update` lowers the budget, never raises
it. Routes default to every page the redesign touches.

Skip-safe like the student probe: no Chromium or no PostgreSQL prints one SKIP
line and exits 0. UI_GATE_REQUIRED=true turns a skip into a failure.
*/
/* eslint-disable no-await-in-loop -- routes share one signed-in browser and run one at a time so screenshots stay deterministic. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright-core";

import { axeProblems, overflowProblems } from "./student-probe/checks";
import { loadEnvironmentFile, withScratchApp } from "./ui-gate/app";

import type { Browser, BrowserContext, Page } from "playwright-core";

type Audience = "public" | "teacher" | "student";

interface RouteSpec {
  readonly path: string;
  readonly audience: Audience;
  /** The approved mock this route is redesigned against. */
  readonly mock?: string;
}

const ROUTES: readonly RouteSpec[] = [
  { path: "/", audience: "public", mock: "0-landing" },
  { path: "/login", audience: "public", mock: "5-sign-in" },
  { path: "/sign-up", audience: "public", mock: "5-sign-in" },
  { path: "/workspace", audience: "teacher", mock: "1-studio" },
  { path: "/dashboard", audience: "teacher", mock: "4-dashboard" },
  { path: "/learn", audience: "student", mock: "7-learn" },
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;

const gateName = "verify:ui";
const budgetPath = path.join("scripts", "ui-gate-budget.json");
// Load, then let hydration and the first data fetch settle. Not networkidle:
// signed-in pages keep a session poll open.
const settleMs = 1500;
const accounts: Record<Exclude<Audience, "public">, string> = {
  teacher: "amira.north@example.test",
  student: "omar.demo@example.test",
};
const syntheticPassword = "synthetic-pass-1";

interface Finding {
  readonly key: string;
  readonly route: string;
  readonly viewport: string;
  readonly axe: readonly string[];
  readonly overflow: readonly string[];
  readonly fontSizes: number;
  readonly radii: number;
  readonly screenshot: string;
  readonly changed?: string;
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

const parseArguments = (): {
  routes: RouteSpec[];
  compare?: string;
  update: boolean;
  out: string;
} => {
  const args = process.argv.slice(2);
  const valueOf = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };
  const flagValues = new Set(
    ["--compare", "--out"].map((flag) => valueOf(flag))
  );
  const asked = args.filter(
    (arg) => arg.startsWith("/") && !flagValues.has(arg)
  );
  const unknown = asked.filter(
    (arg) => !ROUTES.some((route) => route.path === arg)
  );
  if (unknown.length > 0) {
    console.error(
      `${gateName}: unknown route ${unknown.join(", ")}. Known: ${ROUTES.map((route) => route.path).join(" ")}`
    );
    process.exit(1);
  }
  const stamp = new Date().toISOString().replaceAll(/[:.]/gu, "-");
  return {
    routes:
      asked.length === 0
        ? [...ROUTES]
        : ROUTES.filter((route) => asked.includes(route.path)),
    compare: valueOf("--compare"),
    update: args.includes("--update"),
    out: valueOf("--out") ?? path.join(".scratch", "ui-gate", stamp),
  };
};

const slug = (route: string): string =>
  route === "/" ? "home" : route.replaceAll("/", "-").replace(/^-/u, "");

const signIn = async (
  context: BrowserContext,
  baseUrl: string,
  email: string
): Promise<void> => {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(syntheticPassword);
  await page.locator("button[type='submit']").click();
  await page.waitForURL((url) => url.pathname !== "/login");
  if (page.url().includes("/login/membership")) {
    await page.locator("input[type='radio']").first().check();
    await page.locator("button[type='submit']").click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  }
  await page.close();
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

const routeUrl = (
  baseUrl: string,
  route: RouteSpec,
  learnerQuery: string
): string =>
  route.path === "/learn"
    ? `${baseUrl}/learn?${learnerQuery}`
    : `${baseUrl}${route.path}`;

const inspect = async (
  browser: Browser,
  options: {
    readonly baseUrl: string;
    readonly learnerQuery: string;
    readonly routes: readonly RouteSpec[];
    readonly out: string;
    readonly compare?: string;
  }
): Promise<Finding[]> => {
  mkdirSync(options.out, { recursive: true });
  const findings: Finding[] = [];
  const states = new Map<
    Audience,
    Awaited<ReturnType<BrowserContext["storageState"]>>
  >();
  for (const audience of ["teacher", "student"] as const) {
    if (options.routes.some((route) => route.audience === audience)) {
      const context = await browser.newContext();
      await signIn(context, options.baseUrl, accounts[audience]);
      states.set(audience, await context.storageState());
      await context.close();
    }
  }

  for (const route of options.routes) {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
        storageState: states.get(route.audience),
      });
      const page = await context.newPage();
      await page.goto(routeUrl(options.baseUrl, route, options.learnerQuery), {
        waitUntil: "load",
      });
      await page.locator("main").first().waitFor();
      await page.waitForTimeout(settleMs);
      const file = `${slug(route.path)}-${viewport.name}.png`;
      const screenshot = path.join(options.out, file);
      await page.screenshot({ path: screenshot, fullPage: true });
      const previous = options.compare
        ? path.join(options.compare, file)
        : undefined;
      findings.push({
        key: `${route.path}@${viewport.name}`,
        route: route.path,
        viewport: viewport.name,
        axe: await axeProblems(page),
        overflow: await overflowProblems(page),
        ...(await distinctValues(page)),
        screenshot,
        changed:
          previous && existsSync(previous)
            ? await changedShare(context, previous, screenshot)
            : undefined,
      });
      await context.close();
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
    note: "Ratchet ceiling for scripts/verify-ui.ts: blocking findings per route and viewport. Counts may only fall; regenerate with --update after a reduction.",
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
    `${"route".padEnd(22)} ${"axe".padStart(4)} ${"x-scroll".padStart(8)} ${"sizes".padStart(5)} ${"radii".padStart(5)}  changed`
  );
  for (const finding of findings) {
    const ceiling = budget[finding.key] ?? { axe: 0, overflow: 0 };
    const grew =
      finding.axe.length > ceiling.axe ||
      finding.overflow.length > ceiling.overflow;
    if (grew) {
      failed += 1;
    }
    console.log(
      `${finding.key.padEnd(22)} ${String(finding.axe.length).padStart(4)} ${String(finding.overflow.length).padStart(8)} ${String(finding.fontSizes).padStart(5)} ${String(finding.radii).padStart(5)}  ${finding.changed ?? "-"}${grew ? "  FAIL (over budget)" : ""}`
    );
    for (const problem of [...finding.axe, ...finding.overflow]) {
      console.log(`    ${problem}`);
    }
  }
  const mocks = ROUTES.filter(
    (route) =>
      route.mock && findings.some((finding) => finding.route === route.path)
  ).map(
    (route) =>
      `  ${route.path.padEnd(11)} .impeccable/mocks/screens/${route.mock ?? ""}.html`
  );
  console.log(
    `\nScreenshots: ${out}\nCompare against the approved mocks:\n${mocks.join("\n")}`
  );
  console.log(
    failed === 0
      ? `\n${gateName}: ${findings.length} route views within budget.`
      : `\n${gateName}: ${failed} route views over budget.`
  );
  return failed === 0 ? 0 : 1;
};

const main = async (): Promise<number> => {
  loadEnvironmentFile();
  const options = parseArguments();
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
      seedScripts: ["scripts/student-probe/seed.ts"],
    },
    async ({ baseUrl, seedOutputs }) => {
      const links = JSON.parse(
        seedOutputs[0]?.trim().split("\n").at(-1) ?? "{}"
      ) as Record<string, { assignment: string; variant: string }>;
      const learner = links.en;
      const learnerQuery = learner
        ? `assignment=${learner.assignment}&variant=${learner.variant}`
        : "";
      const browser = await chromium.launch({ executablePath: chromiumPath });
      try {
        const findings = await inspect(browser, {
          baseUrl,
          learnerQuery,
          routes: options.routes,
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
