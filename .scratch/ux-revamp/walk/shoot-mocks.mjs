import { chromium } from "playwright-core";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CHROME =
  "/home/abdullah/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
const screens = join(here, "..", "..", "..", ".impeccable", "mocks", "screens");
const out = join(screens, "captures");

const targets = [
  ["0-landing.html", "0-landing-target.png", { width: 1440, height: 900 }],
  ["1-studio.html", "1-studio-target.png", { width: 1440, height: 900 }],
  ["2-review.html", "2-review-target.png", { width: 1440, height: 900 }],
  ["3-publish.html", "3-publish-target.png", { width: 1440, height: 900 }],
  ["4-dashboard.html", "4-dashboard-target.png", { width: 1440, height: 900 }],
  ["5-sign-in.html", "5-sign-in-target.png", { width: 1440, height: 900 }],
  ["6-errors.html", "6-errors-target.png", { width: 1440, height: 900 }],
  ["7-learn.html", "7-learn-target.png", { width: 1440, height: 900 }],
  ["8-state-matrix.html", "8-state-matrix-target.png", { width: 1440, height: 900 }],
  ["2-review.html", "2-review-mobile-target.png", { width: 390, height: 844 }],
  ["7-learn.html", "7-learn-mobile-target.png", { width: 390, height: 844 }],
];

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
for (const [file, name, viewport] of targets) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto("file://" + join(screens, file));
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, name), fullPage: true });
  console.log("captured", name);
  await context.close();
}
await browser.close();
