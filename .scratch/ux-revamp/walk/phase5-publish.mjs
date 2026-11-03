import { BASE, launch, shot, settle, done, logState } from "./helper.mjs";

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

await page.goto(BASE + "/workspace");
await settle(page, 2500);

// generate until the gate passes (max 4 attempts)
let passed = false;
for (let attempt = 1; attempt <= 4 && !passed; attempt += 1) {
  await step(`generate-${attempt}`, async () => {
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
  if (!passed) await shot(page, `40-attempt-${attempt}-blocked`);
}
if (!passed) {
  console.log("NO PASS IN 4 ATTEMPTS");
  await done(browser);
  process.exit(0);
}

await shot(page, "41-variants-pass");
await step("open-review", async () => {
  await page.getByRole("button", { name: /review and publish this pack/i }).click();
  await settle(page, 1500);
});
await shot(page, "42-review-studio");

await step("approve-screens", async () => {
  for (let index = 0; index < 4; index += 1) {
    const open = page.getByRole("button", { name: /review screen/i }).first();
    if (!(await open.isVisible().catch(() => false))) break;
    await open.click();
    await settle(page, 900);
    await shot(page, `43-variant-editor-${index + 1}`);
    const warnings = page.getByLabel(/^acknowledge warning/i);
    const count = await warnings.count();
    for (let w = 0; w < count; w += 1) await warnings.nth(w).check().catch(() => {});
    await page.getByRole("button", { name: /approve this screen/i }).click();
    await settle(page, 1400);
    await shot(page, `44-screen-approved-${index + 1}`);
    const back = page.getByRole("button", { name: /back|gallery|all screens/i }).first();
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
await shot(page, "45-all-approved");

await step("publish", async () => {
  const publishButton = page
    .getByRole("button", { name: /publish this exact revision/i })
    .first();
  if (await publishButton.isVisible().catch(() => false)) {
    await shot(page, "46-publish-picker");
    await publishButton.click();
    await settle(page, 2500);
  }
});
await shot(page, "47-published");
await page.screenshot({ path: "shots/48-published-fullpage.png", fullPage: true });
logState("phase5-done", { url: page.url() });
await done(browser);
console.log("pageerrors:", JSON.stringify(errors));
