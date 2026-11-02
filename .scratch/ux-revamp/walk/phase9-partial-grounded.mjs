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
  if (url.includes("/api/lessons/generate") || url.includes("/api/publications")) {
    console.log("API", response.request().method(), response.status(), url.replace(BASE, ""));
  }
});

await page.goto(BASE + "/workspace");
await settle(page, 2500);

// A. partial extraction
await step("upload-mixed", async () => {
  const cb = page.getByLabel(/this material is synthetic/i);
  await cb.check();
  await settle(page, 200);
  await page.setInputFiles('input[type="file"]', join(FIXTURES, "mixed.pdf"));
  await settle(page, 1200);
  await page.getByText("mixed.pdf").first().waitFor({ timeout: 30000 });
  await settle(page, 4000);
});
await shot(page, "76-partial-state");
await page.screenshot({ path: "shots/77-partial-fullpage.png", fullPage: true });

// B. replace with the good TXT, review, generate grounded
await step("replace-txt", async () => {
  await page.getByLabel(/replace the source file/i).setInputFiles(
    join(FIXTURES, "fractions-notes.txt"),
  );
  await settle(page, 3000);
  await page.getByText(/complete/i).first().waitFor({ timeout: 30000 });
  await settle(page, 400);
});
await shot(page, "78-replaced-complete");

await step("review-source", async () => {
  await page.getByRole("button", { name: /review the extracted text/i }).click();
  await settle(page, 500);
  await page.getByLabel(/the source covers the required skills/i).check();
  await page.getByRole("button", { name: /confirm review/i }).click();
  await settle(page, 900);
});
await shot(page, "79-source-bound");

await step("generate-grounded", async () => {
  await page.getByRole("button", { name: /create lesson/i }).click();
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    const generating = await page.getByText(/shaping the draft/i).isVisible().catch(() => false);
    if (!generating) break;
    await page.waitForTimeout(3000);
  }
  await settle(page, 800);
});
await shot(page, "80-grounded-result");

logState("phase9-done", { url: page.url() });
await done(browser);
console.log("pageerrors:", JSON.stringify(errors));
