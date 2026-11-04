import { createElement } from "react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { AppShell } from "./app-shell";
import type { AppShellProps } from "./app-shell";
import { initialsFor, teacherNavigation } from "./app-shell-navigation";
import { SkipLink } from "./skip-link";
import { SyntheticDataMarker } from "./synthetic-data-marker";

const renderAt = (path: string, element: ReactElement): string => {
  const rootRoute = createRootRoute();
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/workspace" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/dashboard" }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return renderToStaticMarkup(
    createElement(
      RouterContextProvider,
      // children arrive as the third argument; the cast only satisfies the
      // provider's props type, which lists them as required.
      { router } as ComponentProps<typeof RouterContextProvider>,
      element
    )
  );
};

// children arrive as the third argument, as JSX would pass them; the cast only
// satisfies the props type, which lists them as required.
const shell = (
  props: Omit<AppShellProps, "children">,
  child: ReactNode
): ReactElement => createElement(AppShell, props as AppShellProps, child);

const countOf = (markup: string, pattern: RegExp): number =>
  markup.match(pattern)?.length ?? 0;

const signedIn = (): string =>
  renderAt(
    "/workspace?review=draft_1",
    shell(
      {
        nav: teacherNavigation,
        identity: {
          displayName: "Amira North",
          context: "North School · Teacher",
          initials: initialsFor("Amira North"),
        },
        onSignOut: () => {},
        crumbs: [{ label: "Studio", to: "/workspace" }, { label: "Review" }],
      },
      createElement("h1", null, "Page")
    )
  );

describe(AppShell, () => {
  it("owns exactly one main landmark, the skip-link target", () => {
    const markup = signedIn();
    expect(countOf(markup, /<main\b/gu)).toBe(1);
    expect(markup).toMatch(/<main id="main"/u);
  });

  it("labels the primary nav and marks only the current page", () => {
    const markup = signedIn();
    expect(countOf(markup, /<nav[^>]*aria-label="Primary"/gu)).toBe(1);
    expect(markup).toMatch(
      /<a[^>]*aria-current="page"[^>]*>Lesson studio<\/a>/u
    );
    expect(markup).not.toMatch(
      /<a[^>]*aria-current="page"[^>]*>Lesson results<\/a>/u
    );
  });

  it("ends the breadcrumb on the current page, as text", () => {
    const markup = signedIn();
    expect(markup).toMatch(/<nav[^>]*aria-label="Breadcrumb"/u);
    expect(markup).toContain('<span aria-current="page">Review</span>');
    expect(countOf(markup, /aria-current="page"/gu)).toBe(2);
  });

  it("shows the name as text and hides the avatar", () => {
    const markup = signedIn();
    expect(markup).toContain(
      '<span class="who__avatar" aria-hidden="true">AN</span>'
    );
    expect(markup).toContain('<span class="who__name">Amira North</span>');
    expect(markup).toContain("Sign out");
  });

  it("carries the synthetic-data marker once", () => {
    expect(countOf(signedIn(), /data-synthetic-marker=""/gu)).toBe(1);
  });

  it("renders no nav, identity or sign-out when signed out", () => {
    const markup = renderAt(
      "/workspace",
      shell({}, createElement("p", null, "Signed out"))
    );
    expect(markup).not.toContain("<nav");
    expect(markup).not.toContain("who__");
    expect(markup).not.toContain("Sign out");
    expect(countOf(markup, /<main id="main"/gu)).toBe(1);
    expect(markup).toContain("Scholé");
  });
});

describe(SkipLink, () => {
  it("targets the main landmark", () => {
    expect(renderToStaticMarkup(createElement(SkipLink))).toBe(
      '<a class="skip-link" href="#main">Skip to content</a>'
    );
  });
});

describe(SyntheticDataMarker, () => {
  it("keeps the caller's element and copy", () => {
    const markup = renderToStaticMarkup(
      createElement(
        SyntheticDataMarker,
        { as: "figcaption", variant: "caption" },
        "Illustration. Synthetic data only."
      )
    );
    expect(markup).toMatch(/^<figcaption/u);
    expect(markup).toContain('data-variant="caption"');
    expect(markup).toContain("Illustration. Synthetic data only.");
  });
});

describe(initialsFor, () => {
  it("takes up to two initials", () => {
    expect(initialsFor("amira  north school")).toBe("AN");
    expect(initialsFor("Rami")).toBe("R");
  });
});
