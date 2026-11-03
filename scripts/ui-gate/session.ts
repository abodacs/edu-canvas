/**
Signs a synthetic account in through the real /login form, including the
membership step, and returns the storage state for new browser contexts.
*/
import type { Browser } from "playwright-core";

export type Audience = "public" | "teacher" | "student";

const accounts: Record<Exclude<Audience, "public">, string> = {
  teacher: "amira.north@example.test",
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
    await page.locator("input[type='radio']").first().check();
    await page.locator("button[type='submit']").click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  }
  const state = await context.storageState();
  await context.close();
  return state;
};

/** The English learner link printed by scripts/student-probe/seed.ts. */
export const learnerQuery = (seedOutput: string | undefined): string => {
  const links = JSON.parse(
    seedOutput?.trim().split("\n").at(-1) ?? "{}"
  ) as Record<string, { assignment: string; variant: string } | undefined>;
  const learner = links.en;
  return learner
    ? `assignment=${learner.assignment}&variant=${learner.variant}`
    : "";
};
