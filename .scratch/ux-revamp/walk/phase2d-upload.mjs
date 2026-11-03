import { BASE, launch, shot, settle, done, logState, FIXTURES } from "./helper.mjs";
import { join } from "node:path";

const { browser, page, errors } = await launch(undefined, "auth-teacher.json");

page.on("response", (response) => {
  const url = response.url();
  if (url.includes("/api/")) {
    console.log("API", response.request().method(), response.status(), url.replace(BASE, ""));
  }
});

await page.goto(BASE + "/workspace");
await settle(page, 2000);

// 1. confirm synthetic FIRST
const cb = page.getByLabel(/this material is synthetic/i);
await cb.check();
await settle(page, 300);

// 2. upload
await page.setInputFiles('input[type="file"]', join(FIXTURES, "fractions-notes.txt"));
await settle(page, 600);
await shot(page, "15-upload-immediate");
await settle(page, 3000);
await shot(page, "16-upload-settled");

logState("phase2d-done", { url: page.url() });
await done(browser);
console.log("pageerrors:", JSON.stringify(errors));
