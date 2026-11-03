/**
Captures the design census that `pnpm verify:design-census` budgets
(`pnpm census:capture`).

The original capture lived in .scratch/ux-revamp/walk/audit-capture.mjs, which
is gitignored and has since been lost, so scripts/design-census.json could not
be regenerated and slice 1b of AgDR-0017 had no before/after evidence. This is
the committed replacement. It boots the built app on a scratch database
(scripts/ui-gate/app.ts), visits a fixed page set signed in as each page's
audience, and records for every rendered element its computed colour,
background, border colour, radius, font family, size, weight, line height and
shadow, plus every text block with its effective background for the AA check.

Default output is .scratch/ui-gate/census.json; `--write` replaces
scripts/design-census.json, the input the budget check reads.

Known gap: the 2026-11-02 census also listed review and blocked-generation
states, but its captures of them were error screens (28 elements each). Those
states need a generated draft owned by a signed-in teacher; they join this set
when the seed provides one.
*/
/* eslint-disable no-await-in-loop -- pages are captured one at a time so each starts from a settled render. */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright-core";

import { loadEnvironmentFile, withScratchApp } from "./ui-gate/app";
import { learnerQuery, signedInState } from "./ui-gate/session";

import type { Audience, StorageState } from "./ui-gate/session";
import type { Browser } from "playwright-core";

interface CensusPage {
  readonly name: string;
  readonly path: string;
  readonly audience: Audience;
  readonly phone?: boolean;
}

const PAGES: readonly CensusPage[] = [
  { name: "landing-signedout", path: "/", audience: "public" },
  { name: "landing-phone", path: "/", audience: "public", phone: true },
  { name: "landing-signedin", path: "/", audience: "teacher" },
  { name: "login", path: "/login", audience: "public" },
  { name: "login-phone", path: "/login", audience: "public", phone: true },
  { name: "signup", path: "/sign-up", audience: "public" },
  { name: "signup-phone", path: "/sign-up", audience: "public", phone: true },
  { name: "studio-composer", path: "/workspace", audience: "teacher" },
  {
    name: "phone-studio",
    path: "/workspace",
    audience: "teacher",
    phone: true,
  },
  { name: "dashboard", path: "/dashboard", audience: "teacher" },
  {
    name: "dashboard-phone",
    path: "/dashboard",
    audience: "teacher",
    phone: true,
  },
  { name: "learn-board", path: "/learn?{learner}", audience: "student" },
  {
    name: "learn-phone",
    path: "/learn?{learner}",
    audience: "student",
    phone: true,
  },
  { name: "learn-missing-params", path: "/learn", audience: "student" },
  { name: "learn-signedout", path: "/learn?{learner}", audience: "public" },
];

const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };
const settleMs = 1500;
const captureName = "census:capture";

// Runs in the browser; self-contained because Playwright serializes it.
const collect = (): Record<string, unknown> => {
  const keys = {
    color: "color",
    background: "backgroundColor",
    borderColor: "borderTopColor",
    radius: "borderTopLeftRadius",
    fontFamily: "fontFamily",
    fontSize: "fontSize",
    fontWeight: "fontWeight",
    lineHeight: "lineHeight",
    boxShadow: "boxShadow",
  } as const;
  const tallies: Record<
    string,
    Map<string, { count: number; sample: string }>
  > = {};
  for (const key of Object.keys(keys)) {
    tallies[key] = new Map();
  }
  const text: Record<string, string>[] = [];
  let elements = 0;

  for (const element of document.querySelectorAll<HTMLElement>("body *")) {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (
      box.width === 0 ||
      box.height === 0 ||
      style.visibility === "hidden" ||
      style.display === "none"
    ) {
      continue;
    }
    elements += 1;
    const classes = [...element.classList].slice(0, 2).join(".");
    const sample = `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ""}`;
    for (const [key, property] of Object.entries(keys)) {
      const value = style[property];
      if (key === "boxShadow" && value === "none") {
        continue;
      }
      if (key === "borderColor" && style.borderTopWidth === "0px") {
        continue;
      }
      const tally = tallies[key];
      const entry = tally?.get(value);
      if (entry) {
        entry.count += 1;
      } else {
        tally?.set(value, { count: 1, sample });
      }
    }
    const own = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join(" ")
      .trim();
    if (own.length > 0) {
      let background = "rgba(0, 0, 0, 0)";
      for (
        let current: HTMLElement | null = element;
        current;
        current = current.parentElement
      ) {
        const fill = getComputedStyle(current).backgroundColor;
        if (fill !== "rgba(0, 0, 0, 0)" && fill !== "transparent") {
          background = fill;
          break;
        }
      }
      text.push({
        text: own.slice(0, 80),
        color: style.color,
        background,
        size: style.fontSize,
        weight: style.fontWeight,
      });
    }
  }
  return {
    elements,
    textBlocks: text.length,
    ...Object.fromEntries(
      Object.entries(tallies).map(([key, tally]) => [
        key,
        Object.fromEntries(
          [...tally.entries()].toSorted((a, b) => b[1].count - a[1].count)
        ),
      ])
    ),
    text,
  };
};

const capture = async (
  browser: Browser,
  baseUrl: string,
  learner: string
): Promise<Record<string, unknown>[]> => {
  const states = new Map<Audience, StorageState>([
    ["teacher", await signedInState(browser, baseUrl, "teacher")],
    ["student", await signedInState(browser, baseUrl, "student")],
  ]);
  const records: Record<string, unknown>[] = [];
  for (const page of PAGES) {
    const viewport = page.phone ? phone : desktop;
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      storageState: states.get(page.audience),
    });
    const tab = await context.newPage();
    const url = `${baseUrl}${page.path.replace("{learner}", learner)}`;
    try {
      await tab.goto(url, { waitUntil: "load" });
      await tab.waitForTimeout(settleMs);
      records.push({
        page: page.name,
        url,
        viewport: `${viewport.width}x${viewport.height}`,
        ...(await tab.evaluate(collect)),
      });
    } catch (error) {
      records.push({ page: page.name, url, error: String(error) });
    } finally {
      await context.close();
    }
  }
  return records;
};

const main = async (): Promise<number> => {
  loadEnvironmentFile();
  const write = process.argv.includes("--write");
  const out = write
    ? path.join("scripts", "design-census.json")
    : path.join(".scratch", "ui-gate", "census.json");
  const chromiumPath =
    process.env.UI_GATE_CHROMIUM ?? chromium.executablePath();

  const outcome = await withScratchApp(
    {
      prefix: "edu_canvas_census",
      seedScripts: ["scripts/student-probe/seed.ts"],
    },
    async ({ baseUrl, seedOutputs }) => {
      const browser = await chromium.launch({ executablePath: chromiumPath });
      try {
        const records = await capture(
          browser,
          baseUrl,
          learnerQuery(seedOutputs[0])
        );
        mkdirSync(path.dirname(out), { recursive: true });
        writeFileSync(out, `${JSON.stringify(records, null, 2)}\n`);
        const failed = records.filter((record) => "error" in record);
        console.log(
          `${captureName}: ${records.length - failed.length}/${records.length} pages captured to ${out}`
        );
        return failed.length === 0 ? 0 : 1;
      } finally {
        await browser.close();
      }
    }
  );
  if (outcome.kind === "missing-build") {
    console.error(
      `${captureName}: .output/server/index.mjs is missing; run pnpm build first.`
    );
    return 1;
  }
  if (outcome.kind === "skipped") {
    console.error(`${captureName}: ${outcome.reason}`);
    return 1;
  }
  return outcome.value;
};

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`${captureName} failed:`, error);
  process.exitCode = 1;
}
