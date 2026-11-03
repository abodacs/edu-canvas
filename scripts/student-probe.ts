/**
#9 student path probe (`pnpm verify:student-probe`).

Runs the learner page in headless Chromium against the built server and a scratch database, and checks each state as an executable matrix: axe-core, keyboard-only attempt loop, responsive overflow, bidi, live announcements, and focus. It never touches the shared database beyond creating and dropping its own scratch database beside it.

Skip-safe: with no Chromium or no PostgreSQL it prints one explicit SKIP line and exits 0. Set STUDENT_PROBE_REQUIRED=true to turn a skip into a failure.
*/
/* eslint-disable no-await-in-loop, unicorn/try-complexity -- Browser steps are sequential by design: each key press depends on the focus the previous one left, and each scenario reuses one assignment's attempt budget. The top-level try owns the scratch database and server lifetime as one unit. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { chromium } from "playwright-core";

import {
  axeProblems,
  bidiProblems,
  canvasProblems,
  describeFocus,
  directionProblems,
  focusLandedProblems,
  focusTrapProblems,
  liveRegionProblems,
  motionProblems,
  overflowProblems,
  hasTabbedTo,
  touchTargetProblems,
} from "./student-probe/checks";
import { loadEnvironmentFile, withScratchApp } from "./ui-gate/app";

import type { Browser, BrowserContext, Page, Route } from "playwright-core";

type Language = "en" | "ar";

interface LearnerLink {
  readonly assignment: string;
  readonly variant: string;
}

interface CheckResult {
  readonly scenario: string;
  readonly check: string;
  readonly problems: readonly string[];
}

const probeName = "verify:student-probe";
const loadingDelayMs = 1500;
const studentEmail = "omar.demo@example.test";
const studentPassword = "synthetic-pass-1";

// AC1: narrow portrait, phone portrait, phone landscape, 200% zoom of a
// 1280px window (a 640 CSS-pixel viewport), and wide.
const viewports = [
  { name: "320 portrait", width: 320, height: 640 },
  { name: "390 portrait", width: 390, height: 844 },
  { name: "844 landscape", width: 844, height: 390 },
  { name: "200% zoom", width: 640, height: 400 },
  { name: "1280 wide", width: 1280, height: 800 },
] as const;
const phone = { width: 390, height: 844 };

// A bidi stress line: Latin numerals and a standard code inside an Arabic run.
const bidiToken = "4.NF.A.1";
const bidiPrecedingWord = "المعيار";
const bidiBody = `طابق كل كسر حسب ${bidiPrecedingWord} ${bidiToken} ثم اختر 3 من 6.`;

const sourceSelector = "[data-source]";
const unpairedSourceSelector = `${sourceSelector}[data-paired='false']`;
const targetSelector = "[data-target]";
const submitSelector = ".learn-submit";
const overflowPhoneCheck = "overflow 390";

const isSkipFailure = process.env.STUDENT_PROBE_REQUIRED === "true";

const skip = (reason: string): never => {
  const line = `SKIP ${probeName}: ${reason}`;
  if (isSkipFailure) {
    console.error(`${line} (STUDENT_PROBE_REQUIRED=true, failing)`);
    process.exit(1);
  }
  console.log(line);
  process.exit(0);
};

const signIn = async (page: Page, baseUrl: string): Promise<void> => {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email address").fill(studentEmail);
  await page.getByLabel("Password", { exact: true }).fill(studentPassword);
  await page.locator("button[type='submit']").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
};

const learnUrl = (baseUrl: string, link: LearnerLink): string =>
  `${baseUrl}/learn?assignment=${link.assignment}&variant=${link.variant}`;

const openBoard = async (page: Page, url: string): Promise<void> => {
  await page.goto(url);
  await page.locator(".learn-card").waitFor();
};

/**
Patch the real run response; the server still owns everything else.
*/
const patchRun = async (
  page: Page,
  patch: (body: Record<string, unknown>) => void
): Promise<void> => {
  await page.route("**/api/learner/runs", async (route: Route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    patch(body);
    await route.fulfill({ response, json: body });
  });
};

