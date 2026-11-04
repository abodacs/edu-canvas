/**
The named view registry both browser gates share (`verify:ui` and
`census:capture`). A view is a stable key plus how to reach one screen state:
a path, the seeded referent its query names, the real clicks that move the page
into the state, and the selector that proves it got there. Keys, never paths,
identify budgets and screenshots, so five `/workspace` states never collide.

A view that does not reach its `ready` selector fails; no gate measures an
error screen in place of the state it names.
*/
import type { SeedOutputs } from "./seed-output";
import type { Audience } from "./session";
import type { Page } from "playwright-core";

export type ViewportName = "desktop" | "phone";

export interface ViewContext {
  readonly seed: SeedOutputs;
  readonly viewport: ViewportName;
}

export interface ViewSpec {
  /** Stable budget key, e.g. "review" or "blocked-validation". Never a path. */
  readonly key: string;
  /** Route path without the query; `verify:ui /workspace` runs every view under it. */
  readonly path: string;
  readonly audience: Audience;
  /** The approved mock this view is redesigned against. */
  readonly mock?: string;
  /** The query string, built from the seeded referents. */
  readonly query?: (context: ViewContext) => string;
  /** Wait for this selector before screenshot and measurement. Absent → the view fails. */
  readonly ready: string;
  /** Real interactions needed to reach the state. No fixed sleeps. */
  readonly prepare?: (page: Page) => Promise<void>;
  /** Optional extra state assertions; `ready` is the minimum. */
  readonly assert?: (page: Page) => Promise<void>;
}

/**
Bounded wait for a view's state after the page loads. Generous enough that a
parallel browser gate or a seeded run under load settles instead of failing a
real state; the wait ends as soon as the selector appears.
*/
export const readyTimeoutMs = 15_000;

const continueToPublish = async (page: Page): Promise<void> => {
  await page.locator(".review-studio__toolbar").waitFor({
    timeout: readyTimeoutMs,
  });
  const button = page.getByRole("button", { name: "Continue to publish" });
  await button.waitFor({ timeout: readyTimeoutMs });
  if (!(await button.isEnabled())) {
    throw new Error(
      "Continue to publish is disabled: the fixture is not fully approved."
    );
  }
  await button.click();
};

const publishAndAssign = async (page: Page): Promise<void> => {
  await continueToPublish(page);
  await page.locator("#confirm-heading").waitFor({ timeout: readyTimeoutMs });
  // The learner the probe seed assigns. The review also lists the database
  // seed's `identity_demo_student` under the same display name, and that
  // identity has no student membership, so selecting by label is ambiguous and
  // publishing to it fails; the value names the assignable learner.
  await page
    .getByLabel("Assign to learner")
    .selectOption({ value: "learner_omar" });
  const publishResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/publications") &&
      response.request().method() === "POST",
    { timeout: readyTimeoutMs }
  );
  await page.getByRole("button", { name: "Publish and assign" }).click();
  const response = await publishResponse;
  if (!response.ok()) {
    throw new Error(`Publish returned ${response.status()}.`);
  }
};

/**
The redesigned routes at their default state. Keys replace the former
path-only budget keys (`/@desktop` became `home@desktop`).
*/
/** The sign-in form, never the membership step or an error screen. */
export const loginFormReady = "main:has(#login-heading) form.auth-form";
/** The loaded results surface of the dashboard. */
export const dashboardReady = "main .progress-asof";
/** The learner's matching board, never the status line around it. */
export const learnBoardReady = "main .learn-board";

export const routeViews: readonly ViewSpec[] = [
  {
    key: "home",
    path: "/",
    audience: "public",
    mock: "0-landing",
    ready: "#page-title.hero-headline",
  },
  {
    key: "login",
    path: "/login",
    audience: "public",
    mock: "5-sign-in",
    ready: loginFormReady,
  },
  {
    key: "sign-up",
    path: "/sign-up",
    audience: "public",
    mock: "5-sign-in",
    ready: "main:has(#sign-up-heading) form.auth-form",
  },
  {
    key: "workspace",
    path: "/workspace",
    audience: "teacher",
    mock: "1-studio",
    ready: "#lesson-prompt",
  },
  {
    key: "dashboard",
    path: "/dashboard",
    audience: "teacher",
    mock: "4-dashboard",
    // The results header renders only once the progress read succeeded;
    // loading, permission, and error surfaces never show it.
    ready: dashboardReady,
  },
  {
    key: "learn",
    path: "/learn",
    audience: "student",
    mock: "7-learn",
    query: ({ seed }) => seed.learnerQuery,
    ready: learnBoardReady,
  },
];

