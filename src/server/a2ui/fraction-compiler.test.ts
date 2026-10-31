import { describe, expect, it } from "vitest";

import {
  FRACTIONS_CATALOG_ID,
  FRACTIONS_CATALOG_VERSION,
} from "@/shared/a2ui-contract";
import { compileFractionPreview } from "./fraction-compiler";
import { LessonPreviewCompileError } from "./compiler";

const validFractionDraft = {
  requestId: "draft_req_fraction_test",
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
      advanceLabel: "Finish section",
    },
  ],
};

describe("compileFractionPreview", () => {
  it("compiles one fraction surface per section with the pinned catalog", () => {
    const preview = compileFractionPreview({ draft: validFractionDraft });

    expect(preview.catalogId).toBe(FRACTIONS_CATALOG_ID);
    expect(preview.catalogVersion).toBe(FRACTIONS_CATALOG_VERSION);
    expect(preview.messages).toHaveLength(6);

    const createSurface = preview.messages[0];
    expect(
      createSurface && "createSurface" in createSurface
        ? createSurface.createSurface.catalogId
        : undefined
    ).toBe(FRACTIONS_CATALOG_ID);

    const components = preview.messages.flatMap((message) =>
      "updateComponents" in message ? message.updateComponents.components : []
    );
    expect(
      components.some(
        (component) =>
          component.component === "Button" &&
          component.action.event.name === "advanceStage"
      )
    ).toBe(true);
  });

  it("omits the advance control on the final section", () => {
    const preview = compileFractionPreview({
      draft: {
        ...validFractionDraft,
        sections: [validFractionDraft.sections[0]],
      },
    });

    const components = preview.messages.flatMap((message) =>
      "updateComponents" in message ? message.updateComponents.components : []
    );
    expect(
      components.some(
        (component) =>
          component.component === "Button" &&
          component.action.event.name === "advanceStage"
      )
    ).toBe(false);
  });

  it("fails closed on a foreign draft shape", () => {
    expect(() => compileFractionPreview({ draft: { variants: [] } })).toThrow(
      LessonPreviewCompileError
    );
  });

  it("names the section when the math does not parse", () => {
    const broken = {
      ...validFractionDraft,
      sections: [
        {
          ...validFractionDraft.sections[0],
          stem: "\\frac{1}",
        },
      ],
    };

    expect(() => compileFractionPreview({ draft: broken })).toThrow(
      /section-equal-parts/u
    );
  });

  it("rejects a fraction outside the trusted bounds", () => {
    const outside = {
      ...validFractionDraft,
      sections: [
        {
          ...validFractionDraft.sections[0],
          numerator: 5,
        },
      ],
    };

    expect(() => compileFractionPreview({ draft: outside })).toThrow(
      LessonPreviewCompileError
    );
  });
});
