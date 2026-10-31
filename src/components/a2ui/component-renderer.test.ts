import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { A2UI_CATALOG_ID, A2UI_CATALOG_VERSION } from "@/shared/a2ui-contract";

import { A2UIComponentRenderer } from "./component-renderer";
import type { A2UIRenderSurface } from "./renderer";

describe("semantic A2UI lesson surface", () => {
  it("stops cyclic references and omits missing children without hiding siblings", () => {
    const surface: A2UIRenderSurface = {
      catalogId: A2UI_CATALOG_ID,
      catalogVersion: A2UI_CATALOG_VERSION,
      components: {
        root: {
          id: "root",
          component: "Row",
          children: ["card", "missing", "body"],
        },
        card: { id: "card", component: "Card", child: "root" },
        body: { id: "body", component: "Text", text: "Still visible" },
      },
    };
    const markup = renderToStaticMarkup(
      createElement(A2UIComponentRenderer, {
        surface,
        surfaceId: "cycle-preview",
        componentId: "root",
        onAction: vi.fn<() => void>(),
      })
    );

    expect(markup).toBe(
      '<div class="a2ui-row"><section class="a2ui-card a2ui-card--surface"></section><p class="a2ui-text">Still visible</p></div>'
    );
  });

  it("renders child components without React missing-key warnings", () => {
    const surface: A2UIRenderSurface = {
      catalogId: A2UI_CATALOG_ID,
      catalogVersion: A2UI_CATALOG_VERSION,
      components: {
        root: {
          id: "root",
          component: "Column",
          children: ["heading", "body"],
        },
        heading: {
          id: "heading",
          component: "Text",
          text: "Equivalent fractions",
          variant: "heading",
        },
        body: {
          id: "body",
          component: "Text",
          text: "Match each fraction.",
          variant: "body",
        },
      },
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // Silence the expected console warning during this render.
    });

    try {
      const markup = renderToStaticMarkup(
        createElement(A2UIComponentRenderer, {
          surface,
          componentId: "root",
          surfaceId: "preview-1",
          onAction: () => {
            // The renderer is under test; no action handling is needed.
          },
        })
      );

      expect(markup).toContain("Equivalent fractions");
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