const assignedSection = (
  body: Record<string, unknown>
): Record<string, unknown> | undefined => {
  const lesson = body.lesson as {
    assignedSectionId: string;
    sections: Record<string, unknown>[];
  };
  return lesson.sections.find(
    (section) => section.id === lesson.assignedSectionId
  );
};

/**
Pair every source with its target by keyboard alone (source i matches target
i in the deterministic pack), recording each focus stop.
*/
const pairByKeyboard = async (
  page: Page,
  count: number,
  trace: string[]
): Promise<string[]> => {
  const problems: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const reachedSource = await hasTabbedTo(
      page,
      { selector: unpairedSourceSelector },
      trace
    );
    if (!reachedSource) {
      problems.push(`keyboard: could not reach unpaired source ${index + 1}`);
      return problems;
    }
    await page.keyboard.press("Enter");
    trace.push(`Enter → ${await describeFocus(page)}`);
    const targetLabel = await page
      .locator(targetSelector)
      .nth(index)
      .textContent();
    const reachedTarget = await hasTabbedTo(
      page,
      { selector: targetSelector, text: targetLabel ?? "" },
      trace
    );
    if (!reachedTarget) {
      problems.push(`keyboard: could not reach target "${targetLabel ?? ""}"`);
      return problems;
    }
    await page.keyboard.press("Enter");
    trace.push(`Enter → ${await describeFocus(page)}`);
    const expected = {
      selector:
        index + 1 < count
          ? unpairedSourceSelector
          : `${sourceSelector}, ${submitSelector}`,
    };
    problems.push(
      ...(await focusLandedProblems(page, `pairing ${index + 1}`, expected))
    );
  }
  return problems;
};

interface Matrix {
  readonly browser: Browser;
  readonly baseUrl: string;
  readonly storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
  readonly links: Readonly<Record<Language, LearnerLink>>;
  readonly results: CheckResult[];
  readonly traces: Record<string, string[]>;
}

const record = (
  matrix: Matrix,
  scenario: string,
  check: string,
  problems: readonly string[]
): void => {
  matrix.results.push({ scenario, check, problems });
};

const withPage = async (
  matrix: Matrix,
  options: {
    readonly viewport?: { readonly width: number; readonly height: number };
    readonly colorScheme?: "light" | "dark";
    readonly reducedMotion?: "reduce" | "no-preference";
    readonly initScript?: string;
  },
  body: (page: Page) => Promise<void>
): Promise<void> => {
  await using context = await matrix.browser.newContext({
    storageState: matrix.storageState,
    viewport: options.viewport ?? phone,
    colorScheme: options.colorScheme ?? "light",
    reducedMotion: options.reducedMotion ?? "no-preference",
  });
  if (options.initScript) {
    await context.addInitScript(options.initScript);
  }
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  await body(page);
  if (pageErrors.length > 0) {
    throw new Error(`page errors: ${pageErrors.join(" | ")}`);
  }
};

const scenarioLoading = (matrix: Matrix, language: Language) => {
  const scenario = `${language} loading`;
  return withPage(matrix, {}, async (page) => {
    await page.route("**/api/learner/runs", async (route) => {
      await delay(loadingDelayMs);
      await route.continue();
    });
    await page.goto(learnUrl(matrix.baseUrl, matrix.links[language]));
    await page.locator("output[aria-busy='true']").waitFor();
    record(matrix, scenario, "axe", await axeProblems(page));
    record(matrix, scenario, overflowPhoneCheck, await overflowProblems(page));
  });
};

