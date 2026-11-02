import { chromium } from "playwright-core";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CHROME =
  "/home/abdullah/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
export const BASE = "http://localhost:3001";
export const WALK = here;
export const FIXTURES = join(here, "..", "fixtures");

mkdirSync(join(here, "shots"), { recursive: true });

export const logState = (id, data) => {
  appendFileSync(
    join(here, "log.jsonl"),
    JSON.stringify({ id, ...data, ts: new Date().toISOString() }) + "\n",
  );
};

export async function launch(
  viewport = { width: 1440, height: 900 },
  storageState,
) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ viewport, storageState });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  return { browser, context, page, errors };
}

export async function shot(page, id, note = "") {
  const file = join(here, "shots", `${id}.png`);
  await page.screenshot({ path: file });
  logState(id, { url: page.url(), note, file });
  console.log(`shot ${id} -> ${page.url()} ${note}`);
}

export const settle = (page, ms = 700) => page.waitForTimeout(ms);

export async function done(browser) {
  await browser.close();
}
