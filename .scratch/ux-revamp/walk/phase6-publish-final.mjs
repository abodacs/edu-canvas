import { BASE, launch, shot, settle, done, logState } from "./helper.mjs";

const REVIEW_URL =
  BASE + "/workspace?review=01a19d8c-c77a-7931-9e52-7f9b1b170d1f";

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
  if (url.includes("/api/publications")) {
    console.log("API", response.request().method(), response.status(), url.replace(BASE, ""));
  }
});

await page.goto(REVIEW_URL);
await settle(page, 2500);
await shot(page, "50-review-restored");

await step("approve-screens", async () => {
  for (let index = 0; index < 4; index += 1) {
    const open = page.getByRole("button", { name: /review screen/i }).first();
    if (!(await open.isVisible().catch(() => false))) break;
    await open.click();
    await settle(page, 900);
    const warnings = page.getByLabel(/^acknowledge warning/i);
    const count = await warnings.count();
    for (let w = 0; w < count; w += 1) await warnings.nth(w).check().catch(() => {});
    await page.getByRole("button", { name: /approve this screen/i }).click();
    await settle(page, 1400);
    await shot(page, `51-approved-${index + 1}`);
    const back = page.getByRole("button", { name: /back to the gallery/i }).first();
    if (await back.isVisible().catch(() => false)) {
      await back.click();
      await settle(page, 800);
    }
  }
});

await step("approve-reverse", async () => {
  const reverse = page.getByRole("button", { name: /approve the reverse path/i }).first();
  if (await reverse.isVisible().catch(() => false)) {
    await reverse.click();
    await settle(page, 1400);
  }
});
await shot(page, "52-gallery-approved");

await step("continue-to-publish", async () => {
  const cont = page.getByRole("button", { name: /continue to publish/i }).first();
  if (await cont.isVisible().catch(() => false)) {
    await cont.click();
    await settle(page, 900);
  }
});
await shot(page, "53-publish-picker");

await step("publish", async () => {
  const publishButton = page
    .getByRole("button", { name: /publish this exact revision/i })
    .first();
  if (await publishButton.isVisible().catch(() => false)) {
    await publishButton.click();
    await settle(page, 2500);
  }
});
await shot(page, "54-published");
await page.screenshot({ path: "shots/55-published-fullpage.png", fullPage: true });
logState("phase6-done", { url: page.url() });
await done(browser);
console.log("pageerrors:", JSON.stringify(errors));