const scenarioEmpty = (matrix: Matrix, language: Language) => {
  const scenario = `${language} empty`;
  return withPage(
    matrix,
    { viewport: { width: 320, height: 640 } },
    async (page) => {
      await patchRun(page, (body) => {
        const section = assignedSection(body);
        if (section) {
          section.items = [];
        }
      });
      await openBoard(page, learnUrl(matrix.baseUrl, matrix.links[language]));
      record(matrix, scenario, "axe", await axeProblems(page));
      record(matrix, scenario, "overflow 320", await overflowProblems(page));
      record(
        matrix,
        scenario,
        "direction",
        await directionProblems(page, language)
      );
      const submitDisabled = await page.locator(submitSelector).isDisabled();
      record(
        matrix,
        scenario,
        "no empty submit",
        submitDisabled ? [] : ["Done is enabled with nothing to match"]
      );
      record(
        matrix,
        scenario,
        "focus not trapped",
        await focusTrapProblems(page)
      );
    }
  );
};

const scenarioViewports = async (matrix: Matrix, language: Language) => {
  for (const viewport of viewports) {
    const scenario = `${language} board ${viewport.name}`;
    await withPage(matrix, { viewport }, async (page) => {
      await openBoard(page, learnUrl(matrix.baseUrl, matrix.links[language]));
      record(matrix, scenario, "overflow", await overflowProblems(page));
      record(
        matrix,
        scenario,
        "touch targets",
        await touchTargetProblems(page)
      );
      record(
        matrix,
        scenario,
        "direction",
        await directionProblems(page, language)
      );
      if (viewport.width === 390 || viewport.width === 1280) {
        record(matrix, scenario, "axe", await axeProblems(page));
      }
    });
  }
};

const scenarioKeyboardLoop = (matrix: Matrix, language: Language) => {
  const scenario = `${language} keyboard loop`;
  const trace: string[] = [];
  matrix.traces[scenario] = trace;
  return withPage(matrix, {}, async (page) => {
    await openBoard(page, learnUrl(matrix.baseUrl, matrix.links[language]));
    const sourceCount = await page.locator(sourceSelector).count();

    // Clear: one keyboard pair, then Clear returns focus to the first source.
    record(matrix, scenario, "pair one", await pairByKeyboard(page, 1, trace));
    const clearLabel =
      (await page.locator(".learn-actions .learn-retry").textContent()) ?? "";
    const reachedClear = await hasTabbedTo(
      page,
      { selector: ".learn-actions .learn-retry" },
      trace
    );
    await page.keyboard.press("Enter");
    trace.push(`Enter (${clearLabel}) → ${await describeFocus(page)}`);
    record(matrix, scenario, "clear", [
      ...(reachedClear ? [] : ["keyboard: could not reach Clear"]),
      ...(await focusLandedProblems(page, "clear", {
        selector: sourceSelector,
      })),
    ]);

    // Full attempt: pair everything, submit, read the reveal.
    record(
      matrix,
      scenario,
      "pair all",
      await pairByKeyboard(page, sourceCount, trace)
    );
    record(matrix, scenario, "ready-to-submit axe", await axeProblems(page));
    const reachedSubmit = await hasTabbedTo(
      page,
      { selector: submitSelector },
      trace
    );
    await page.keyboard.press("Enter");
    await page.locator(".learn-reveal").waitFor();
    trace.push(`Enter (submit) → ${await describeFocus(page)}`);
    record(matrix, scenario, "submit", [
      ...(reachedSubmit ? [] : ["keyboard: could not reach Done"]),
      ...(await focusLandedProblems(page, "submit", {
        selector: "#learn-reveal-heading",
      })),
    ]);
    const scoreLine = (await page.locator(".learn-result").textContent()) ?? "";
    record(matrix, scenario, "aria-live grade", [
      ...(scoreLine === "" ? ["no score line rendered"] : []),
      ...(await liveRegionProblems(page, scoreLine)),
    ]);
    record(matrix, scenario, "graded axe", await axeProblems(page));
    record(
      matrix,
      scenario,
      "graded direction",
      await directionProblems(page, language)
    );
    for (const width of [320, 390] as const) {
      await page.setViewportSize({ width, height: 800 });
      record(
        matrix,
        scenario,
        `graded overflow ${width}`,
        await overflowProblems(page)
      );
    }

    // Reveal → Try again: focus returns to the board.
    const reachedRetry = await hasTabbedTo(
      page,
      { selector: ".learn-result-panel .learn-retry" },
      trace
    );
    await page.keyboard.press("Enter");
    await page.locator(submitSelector).waitFor();
    await page.waitForFunction(() => document.activeElement !== document.body);
    trace.push(`Enter (retry) → ${await describeFocus(page)}`);
    record(matrix, scenario, "retry", [
      ...(reachedRetry ? [] : ["keyboard: could not reach Try again"]),
      ...(await focusLandedProblems(page, "retry", {
        selector: sourceSelector,
      })),
    ]);
    record(
      matrix,
      scenario,
      "focus not trapped",
      await focusTrapProblems(page)
    );
  });
};

