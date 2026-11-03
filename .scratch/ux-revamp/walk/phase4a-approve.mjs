import { BASE, launch, shot, settle, done, logState } from "./helper.mjs";

const { browser, page, errors } = await launch(undefined, "auth-teacher-demo.json");

page.on("response", (response) => {
  const url = response.url();
  if (url.includes("/api/")) {
    console.log("API", response.request().method(), response.status(), url.replace(BASE, ""));
  }
});

await page.goto(BASE + "/workspace");
await settle(page, 2500);

// W4 probe: do the variant cards survive a reload?
const variantsAfterReload = await page.getByText(/choose the version that fits/i).isVisible().catch(() => false);
logState("w4-variants-after-reload", { variantsAfterReload });
await shot(page, "28-after-reload-top");

// regenerate in this session
await page.getByRole("button", { name: /create lesson/i }).click();
const deadline = Date.now() + 150000;
while (Date.now() < deadline) {
  const generating = await page.getByText(/shaping the draft/i).isVisible().catch(() => false);
  if (!generating) break;
  await page.waitForTimeout(3000);
}
await settle(page, 1000);
await shot(page, "29-regenerated");

// click the first "Trust this draft"
const trust = page.getByRole("link", { name: /trust this draft/i }).first();
const trustButton = page.getByRole("button", { name: /trust this draft/i }).first();
const control = (await trust.count()) ? trust : trustButton;
await control.click();
await settle(page, 1200);
await shot(page, "30-after-trust");

logState("phase4a-done", { url: page.url() });
await done(browser);
console.log("pageerrors:", JSON.stringify(errors));
