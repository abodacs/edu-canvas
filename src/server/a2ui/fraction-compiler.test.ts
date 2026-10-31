import { describe, expect, it } from "vitest";

import { gateArtifact } from "@/server/safety/artifact-gate";
import {
  FRACTIONS_CATALOG_ID,
  FRACTIONS_CATALOG_VERSION,
} from "@/shared/a2ui-contract";
import {
  compileFractionPreview,
  compileRawFractionPreview,
} from "./fraction-compiler";

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

describe(compileRawFractionPreview, () => {
  it("compiles one fraction surface per section with the pinned catalog", () => {
    const preview = compileRawFractionPreview({ draft: validFractionDraft });

    expect(preview.catalogId).toBe(FRACTIONS_CATALOG_ID);
    expect(preview.catalogVersion).toBe(FRACTIONS_CATALOG_VERSION);
    expect(preview.messages).toHaveLength(6);

    const [createSurface] = preview.messages;

    expect(
      createSurface && "createSurface" in createSurface
        ? createSurface.createSurface.catalogId
        : undefined
    ).toBe(FRACTIONS_CATALOG_ID);

    const components = preview.messages.flatMap((message) =>
      "updateComponents" in message ? message.updateComponents.components : []
    );

    expect(
      components.some((component) => {
        return (
          component.component === "Button" &&
          component.action.event.name === "advanceStage"
        );
      })
    ).toBeTruthy();
  });

  it("omits the advance control on the final section", () => {
    const preview = compileRawFractionPreview({
      draft: {
        ...validFractionDraft,
        sections: [validFractionDraft.sections[0]],
      },
    });

    const components = preview.messages.flatMap((message) =>
      "updateComponents" in message ? message.updateComponents.components : []
    );

    expect(
      components.some((component) => {
        return (
          component.component === "Button" &&
          component.action.event.name === "advanceStage"
        );
      })
    ).toBeFalsy();
  });

  it("fails closed on a foreign draft shape", () => {
    expect(() =>
      compileRawFractionPreview({ draft: { variants: [] } })
    ).toThrow(
      expect.objectContaining({
        code: "INVALID_CONTRACT",
        field: "draft",
      })
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

    expect(() => compileRawFractionPreview({ draft: broken })).toThrow(
      expect.objectContaining({
        code: "INVALID_MATH",
        field: "stem",
      })
    );
    expect(() => compileRawFractionPreview({ draft: broken })).toThrow(
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

    // The trusted contract rejects the value first; the compiler still keeps
    // its own bounds check as the second, fail-closed seam.
    expect(() => compileRawFractionPreview({ draft: outside })).toThrow(
      expect.objectContaining({
        code: "INVALID_CONTRACT",
      })
    );
  });

  it("compiles only a gate-accepted renderable artifact", () => {
    const gate = gateArtifact({
      kind: "fraction",
      draft: validFractionDraft as never,
    });

    if (gate.renderable?.kind !== "fraction") {
      throw new Error("The fixture gate must mint a renderable fraction.");
    }

    expect(compileFractionPreview(gate.renderable).messages).toHaveLength(6);
  });

  it("refuses an unbranded draft at the production seam", () => {
    expect(() =>
      compileFractionPreview({ draft: validFractionDraft } as never)
    ).toThrow(/gate-accepted/iu);
  });
});
