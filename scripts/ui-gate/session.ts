/**
Signs a synthetic account in through the real /login form, including the
membership step, and returns the storage state for new browser contexts.
*/
import type { Browser } from "playwright-core";

export type Audience = "public" | "teacher" | "student";

/**
The synthetic teacher both seeds and both browser gates sign in as. The account
holds several memberships; every gate uses the demo-tenant membership, the one
classroom the database seed configures a curriculum target for. The seeds act
in it (scripts/student-probe/seed-services.ts) and `signedInState` selects it,
so the browser opens drafts its own session owns; any other teacher or tenant
would get PUBLICATION_FORBIDDEN.
*/
export const gateTeacher = {
  email: "amira.north@example.test",
  membership: "membership_amira_demo",
} as const;

const accounts: Record<Exclude<Audience, "public">, string> = {
  teacher: gateTeacher.email,
  student: "omar.demo@example.test",
};
const syntheticPassword = "synthetic-pass-1";

export type StorageState = Awaited<
  ReturnType<Awaited<ReturnType<Browser["newContext"]>>["storageState"]>
>;

export const signedInState = async (
  browser: Browser,
  baseUrl: string,
  audience: Exclude<Audience, "public">
): Promise<StorageState> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email address").fill(accounts[audience]);
  await page.getByLabel("Password", { exact: true }).fill(syntheticPassword);
  await page.locator("button[type='submit']").click();
  await page.waitForURL((url) => url.pathname !== "/login");
  if (page.url().includes("/login/membership")) {
    // The teacher signs in to the membership that owns the gate drafts
    // (scripts/student-probe/seed-services.ts); a single-membership account
    // never reaches this step.
    await page
      .locator(`input[type='radio'][value='${gateTeacher.membership}']`)
      .check();
    await page.locator("button[type='submit']").click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  }
  const state = await context.storageState();
  await context.close();
  return state;
};
