import { BASE, launch, shot, settle, done, logState } from "./helper.mjs";

const { browser, page, errors } = await launch(undefined, "auth-teacher-demo.json");

page.on("response", (response) => {
  const url = response.url();
  if (url.includes("/api/lessons/sources") || url.includes("/api/lessons/generate")) {
    console.log("API", response.request().method(), response.status(), url.replace(BASE, ""));
  }
});

await page.goto(BASE + "/workspace");
await settle(page, 2500);

// open the extracted-text review panel
const reviewLink = page.getByRole("button", { name: /review the extracted text/i });
const reviewLinkA = page.getByText(/review the extracted text/i);
const target = (await reviewLink.count()) ? reviewLink : reviewLinkA;
await target.first().click();
await settle(page, 700);
await shot(page, "19-source-review-panel");

// look for required-skills + alignment acknowledgements
for (const label of [/required skill/i, /alignment/i, /confirm/i]) {
  const box = page.getByLabel(label).first();
  if (await box.isVisible().catch(() => false)) {
    await box.check().catch(() => {});
  }
}
await settle(page, 300);
await shot(page, "20-source-review-acked");

// submit the review
const confirmButton = page.getByRole("button", { name: /confirm|save review|looks right/i }).first();
if (await confirmButton.isVisible().catch(() => false)) {
  await confirmButton.click();
  await settle(page, 900);
}
await shot(page, "21-source-reviewed");

logState("phase3-part1", { url: page.url() });
await done(browser);
console.log("pageerrors:", JSON.stringify(errors));
