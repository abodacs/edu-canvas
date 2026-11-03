import { BASE, launch, shot, settle, done, logState, FIXTURES } from "./helper.mjs";
import { join } from "node:path";

const { browser, page, errors } = await launch(undefined, "auth-teacher-demo.json");

page.on("response", (response) => {
  if (response.url().includes("/api/lessons/sources")) {
    console.log("API", response.request().method(), response.status(), response.url().replace(BASE, ""));
  }
});

await page.goto(BASE + "/workspace");
await settle(page, 2500);

// confirm synthetic first, then upload TXT
const cb = page.getByLabel(/this material is synthetic/i);
await cb.check();
await settle(page, 300);

await page.setInputFiles('input[type="file"]', join(FIXTURES, "fractions-notes.txt"));
await settle(page, 350);
await shot(page, "17-source-extracting");
await settle(page, 3000);
await shot(page, "18-source-complete");

logState("phase2e-done", { url: page.url() });
await done(browser);
console.log("pageerrors:", JSON.stringify(errors));