const scenarioError = (matrix: Matrix, language: Language) => {
  const scenario = `${language} error (409)`;
  return withPage(matrix, {}, async (page) => {
    await page.route("**/api/learner/attempts", (route) => {
      return route.fulfill({
        status: 409,
        json: { code: "STALE_RUN_REVISION", message: "stale" },
      });
    });
    await openBoard(page, learnUrl(matrix.baseUrl, matrix.links[language]));
    await page.locator(sourceSelector).first().click();
    await page.locator(targetSelector).first().click();
    await page.locator(submitSelector).focus();
    await page.keyboard.press("Enter");
    await page.locator("[role='alert']").waitFor();
    record(
      matrix,
      scenario,
      "focus on error",
      await focusLandedProblems(page, "failed submit", {
        selector: "[role='alert']",
      })
    );
    record(matrix, scenario, "axe", await axeProblems(page));
    record(matrix, scenario, overflowPhoneCheck, await overflowProblems(page));
  });
};

/**
The app defines a dark palette under the `.dark` class but has no theme switch
yet, so the probe applies the class itself: the learner surfaces must already
read correctly in both palettes when theming lands.
*/
const scenarioDarkReducedMotion = (matrix: Matrix, language: Language) => {
  const scenario = `${language} dark + reduced motion`;
  return withPage(
    matrix,
    { colorScheme: "dark", reducedMotion: "reduce" },
    async (page) => {
      await openBoard(page, learnUrl(matrix.baseUrl, matrix.links[language]));
      await page.evaluate(() => {
        document.documentElement.classList.add("dark");
      });
      await page.locator(sourceSelector).first().click();
      await page.locator(targetSelector).first().click();
      record(matrix, scenario, "axe (contrast)", await axeProblems(page));
      record(matrix, scenario, "no motion", await motionProblems(page));
    }
  );
};

const disableCanvas = `
  HTMLCanvasElement.prototype.getContext = () => null;
  globalThis.OffscreenCanvas = undefined;
`;

const scenarioCanvasDisabled = (matrix: Matrix, language: Language) => {
  const scenario = `${language} canvas disabled`;
  return withPage(matrix, { initScript: disableCanvas }, async (page) => {
    await openBoard(page, learnUrl(matrix.baseUrl, matrix.links[language]));
    record(matrix, scenario, "no canvas", await canvasProblems(page));
    await page.locator(sourceSelector).first().click();
    await page.locator(targetSelector).first().click();
    await page.locator(submitSelector).click();
    await page.locator(".learn-reveal").waitFor();
    const scoreLine = (await page.locator(".learn-result").textContent()) ?? "";
    record(
      matrix,
      scenario,
      "graded without canvas",
      scoreLine === "" ? ["no score after submit"] : []
    );
  });
};

