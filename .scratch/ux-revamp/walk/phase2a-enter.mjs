import { BASE, launch, shot, settle, done, logState } from "./helper.mjs";

const { browser, page, errors } = await launch();

await page.goto(BASE + "/login");
await settle(page);
await page.getByLabel(/email/i).fill("amira.north@example.test");
await page.getByLabel(/password/i).fill("synthetic-pass-1");
await page.getByRole("button", { name: /sign in/i }).click();
await settle(page, 1800);

// membership picker -> Grade 4A
await page.getByRole("radio", { name: /Grade 4A/ }).check();
await settle(page, 300);
await page.getByRole("button", { name: /continue/i }).click();
await settle(page, 900);
await shot(page, "07-workspace-arriving");
await settle(page, 2500);
await shot(page, "08-workspace-loaded");

logState("phase2a-done", { url: page.url() });
await done(browser);
console.log("pageerrors:", JSON.stringify(errors));
