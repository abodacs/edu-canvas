import { BASE, launch, shot, settle, done, logState, FIXTURES } from "./helper.mjs";
import { join } from "node:path";

const { browser, page, errors } = await launch(undefined, "auth-teacher-demo.json");
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
  if (url.includes("/api/lessons/generate") || url.includes("/api/lessons/sources")) {
    console.log("API", response.request().method(), response.status(), url.replace(BASE, ""));
  }
});

await page.goto(BASE + "/workspace");
await settle(page, 2500);

// A. moderation block + recovery panel (#185)
await step("moderation-prompt", async () => {
  const box = page.getByLabel(/what should students practice/i);
  await box.fill(
    "Make a lesson for my student Omar Nabil whose email is omar.demo@example.test about equivalent fractions.",
  );
  await settle(page, 300);
  await page.getByRole("button", { name: /create lesson/i }).click();
  await settle(page, 2500);
});
await shot(page, "70-moderation-blocked");
await page.screenshot({ path: "shots/71-moderation-fullpage.png", fullPage: true });

await step("revise-request", async () => {
  const revise = page.getByRole("button", { name: /revise request/i }).first();
  if (await revise.isVisible().catch(() => false)) {
    await revise.click();
    await settle(page, 800);
  }
});
await shot(page, "72-revise-armed");

// B. partial extraction with the scanned PDF
await step("upload-scanned", async () => {
  const cb = page.getByLabel(/this material is synthetic/i);
  if (!(await cb.isChecked().catch(() => false))) await cb.check();
  await settle(page, 200);
  await page.setInputFiles('input[type="file"]', join(FIXTURES, "scanned.pdf"));
  await settle(page, 1200);
});
await shot(page, "73-scanned-extracting");
await settle(page, 4000);
await shot(page, "74-scanned-partial");
await page.screenshot({ path: "shots/75-scanned-fullpage.png", fullPage: true });

logState("phase8-done", { url: page.url() });
await done(browser);
console.log("pageerrors:", JSON.stringify(errors));
