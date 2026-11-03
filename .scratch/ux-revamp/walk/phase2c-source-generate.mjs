import { BASE, launch, shot, settle, done, logState, FIXTURES } from "./helper.mjs";
import { join } from "node:path";

const { browser, page, errors } = await launch(undefined, "auth-teacher.json");
const step = async (name, fn) => {
  try {
    await fn();
  } catch (error) {
    logState(name, { error: String(error).slice(0, 300) });
    console.log("STEP FAIL", name, String(error).slice(0, 300));
  }
};

await page.goto(BASE + "/workspace");
await settle(page, 2000);

// empty composer state
await step("composer-clear", async () => {
  const box = page.getByLabel(/what should students practice/i);
  await box.fill("");
  await settle(page, 500);
  await box.scrollIntoViewIfNeeded();
  await shot(page, "10-studio-composer-empty");
});

await step("objective-typed", async () => {
  const box = page.getByLabel(/what should students practice/i);
  await box.fill(
    "Introduce equivalent fractions with paper strips and fraction bars.",
  );
  await settle(page, 600);
  await shot(page, "11-studio-objective-context");
});

// source upload
await step("upload-txt", async () => {
  await page.setInputFiles('input[type="file"]', join(FIXTURES, "fractions-notes.txt"));
  await settle(page, 400);
  await shot(page, "12-source-uploading");
  await settle(page, 2500);
  await shot(page, "13-source-after-extract");
});

await step("synthetic-checkbox", async () => {
  const cb = page.getByLabel(/this material is synthetic/i);
  if (await cb.isVisible().catch(() => false)) {
    await cb.check();
    await settle(page, 400);
    await shot(page, "14-source-synthetic-checked");
  }
});

await done(browser);
console.log("pageerrors:", JSON.stringify(errors));
