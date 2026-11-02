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

await step("approve-screens", async () => {
  const total = await page.getByRole("button", { name: /review screen/i }).count();
  console.log("review-screen buttons:", total);
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
      await shot(page, `60-approved-screen-${index + 1}`);
    } else {
      console.log(`screen ${index + 1} already approved`);
    }
    const back = page.getByRole("button", { name: /back to the gallery/i }).first();
    if (await back.isVisible().catch(() => false)) {
      await back.click({ timeout: 20000 });
      await settle(page, 800);
    }
  }
});

await step("approve-reverse", async () => {
  const reverse = page.getByRole("button", { name: /approve the reverse path/i }).first();
  if (await reverse.isVisible().catch(() => false)) {
    await reverse.click({ timeout: 20000 });
    await settle(page, 1400);
  } else {
    console.log("reverse path already approved");
  }
});
await shot(page, "61-gallery-approved");

await step("continue-to-publish", async () => {
  const cont = page.getByRole("button", { name: /continue to publish/i }).first();
  await cont.click({ timeout: 20000 });
  await settle(page, 900);
});
await shot(page, "62-publish-picker");

await step("publish", async () => {
  const publishButton = page
    .getByRole("button", { name: /publish this exact revision/i })
    .first();
  await publishButton.click({ timeout: 20000 });
  await settle(page, 2500);
});
await shot(page, "63-published");
await page.screenshot({ path: "shots/64-published-fullpage.png", fullPage: true });
logState("phase7-done", { url: page.url() });
await done(browser);
console.log("pageerrors:", JSON.stringify(errors));
