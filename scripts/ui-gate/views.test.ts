import { describe, expect, it } from "vitest";

import {
  allViews,
  assertUniqueKeys,
  findingKey,
  screenshotName,
  seededViews,
  selectViews,
  viewUrl,
} from "./views";

import type { SeedOutputs } from "./seed-output";
import type { ViewSpec } from "./views";

const seed = {
  learnerQuery: "assignment=a&variant=v",
  gate: {
    drafts: {
      readyForReview: { requestId: "req_review" },
      approvedForPublish: { requestId: "req_publish" },
      approvedForPublishedDesktop: { requestId: "req_pub_desktop" },
      approvedForPublishedPhone: { requestId: "req_pub_phone" },
      blockedValidation: { requestId: "req_validation" },
      blockedModeration: { requestId: "req_moderation" },
    },
  },
} as unknown as SeedOutputs;

const workspaceViews = allViews.filter((view) => view.path === "/workspace");

describe("view keys", () => {
  it("gives every view on one path its own budget key and screenshot", () => {
    const keys = workspaceViews.flatMap((view) =>
      (["desktop", "phone"] as const).map((viewport) => [
        findingKey(view, viewport),
        screenshotName(view, viewport),
      ])
    );
    expect({
      views: workspaceViews.length,
      keys: new Set(keys.map(([key]) => key)).size,
      screenshots: new Set(keys.map(([, file]) => file)).size,
    }).toStrictEqual({ views: 6, keys: 12, screenshots: 12 });
  });

  it("names budgets by key and viewport, never by path", () => {
    const review = seededViews.find((view) => view.key === "review");
    expect(review && findingKey(review, "phone")).toBe("review@phone");
    expect(review && screenshotName(review, "desktop")).toBe(
      "review-desktop.png"
    );
  });

  it("refuses two views that share a key", () => {
    const [first] = seededViews;
    const twin = { ...first, path: "/elsewhere" } as ViewSpec;
    expect(() => assertUniqueKeys(allViews)).not.toThrow();
    expect(() => assertUniqueKeys([...allViews, twin])).toThrow(
      /share the key "review"/u
    );
  });
});

describe(selectViews, () => {
  it("runs every view under a bare path", () => {
    const { views } = selectViews(allViews, {
      keys: [],
      paths: ["/workspace"],
    });
    expect(views.map((view) => view.key)).toStrictEqual([
      "workspace",
      "review",
      "publish",
      "published",
      "blocked-validation",
      "blocked-moderation",
    ]);
  });

  it("runs only the named views", () => {
    const { views } = selectViews(allViews, {
      keys: ["review", "publish"],
      paths: [],
    });
    expect(views.map((view) => view.key)).toStrictEqual(["review", "publish"]);
  });

  it("reports unknown selectors", () => {
    expect(
      selectViews(allViews, { keys: ["nope"], paths: ["/x"] }).unknown
    ).toStrictEqual(["nope", "/x"]);
  });
});

describe(viewUrl, () => {
  it("publishes a separate draft per viewport", () => {
    const published = seededViews.find((view) => view.key === "published");
    if (!published) {
      throw new Error("published view missing");
    }
    expect([
      viewUrl("", published, { seed, viewport: "desktop" }),
      viewUrl("", published, { seed, viewport: "phone" }),
    ]).toStrictEqual([
      "/workspace?review=req_pub_desktop",
      "/workspace?review=req_pub_phone",
    ]);
  });

  it("opens blocked drafts through the draft link", () => {
    const blocked = seededViews.find(
      (view) => view.key === "blocked-validation"
    );
    expect(
      blocked && viewUrl("http://x", blocked, { seed, viewport: "desktop" })
    ).toBe("http://x/workspace?draft=req_validation");
  });
});
