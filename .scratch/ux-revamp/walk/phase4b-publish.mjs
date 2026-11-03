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
  if (url.includes("/api/publications") || url.includes("/api/lessons/generate")) {
    console.log("API", response.request().method(), response.status(), url.replace(BASE, ""));
  }
});

await page.goto(BASE + "/workspace");
await settle(page, 2500);

// regenerate (draft view does not survive reload — W4)
await step("regenerate", async () => {
  await page.getByRole("button", { name: /create lesson/i }).click();
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    const generating = await page.getByText(/shaping the draft/i).isVisible().catch(() => false);
    if (!generating) break;
    await page.waitForTimeout(3000);
  }
  await settle(page, 800);
});
await shot(page, "31-variants-again");

// open review studio
await step("open-review", async () => {
  await page.getByRole("button", { name: /review and publish this pack/i }).click();
  await settle(page, 1200);
});
await shot(page, "32-review-studio");

// approve each screen
await step("approve-screens", async () => {
  for (let index = 0; index < 4; index += 1) {
    const open = page.getByRole("button", { name: /review screen/i }).first();
    if (!(await open.isVisible().catch(() => false))) break;
    await open.click();
    await settle(page, 800);
    await shot(page, `33-variant-editor-${index + 1}`);
    // acknowledge any warning checkboxes
    const warnings = page.getByLabel(/^acknowledge warning/i);
    const count = await warnings.count();
    for (let w = 0; w < count; w += 1) {
      await warnings.nth(w).check().catch(() => {});
    }
    if (count > 0) await shot(page, `33b-warnings-acked-${index + 1}`);
    await page.getByRole("button", { name: /approve this screen/i }).click();
    await settle(page, 1200);
    await shot(page, `34-screen-approved-${index + 1}`);
    // go back to the gallery if a back control exists
    const back = page.getByRole("button", { name: /back|gallery|all screens/i }).first();
    if (await back.isVisible().catch(() => false)) {
      await back.click();
      await settle(page, 700);
    }
  }
});

// approve the reverse path (may live on the gallery)
await step("approve-reverse", async () => {
  const reverse = page.getByRole("button", { name: /approve the reverse path/i }).first();
  if (await reverse.isVisible().catch(() => false)) {
    await reverse.click();
    await settle(page, 1200);
  }
});
await shot(page, "35-all-approved");

// publish
await step("publish", async () => {
  const publishButton = page.getByRole("button", { name: /publish this exact revision/i }).first();
  if (await publishButton.isVisible().catch(() => false)) {
    await shot(page, "36-publish-picker");
    await publishButton.click();
    await settle(page, 2000);
  }
});
await shot(page, "37-published");
logState("phase4b-done", { url: page.url() });
await page.screenshot({ path: "shots/38-published-fullpage.png", fullPage: true });
await done(browser);
console.log("pageerrors:", JSON.stringify(errors));
