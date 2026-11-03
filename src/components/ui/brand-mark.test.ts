import { createElement } from "react";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { BrandMark } from "./brand-mark";

const brandTagline = "teaching, returned to its origin";

const render = (withTagline: boolean): string => {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return renderToStaticMarkup(
    createElement(
      RouterContextProvider,
      // children arrive as the third argument; the cast only satisfies the
      // provider's props type, which lists them as required.
      { router } as ComponentProps<typeof RouterContextProvider>,
      createElement(BrandMark, { withTagline })
    )
  );
};

describe(BrandMark, () => {
  it("links home and names the link by its visible text", () => {
    const markup = render(false);
    expect(markup).toContain('href="/"');
    expect(markup).toContain("Scholé");
    expect(markup).not.toContain("aria-label");
  });

  it("hides the glyph from assistive technology", () => {
    expect(render(false)).toMatch(/class="brand-mark" aria-hidden="true"/u);
  });

  it("shows the tagline only when asked", () => {
    expect(render(true)).toContain(brandTagline);
    expect(render(false)).not.toContain(brandTagline);
  });
});
