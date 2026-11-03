/**
Friction runner — headless proxy for the baseline task script (T1–T5).
Records per-task wall time and step counts. This measures friction, NOT
usability; label results accordingly (see task-script.md).

Usage: node friction-runner.mjs <baseUrl> <outPath>
Requires: the deterministic provider (dev), fixtures from ../fixtures, and a
scratch DB seeded like the walk. Student tasks are excluded while W6 blocks
the learner bridge.
*/
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CHROME =
  "/home/abdullah/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
const BASE = process.argv[2] ?? "http://localhost:3001";
const OUT = process.argv[3] ?? join(here, "results.json");
const FIXTURES = join(here, "..", "fixtures");

const results = [];
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const runTask = async (id, task) => {
  const start = Date.now();
  let stepCount = 0;
  let errors = 0;
  let success = false;
  try {
    await task();
    success = true;
  } catch (error) {
    errors += 1;
    results.push({ id, note: String(error).split("\n")[0].slice(0, 200) });
    try {
      await page.screenshot({ path: join(here, `fail-${id}.png`) });
    } catch {}
  }
  results.push({
    id,
    success,
    seconds: Math.round((Date.now() - start) / 100) / 10,
    steps: stepCount,
    errors,
  });
  console.log(id, success ? "ok" : "FAIL", results.at(-1));
};

const settle = (ms = 600) => page.waitForTimeout(ms);

await runTask("T1-sign-in-to-workspace", async () => {
  await page.goto(BASE + "/login");
  await page.waitForLoadState("networkidle").catch(() => {});
  await settle(900); // hydration: controlled inputs drop pre-hydration values
  await page.getByLabel(/email/i).fill("amira.north@example.test");
  await page.getByLabel(/password/i).fill("synthetic-pass-1");
  await page.getByRole("button", { name: /sign in/i }).click();
  await settle(1600);
  if (page.url().includes("membership")) {
    await page.getByRole("radio", { name: /Synthetic Fractions/ }).check();
    await page.getByRole("button", { name: /continue/i }).click();
    await settle(1400);
  }
  await page.getByLabel(/what should students practice/i).waitFor({ timeout: 20000 });
});

await runTask("T3-ground-source", async () => {
  await page.getByLabel(/this material is synthetic/i).check();
  await page.setInputFiles('input[type="file"]', join(FIXTURES, "fractions-notes.txt"));
  await page.getByText(/complete/i).first().waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: /review the extracted text/i }).click();
  await page.getByLabel(/the source covers the required skills/i).check();
  await page.getByRole("button", { name: /confirm review/i }).click();
  await page.getByText(/drafts use/i).waitFor({ timeout: 20000 });
});

await runTask("T2-objective-to-variants", async () => {
  const generateOnce = async () => {
    await page
      .getByLabel(/what should students practice/i)
      .fill("Introduce equivalent fractions with paper strips and fraction bars.");
    await page.getByRole("button", { name: /create lesson/i }).click();
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      if (!(await page.getByText(/shaping the draft/i).isVisible().catch(() => false))) break;
      await page.waitForTimeout(2000);
    }
    await settle(800);
  };
  // the gate is nondeterministic on a live model: retry until a draft passes
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await generateOnce();
    if (
      await page
        .getByRole("button", { name: /review and publish this pack/i })
        .isVisible()
        .catch(() => false)
    ) {
      return;
    }
  }
  throw new Error("no passing draft in 3 attempts");
});

await runTask("T4-review-and-approve-one-screen", async () => {
  await page.getByRole("button", { name: /review and publish this pack/i }).click();
  await page.getByRole("button", { name: /review screen/i }).first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: /review screen/i }).first().click();
  await settle(1000); // editor + preview iframe settle
  const warnings = page.getByLabel(/^acknowledge warning/i);
  const count = await warnings.count();
  for (let w = 0; w < count; w += 1) await warnings.nth(w).check();
  await page.getByRole("button", { name: /approve this screen/i }).click({ timeout: 30000 });
  await page.getByText(/screen approved/i).first().waitFor({ timeout: 20000 });
});

await runTask("T5-publish-to-one-learner", async () => {
  const back = page.getByRole("button", { name: /back to the gallery/i });
  if (await back.isVisible().catch(() => false)) {
    await back.click();
    await settle(600);
  }
  // publishing needs all 5 approvals: finish any remaining screens
  for (let index = 0; index < 5; index += 1) {
    const open = page.getByRole("button", { name: /review screen/i }).nth(index);
    if (!(await open.isVisible().catch(() => false))) break;
    await open.click({ timeout: 30000 });
    await settle(900);
    const approve = page.getByRole("button", { name: /approve this screen/i });
    if (await approve.isVisible().catch(() => false)) {
      const warnings = page.getByLabel(/^acknowledge warning/i);
      const count = await warnings.count();
      for (let w = 0; w < count; w += 1) await warnings.nth(w).check();
      await approve.click({ timeout: 30000 });
      await settle(1200);
    }
    const backAgain = page.getByRole("button", { name: /back to the gallery/i });
    if (await backAgain.isVisible().catch(() => false)) {
      await backAgain.click();
      await settle(600);
    }
  }
  const reverse = page.getByRole("button", { name: /approve the reverse path/i }).first();
  if (await reverse.isVisible().catch(() => false)) {
    await reverse.click({ timeout: 30000 });
    await settle(1200);
  }
  await page.getByRole("button", { name: /continue to publish/i }).click({ timeout: 30000 });
  await page.getByRole("button", { name: /publish and assign/i }).click();
  await page.getByText(/the pack is published/i).waitFor({ timeout: 20000 });
});

await browser.close();
writeFileSync(OUT, JSON.stringify({ baseUrl: BASE, at: new Date().toISOString(), results }, null, 2));
console.log("wrote", OUT);