const scenarioBidi = (matrix: Matrix) => {
  const scenario = "ar bidi";
  return withPage(matrix, {}, async (page) => {
    await patchRun(page, (body) => {
      const section = assignedSection(body);
      if (section) {
        section.body = bidiBody;
      }
    });
    await openBoard(page, learnUrl(matrix.baseUrl, matrix.links.ar));
    record(
      matrix,
      scenario,
      `"${bidiToken}" in Arabic run`,
      await bidiProblems(page, bidiToken, bidiPrecedingWord)
    );
    record(matrix, scenario, overflowPhoneCheck, await overflowProblems(page));
  });
};

const scenarioMissingLink = (matrix: Matrix) => {
  const scenario = "missing link";
  return withPage(
    matrix,
    { viewport: { width: 320, height: 640 } },
    async (page) => {
      await page.goto(`${matrix.baseUrl}/learn`);
      await page.locator(".learn-status").waitFor();
      record(matrix, scenario, "axe", await axeProblems(page));
      record(matrix, scenario, "overflow 320", await overflowProblems(page));
    }
  );
};

const runMatrix = async (matrix: Matrix): Promise<void> => {
  await scenarioMissingLink(matrix);
  for (const language of ["en", "ar"] as const) {
    await scenarioLoading(matrix, language);
    await scenarioEmpty(matrix, language);
    await scenarioViewports(matrix, language);
    await scenarioKeyboardLoop(matrix, language);
    await scenarioError(matrix, language);
    await scenarioDarkReducedMotion(matrix, language);
    await scenarioCanvasDisabled(matrix, language);
  }
  await scenarioBidi(matrix);
};

const report = (matrix: Matrix): number => {
  const failed = matrix.results.filter((result) => result.problems.length > 0);
  for (const result of matrix.results) {
    const mark = result.problems.length === 0 ? "PASS" : "FAIL";
    console.log(`${mark} ${result.scenario} · ${result.check}`);
    for (const problem of result.problems) {
      console.log(`     ${problem}`);
    }
  }
  const evidenceDirectory =
    process.env.STUDENT_PROBE_EVIDENCE ??
    path.join(tmpdir(), "edu-canvas-student-probe");
  mkdirSync(evidenceDirectory, { recursive: true });
  const evidencePath = path.join(evidenceDirectory, "evidence.json");
  writeFileSync(
    evidencePath,
    `${JSON.stringify({ results: matrix.results, traces: matrix.traces }, null, 2)}\n`
  );
  console.log(
    `${probeName}: ${matrix.results.length - failed.length}/${matrix.results.length} checks passed; evidence ${evidencePath}`
  );
  return failed.length === 0 ? 0 : 1;
};

const main = async (): Promise<number> => {
  loadEnvironmentFile();

  const chromiumPath =
    process.env.STUDENT_PROBE_CHROMIUM ?? chromium.executablePath();
  if (!existsSync(chromiumPath)) {
    skip(
      `no Chromium at ${chromiumPath} (install with \`pnpm exec playwright-core install chromium\` or set STUDENT_PROBE_CHROMIUM)`
    );
  }

  let browser: Browser | undefined;
  const outcome = await withScratchApp(
    {
      prefix: "edu_canvas_probe",
      seedScripts: ["scripts/student-probe/seed.ts"],
    },
    async ({ baseUrl, seedOutputs }) => {
      const links = JSON.parse(
        seedOutputs[0]?.trim().split("\n").at(-1) ?? "{}"
      ) as Record<Language, LearnerLink>;
      try {
        browser = await chromium.launch({ executablePath: chromiumPath });
        const signInContext = await browser.newContext({ viewport: phone });
        await signIn(await signInContext.newPage(), baseUrl);
        const storageState = await signInContext.storageState();
        await signInContext.close();

        const matrix: Matrix = {
          browser,
          baseUrl,
          storageState,
          links,
          results: [],
          traces: {},
        };
        await runMatrix(matrix);
        return report(matrix);
      } finally {
        await browser?.close();
      }
    }
  );
  if (outcome.kind === "missing-build") {
    console.error(
      `${probeName}: .output/server/index.mjs is missing; run pnpm build first.`
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
  console.error(`${probeName} failed:`, error);
  process.exitCode = 1;
}
