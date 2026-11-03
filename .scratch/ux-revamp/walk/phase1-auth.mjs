import { BASE, launch, shot, settle, done, logState } from "./helper.mjs";

const { browser, page, errors } = await launch();

// 1. Landing (logged out)
await page.goto(BASE + "/");
await settle(page, 1200);
await shot(page, "01-landing-logged-out");

// 2. Login empty
await page.goto(BASE + "/login");
await settle(page);
await shot(page, "02-login-empty");

// 3. Wrong password
await page.getByLabel(/email/i).fill("amira.north@example.test");
await page.getByLabel(/password/i).fill("wrong-pass-9");
await page.getByRole("button", { name: /sign in/i }).click();
await settle(page, 1500);
await shot(page, "03-login-wrong-password");

// 4. Sign-up empty + validation
await page.goto(BASE + "/sign-up");
await settle(page);
await shot(page, "04-signup-empty");
await page.getByRole("button", { name: /sign up|create/i }).click();
await settle(page, 900);
await shot(page, "05-signup-validation");

// 5. Correct sign-in -> membership picker
await page.goto(BASE + "/login");
await settle(page);
await page.getByLabel(/email/i).fill("amira.north@example.test");
await page.getByLabel(/password/i).fill("synthetic-pass-1");
await page.getByRole("button", { name: /sign in/i }).click();
await settle(page, 1800);
await shot(page, "06-after-signin");

// try to capture the submitting state quickly on membership submit
const urlNow = page.url();
logState("post-signin-url", { url: urlNow });

await done(browser);
console.log("pageerrors:", JSON.stringify(errors));
