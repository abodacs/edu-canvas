import { BASE, launch, shot, settle, done, logState, FIXTURES } from "./helper.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { browser, context, page, errors } = await launch();
const step = async (name, fn) => {
  try {
    await fn();
  } catch (error) {
    logState(name, { error: String(error).slice(0, 240) });
    console.log("STEP FAIL", name, String(error).slice(0, 240));
  }
};

page.on("response", (response) => {
  const url = response.url();
  if (url.includes("/api/lessons/generate") || url.includes("/api/publications")) {
    console.log("API", response.request().method(), response.status(), url.replace(BASE, ""));
  }
});

// fresh sign-in (W5 killed the old session)
await page.goto(BASE + "/login");
await settle(page);
await page.getByLabel(/email/i).fill("amira.north@example.test");
await page.getByLabel(/password/i).fill("synthetic-pass-1");
await page.getByRole("button", { name: /sign in/i }).click();
await settle(page, 1800);
if (page.url().includes("membership")) {
  await page.getByRole("radio", { name: /Synthetic Fractions/ }).check();
  await page.getByRole("button", { name: /continue/i }).click();
  await settle(page, 1500);
}
await context.storageState({ path: join(here, "auth-teacher-demo.json") });

// upload + review
await step("upload", async () => {
  await page.getByLabel(/this material is synthetic/i).check();
  await settle(page, 200);
  await page.setInputFiles('input[type="file"]', join(FIXTURES, "fractions-notes.txt"));
  await page.getByText("fractions-notes.txt").first().waitFor({ timeout: 30000 });
  await page.getByText(/complete/i).first().waitFor({ timeout: 30000 });
  await settle(page, 400);
});
await step("review-source", async () => {
  await page.getByRole("button", { name: /review the extracted text/i }).click();
  await settle(page, 500);
  await page.getByLabel(/the source covers the required skills/i).check();
  await page.getByRole("button", { name: /confirm review/i }).click();
  await settle(page, 900);
});
await shot(page, "90-source-bound-fresh");

// generate until pass
let passed = false;
for (let attempt = 1; attempt <= 3 && !passed; attempt += 1) {
  await step(`generate-${attempt}`, async () => {
    const box = page.getByLabel(/what should students practice/i);
    await box.fill("Introduce equivalent fractions with paper strips and fraction bars.");
    await page.getByRole("button", { name: /create lesson/i }).click();
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      const generating = await page.getByText(/shaping the draft/i).isVisible().catch(() => false);
      if (!generating) break;
      await page.waitForTimeout(3000);
    }
    await settle(page, 800);
  });
  passed = await page
    .getByRole("button", { name: /review and publish this pack/i })
    .isVisible()
    .catch(() => false);
  logState(`generate-${attempt}`, { passed });
}

if (passed) {
  await step("open-review", async () => {
    await page.getByRole("button", { name: /review and publish this pack/i }).click();
    await settle(page, 1500);
  });
  const reviewUrl = page.url();
  logState("review-url", { url: reviewUrl });
  await shot(page, "91-review-open");

  await step("approve-all", async () => {
    const total = await page.getByRole("button", { name: /review screen/i }).count();
    for (let index = 0; index < total; index += 1) {
      const open = page.getByRole("button", { name: /review screen/i }).nth(index);
      if (!(await open.isVisible().catch(() => false))) continue;
      await open.click({ timeout: 20000 });
      await settle(page, 900);
      const approve = page.getByRole("button", { name: /approve this screen/i });
      if (await approve.isVisible().catch(() => false)) {
        const warnings = page.getByLabel(/^acknowledge warning/i);
        const count = await warnings.count();
        for (let w = 0; w < count; w += 1) await warnings.nth(w).check().catch(() => {});
        await approve.click({ timeout: 20000 });
        await settle(page, 1400);
      }
      const back = page.getByRole("button", { name: /back to the gallery/i }).first();
      if (await back.isVisible().catch(() => false)) {
        await back.click({ timeout: 20000 });
        await settle(page, 800);
      }
    }
    const reverse = page.getByRole("button", { name: /approve the reverse path/i }).first();
    if (await reverse.isVisible().catch(() => false)) {
      await reverse.click({ timeout: 20000 });
      await settle(page, 1400);
    }
  });
  await shot(page, "92-all-approved");

  await step("publish", async () => {
    await page.getByRole("button", { name: /continue to publish/i }).click({ timeout: 20000 });
    await settle(page, 800);
    await shot(page, "93-picker");
    await page.getByRole("button", { name: /publish and assign/i }).click({ timeout: 20000 });
    await settle(page, 2500);
  });
  await shot(page, "94-published-grounded");
  await page.screenshot({ path: "shots/95-published-grounded-full.png", fullPage: true });
}

logState("phase10-done", { url: page.url(), passed });
await done(browser);
console.log("pageerrors:", JSON.stringify(errors), "passed:", passed);
