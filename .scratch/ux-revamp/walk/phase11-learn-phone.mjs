import { BASE, launch, shot, settle, done, logState } from "./helper.mjs";

// student session
const student = await launch({ width: 1440, height: 900 });
const step = async (name, fn) => {
  try {
    await fn();
  } catch (error) {
    logState(name, { error: String(error).slice(0, 240) });
    console.log("STEP FAIL", name, String(error).slice(0, 240));
  }
};

await step("learn-signed-out", async () => {
  await student.page.goto(BASE + "/learn");
  await settle(student.page, 1800);
});
await shot(student.page, "100-learn-signed-out");

await step("student-signin", async () => {
  await student.page.goto(BASE + "/login");
  await settle(student.page);
  await student.page.getByLabel(/email/i).fill("omar.demo@example.test");
  await student.page.getByLabel(/password/i).fill("synthetic-pass-1");
  await student.page.getByRole("button", { name: /sign in/i }).click();
  await settle(student.page, 1800);
});
await shot(student.page, "101-student-after-signin");
await logState("student-url", { url: student.page.url() });

await step("learn-student", async () => {
  await student.page.goto(BASE + "/learn");
  await settle(student.page, 2000);
});
await shot(student.page, "102-learn-student");
await student.page.screenshot({ path: "shots/103-learn-fullpage.png", fullPage: true });

// phone captures
const phone = await launch({ width: 390, height: 844 });
await step("phone-landing", async () => {
  await phone.page.goto(BASE + "/");
  await settle(phone.page, 1200);
});
await shot(phone.page, "110-phone-landing");
await step("phone-workspace", async () => {
  // reuse teacher demo session
  const fs = await import("node:fs");
  const state = JSON.parse(fs.readFileSync("auth-teacher-demo.json", "utf8"));
  await phone.context.addCookies(
    state.cookies.map((cookie) => ({
      ...cookie,
      expires: cookie.expires > 0 ? cookie.expires : undefined,
    })),
  );
  await phone.page.goto(BASE + "/workspace");
  await settle(phone.page, 2200);
});
await shot(phone.page, "111-phone-workspace");
await phone.page.screenshot({ path: "shots/112-phone-workspace-full.png", fullPage: true });
await step("phone-learn", async () => {
  await phone.page.goto(BASE + "/learn");
  await settle(phone.page, 1800);
});
await shot(phone.page, "113-phone-learn");

await done(student.browser);
await done(phone.browser);
console.log("pageerrors: student+phone done");