/** The seeded `/workspace` states (#197 §7.4). */
export const seededViews: readonly ViewSpec[] = [
  {
    key: "review",
    path: "/workspace",
    audience: "teacher",
    mock: "2-review",
    query: ({ seed }) => `review=${seed.gate.drafts.readyForReview.requestId}`,
    ready: ".review-studio__toolbar",
  },
  {
    key: "publish",
    path: "/workspace",
    audience: "teacher",
    mock: "3-publish",
    query: ({ seed }) =>
      `review=${seed.gate.drafts.approvedForPublish.requestId}`,
    prepare: continueToPublish,
    ready: "#confirm-heading",
  },
  {
    key: "published",
    path: "/workspace",
    audience: "teacher",
    mock: "3-publish",
    // Publishing mutates its draft, so each viewport publishes its own.
    query: ({ seed, viewport }) =>
      `review=${
        viewport === "phone"
          ? seed.gate.drafts.approvedForPublishedPhone.requestId
          : seed.gate.drafts.approvedForPublishedDesktop.requestId
      }`,
    prepare: publishAndAssign,
    ready: "#published-heading",
  },
  {
    key: "blocked-validation",
    path: "/workspace",
    audience: "teacher",
    mock: "8-state-matrix",
    query: ({ seed }) =>
      `draft=${seed.gate.drafts.blockedValidation.requestId}`,
    ready: ".validation-diagnostics",
  },
  {
    key: "blocked-moderation",
    path: "/workspace",
    audience: "teacher",
    mock: "8-state-matrix",
    query: ({ seed }) =>
      `draft=${seed.gate.drafts.blockedModeration.requestId}`,
    ready: ".moderation-recovery",
  },
];

export const viewUrl = (
  baseUrl: string,
  view: ViewSpec,
  context: ViewContext
): string => {
  const query = view.query?.(context);
  return `${baseUrl}${view.path}${query ? `?${query}` : ""}`;
};

/** Budget and finding key for one view at one viewport. */
export const findingKey = (view: ViewSpec, viewport: ViewportName): string =>
  `${view.key}@${viewport}`;

/** Screenshot file name for one view at one viewport. */
export const screenshotName = (
  view: ViewSpec,
  viewport: ViewportName
): string => `${view.key}-${viewport}.png`;

/**
Whether the page is still on the path it was opened at. A redirect (for
example a lost session sending /dashboard to /login) is a wrong state even when
the new page renders cleanly.
*/
export const assertOnPath = (page: Page, expectedPath: string): void => {
  const actual = new URL(page.url()).pathname;
  if (actual !== expectedPath) {
    throw new Error(`redirected from ${expectedPath} to ${actual}`);
  }
};

/**
Reach a view's state on an already-loaded page: run its clicks, wait for its
selector, confirm no redirect happened, run its assertions. Throws with the
view key on any miss, so the caller records a fatal state finding.
*/
export const reachState = async (page: Page, view: ViewSpec): Promise<void> => {
  try {
    await view.prepare?.(page);
    await page.locator(view.ready).first().waitFor({
      state: "visible",
      timeout: readyTimeoutMs,
    });
    assertOnPath(page, view.path);
    await view.assert?.(page);
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : "";
    throw new Error(
      `view "${view.key}" did not reach ${view.ready}: ${reason ?? ""}`,
      { cause: error }
    );
  }
};

/** Duplicate keys would overwrite one budget row and one screenshot. */
export const assertUniqueKeys = (views: readonly ViewSpec[]): void => {
  const seen = new Set<string>();
  for (const view of views) {
    if (seen.has(view.key)) {
      throw new Error(`Two views share the key "${view.key}".`);
    }
    seen.add(view.key);
  }
};

/** Every view `verify:ui` runs by default, in run order. */
export const allViews: readonly ViewSpec[] = [...routeViews, ...seededViews];

/**
Select views from the command line: `--view <key>` (repeatable) picks by key,
a bare path picks every view under it, and no selector picks all. Unknown
selectors are returned so the caller can fail with the known list.
*/
export const selectViews = (
  views: readonly ViewSpec[],
  selectors: {
    readonly keys: readonly string[];
    readonly paths: readonly string[];
  }
): { readonly views: ViewSpec[]; readonly unknown: string[] } => {
  const unknown = [
    ...selectors.keys.filter((key) => !views.some((view) => view.key === key)),
    ...selectors.paths.filter(
      (path) => !views.some((view) => view.path === path)
    ),
  ];
  if (selectors.keys.length === 0 && selectors.paths.length === 0) {
    return { views: [...views], unknown };
  }
  return {
    views: views.filter(
      (view) =>
        selectors.keys.includes(view.key) || selectors.paths.includes(view.path)
    ),
    unknown,
  };
};
