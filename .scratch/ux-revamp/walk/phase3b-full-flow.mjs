import { BASE, launch, shot, settle, done, logState, FIXTURES } from "./helper.mjs";
import { join } from "node:path";

const { browser, page, errors } = await launch(undefined, "auth-teacher-demo.json");

page.on("response", (response) => {
  const url = response.url();
  if (url.includes("/api/lessons/")) {
    console.log("API", response.request().method(), response.status(), url.replace(BASE, ""));
  }
});

await page.goto(BASE + "/workspace");
await settle(page, 2500);

// 1. confirm + upload
await page.getByLabel(/this material is synthetic/i).check();
await settle(page, 200);
await page.setInputFiles('input[type="file"]', join(FIXTURES, "fractions-notes.txt"));
await page.getByText("fractions-notes.txt").first().waitFor({ timeout: 30000 });
await page.getByText(/complete/i).first().waitFor({ timeout: 30000 });
await settle(page, 400);
await shot(page, "22-source-complete-same-session");

// 2. review the extracted text
await page.getByRole("button", { name: /review the extracted text/i }).click();
await settle(page, 500);
await shot(page, "23-source-review-open");
await page.getByLabel(/the source covers the required skills/i).check();
await settle(page, 200);
await page.getByRole("button", { name: /confirm review/i }).click();
await settle(page, 900);
await shot(page, "24-source-reviewed");

// 3. objective + generate
const box = page.getByLabel(/what should students practice/i);
await box.fill("Introduce equivalent fractions with paper strips and fraction bars.");
await settle(page, 400);
await page.getByRole("button", { name: /create lesson/i }).click();
await settle(page, 1200);
await shot(page, "25-generating-early");

// wait for the stream to finish (variants or an outcome) up to 150 s
const deadline = Date.now() + 150000;
let outcome = "timeout";
while (Date.now() < deadline) {
  const generating = await page.getByText(/shaping the draft/i).isVisible().catch(() => false);
  if (!generating) {
    outcome = "settled";
    break;
  }
  await page.waitForTimeout(3000);
}
await settle(page, 1500);
await shot(page, "26-generation-outcome");
logState("phase3b-done", { url: page.url(), outcome });
await page.screenshot({ path: "shots/27-generation-fullpage.png", fullPage: true });
await done(browser);
console.log("pageerrors:", JSON.stringify(errors), "outcome:", outcome);
