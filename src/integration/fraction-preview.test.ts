import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  applyA2UIMessage,
  createA2UIRenderState,
} from "@/components/a2ui/renderer";
import { A2UIComponentRenderer } from "@/components/a2ui/component-renderer";
import { compileFractionPreview } from "@/server/a2ui/fraction-compiler";

const fractionDraft = {
  requestId: "draft_req_fraction_render",
  standardId: "standard_ccss_4_nf_a_01",
  grade: 4,
  language: "en",
  direction: "ltr",
  title: "Equivalent fractions",
  sections: [
    {
      sectionId: "section-equal-parts",
      purpose: "Recognize equal parts",
      stem: "\\frac{1}{2}",
      stemTextEquivalent: "One half.",
      diagramLabel: "Shade one half",
      denominator: 2,
      numerator: 1,
    },
    {
      sectionId: "section-equivalence",
      purpose: "Match equivalent names",
      stem: "\\frac{2}{4} = \\frac{1}{2}",
      diagramLabel: "Shade two quarters",
      denominator: 4,
      numerator: 2,
    },
  ],
};

describe("compiled fraction preview rendering", () => {
  it("renders native MathML, the bar, and labeled keyboard controls", () => {
    const preview = compileFractionPreview({ draft: fractionDraft });
    let state = createA2UIRenderState();
    for (const message of preview.messages) {
      const applied = applyA2UIMessage(state, message);
      if (!applied.ok) {
        throw new Error(applied.message);
      }
      ({ state } = applied);
    }

    const firstSurfaceId =
      "fraction-draft_req_fraction_render-section-equal-parts";
    const surface = state.surfaces[firstSurfaceId];
    if (!surface) {
      throw new Error("Expected the first fraction surface.");
    }

    const markup = renderToStaticMarkup(
      createElement(A2UIComponentRenderer, {
        surface,
        surfaceId: firstSurfaceId,
        componentId: "root",
        onAction: vi.fn<() => void>(),
      })
    );

    expect(markup).toContain("<math");
    expect(markup).toContain("<mfrac");
    expect(markup).toContain("<mn>1</mn>");
    expect(markup).toContain("<mn>2</mn>");
    expect(markup).toContain("a2ui-fraction-bar__part");
    expect(markup).toContain("is-shaded");
    expect(markup).toContain('type="number"');
    expect(markup).toContain("Parts shaded out of 2");
    expect(markup).toContain("Shade one more part");
    expect(markup).toContain("1 of 2 equal parts shaded.");
    expect(markup).toContain("Next stage");
  });

  it("keeps the fraction data model lean and directional", () => {
    const preview = compileFractionPreview({ draft: fractionDraft });
    const dataModel = preview.messages.find(
      (message) => "updateDataModel" in message
    );
    expect(dataModel).toBeTruthy();
    if (!dataModel || !("updateDataModel" in dataModel)) {
      return;
    }
    expect(dataModel.updateDataModel.value).toMatchObject({
      sectionId: "section-equal-parts",
      direction: "ltr",
      validationState: "ready-for-review",
    });
    expect(
      Object.hasOwn(dataModel.updateDataModel.value, "selectedItemIds")
    ).toBe(false);
  });
});
