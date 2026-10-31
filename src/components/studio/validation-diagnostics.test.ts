import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ValidationDiagnostics } from "./validation-diagnostics";
import type { PublicDiagnosticsRollup } from "@/shared/generation-contract";

const rollup: PublicDiagnosticsRollup = {
  verdict: "hard_block",
  recovery: "retry",
  affectedScreens: ["variant-1", "variant-2"],
  screens: [
    {
      variantId: "variant-1",
      verdict: "hard_block",
      findings: [
        {
          severity: "error",
          code: "TARGET_REUSED",
          message: "A target cannot be related to more than one source item.",
          field: "relationships",
          variantId: "variant-1",
          recovery: "edit",
        },
      ],
    },
    {
      variantId: "variant-2",
      verdict: "hard_block",
      findings: [
        {
          severity: "error",
          code: "UNSAFE_PAYLOAD",
          message: "The compiled screen contains an executable payload.",
          field: "instructions",
          variantId: "variant-2",
          recovery: "replace",
        },
      ],
    },
  ],
  flow: [
    {
      severity: "error",
      code: "ARTIFACT_GATE_UNAVAILABLE",
      message:
        "The safety gate could not complete safely. Try this draft again.",
      field: "draft",
      recovery: "retry",
    },
  ],
};

const render = (direction: "ltr" | "rtl" = "ltr", value = rollup): string => {
  return renderToStaticMarkup(
    createElement(ValidationDiagnostics, {
      rollup: value,
      requestId: "draft_req_panel",
      direction,
      language: direction === "rtl" ? "ar" : "en",
      onRecover: vi.fn<() => void>(),
    })
  );
};

const actionTags = (markup: string): string[] =>
  markup.match(/<button[^>]*>/gu) ?? [];

describe("validation diagnostics panel", () => {
  it("names the affected screens and the flow-level finding", () => {
    const markup = render();

    expect({
      section: markup.includes('id="validation-diagnostics"'),
      named: markup.includes(
        'aria-labelledby="validation-diagnostics-heading"'
      ),
      screen1: markup.includes("Screen 1"),
      screen2: markup.includes("Screen 2"),
      flow: markup.includes("Whole lesson"),
      field: markup.includes("Relationships"),
      message: markup.includes(
        "A target cannot be related to more than one source item."
      ),
      codeHidden: !markup.includes("TARGET_REUSED"),
    }).toStrictEqual({
      section: true,
      named: true,
      screen1: true,
      screen2: true,
      flow: true,
      field: true,
      message: true,
      codeHidden: true,
    });
  });

  it("offers exactly one native action per finding from the closed set", () => {
    const markup = render();
    const actions = actionTags(markup);

    expect(actions).toHaveLength(3);
    expect(
      actions.every(
        (action) =>
          action.includes('type="button"') && !action.includes("tabindex")
      )
    ).toBeTruthy();
    expect(
      ["Edit this screen", "Replace this screen", "Try again"].filter(
        (label) => !markup.includes(label)
      )
    ).toStrictEqual([]);
  });

  it("uses one empty polite live region", () => {
    const markup = render();
    const announcements =
      markup.match(/<output[^>]*aria-live="polite"[^>]*>/gu) ?? [];

    expect(announcements).toHaveLength(1);
    expect(markup).toMatch(
      /<output class="sr-only" id="validation-diagnostics-announcement" aria-live="polite" aria-atomic="true"><\/output>/u
    );
  });

  it("focuses the heading without a modal trap", () => {
    const markup = render();

    expect(markup).toMatch(
      /<h3 id="validation-diagnostics-heading" tabindex="-1">/u
    );
    expect(markup).not.toMatch(/tabindex="[1-9]/u);
    expect(markup).not.toContain('role="dialog"');
    expect(markup).not.toContain("aria-modal");
  });

  it("announces the same visible summary and varies it by screen count", () => {
    const twoScreens = render();
    const oneScreen = render("ltr", {
      ...rollup,
      affectedScreens: ["variant-1"],
      screens: [
        rollup.screens[0] as PublicDiagnosticsRollup["screens"][number],
      ],
      flow: [],
    });

    expect(twoScreens).toContain(
      "2 screens and the whole lesson need a fix before this lesson can continue."
    );
    expect(oneScreen).toContain(
      "1 screen needs a fix before this lesson can continue."
    );
  });

  it("holds in RTL with the requested language and direction", () => {
    const markup = render("rtl");

    expect(markup).toContain('dir="rtl"');
    expect(markup).toContain('lang="ar"');
    expect(actionTags(markup)).toHaveLength(3);
    expect(markup).toContain("Screen 1");
  });
});
