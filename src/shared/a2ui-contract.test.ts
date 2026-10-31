import { describe, expect, it } from "vitest";

import {
  A2UI_CATALOG_ID,
  FRACTIONS_CATALOG_ID,
  validateA2UIMessage,
} from "./a2ui-contract";

describe("Edu-Canvas A2UI catalog contract", () => {
  it("accepts the allowlisted semantic learning-path component and safe pins", () => {
    const result = validateA2UIMessage({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "preview-1",
        components: [
          {
            id: "learning-path",
            component: "LearningPath",
          },
        ],
      },
    });

    expect(result).toMatchObject({ ok: true });

    const dataModel = validateA2UIMessage({
      version: "v0.9.1",
      updateDataModel: {
        surfaceId: "preview-1",
        path: "/",
        value: {
          variantId: "variant-1",
          purpose: "Teach the model",
          accessibilityDescription: "Match each fraction.",
          scaffold: "Core matching scaffold",
          standardId: "standard_ccss_4_nf_a_01",
          grade: 4,
          language: "en",
          direction: "ltr",
          validationState: "ready-for-review",
          selectedItemIds: [],
          learningPath: {
            direction: "forward",
            steps: [
              {
                nodeId: "graph_node_equal_parts",
                label: "Understand equal parts",
                role: "prerequisite",
                screenPurposeId: "screen_purpose_equal_parts",
                screenPurpose: "Show equal parts.",
              },
              {
                nodeId: "graph_node_equivalent_fractions",
                label: "Recognize equivalent fractions",
                role: "target",
                screenPurposeId: "screen_purpose_equivalent_fractions",
                screenPurpose: "Match equivalent names.",
              },
            ],
            rationale: "The prerequisite makes the target easier to see.",
            nextScreenRationale:
              "The matching screen makes the connection visible.",
            versionPins: {
              draftId: "draft-1",
              graphVersion: "equivalent-fractions-v1",
              catalogVersion: "matching-v1",
              modelVersion: "fixture-v1",
              validatorVersion: "semantic-validation-runner-v1",
            },
          },
        },
      },
    });

    expect(dataModel).toMatchObject({ ok: true });
  });

  it("accepts the pinned catalog and rejects unknown components safely", () => {
    const accepted = validateA2UIMessage({
      version: "v0.9.1",
      createSurface: {
        surfaceId: "preview-1",
        catalogId: A2UI_CATALOG_ID,
      },
    });

    expect(accepted).toMatchObject({ ok: true });

    const rejected = validateA2UIMessage({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "preview-1",
        components: [
          {
            id: "root",
            component: "RawHtml",
            html: "<script>alert(1)</script>",
          },
        ],
      },
    });

    expect(rejected).toMatchObject({
      ok: false,
      code: "UNKNOWN_COMPONENT",
    });
  });

  it("rejects an action that is not in the matching catalog", () => {
    const rejected = validateA2UIMessage({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "preview-1",
        components: [
          {
            id: "clear",
            component: "Button",
            label: "Clear selection",
            variant: "quiet",
            action: {
              event: {
                name: "runJavaScript",
                context: { surfaceId: "preview-1" },
              },
            },
          },
        ],
      },
    });

    expect(rejected).toMatchObject({
      ok: false,
      code: "UNKNOWN_ACTION",
    });
  });

  it("rejects an unsupported protocol version before rendering", () => {
    const rejected = validateA2UIMessage({
      version: "v0.8",
      createSurface: {
        surfaceId: "preview-1",
        catalogId: A2UI_CATALOG_ID,
      },
    });

    expect(rejected).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_VERSION",
    });
  });

  it("rejects a catalog identifier that is not the pinned Edu-Canvas version", () => {
    const rejected = validateA2UIMessage({
      version: "v0.9.1",
      createSurface: {
        surfaceId: "preview-1",
        catalogId: "https://example.test/catalogs/untrusted",
      },
    });

    expect(rejected).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_CATALOG",
    });
  });

  it("rejects arbitrary styling and executable payload fields", () => {
    const rejected = validateA2UIMessage({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "preview-1",
        components: [
          {
            id: "title",
            component: "Text",
            text: "Equivalent fractions",
            style: { color: "red" },
          },
        ],
      },
    });

    expect(rejected).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_PROPERTY",
    });
  });

  it("rejects duplicate component identifiers before state application", () => {
    const rejected = validateA2UIMessage({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "preview-1",
        components: [
          { id: "title", component: "Text", text: "One" },
          { id: "title", component: "Text", text: "Two" },
        ],
      },
    });

    expect(rejected).toMatchObject({
      ok: false,
      code: "DUPLICATE_COMPONENT",
    });
  });

  it("rejects private lesson fields before schema parsing", () => {
    const rejected = validateA2UIMessage({
      version: "v0.9.1",
      updateDataModel: {
        surfaceId: "preview-1",
        path: "/",
        value: {
          variantId: "variant-1",
          purpose: "Teach the model",
          accessibilityDescription: "Match each fraction.",
          scaffold: "Core matching scaffold",
          standardId: "standard_ccss_4_nf_a_01",
          grade: 4,
          language: "en",
          direction: "ltr",
          validationState: "ready-for-review",
          selectedItemIds: [],
          answerKey: "private",
        },
      },
    });

    expect(rejected).toMatchObject({
      ok: false,
      code: "UNSAFE_PAYLOAD",
    });
  });
});

describe("fractions-v2 catalog contract", () => {
  const fractionComponents = [
    {
      id: "stem",
      component: "MathText",
      latex: "\\frac{1}{2} + \\frac{3}{4} = \\frac{5}{4}",
      textEquivalent: "One half plus three quarters equals five quarters.",
    },
    {
      id: "diagram",
      component: "FractionDiagram",
      denominator: 4,
      numerator: 1,
      label: "Shade the equivalent fraction",
      textEquivalent: "1 of 4 equal parts shaded",
      action: {
        event: {
          name: "setFractionValue",
          context: { surfaceId: "preview-1", itemId: "item-fractions" },
        },
      },
    },
    {
      id: "advance",
      component: "Button",
      label: "Next stage",
      variant: "secondary",
      action: {
        event: {
          name: "advanceStage",
          context: {
            surfaceId: "preview-1",
            sectionId: "section-equivalent-parts",
          },
        },
      },
    },
  ] as const;

  it("accepts fraction components, actions, and the fraction data model", () => {
    const created = validateA2UIMessage({
      version: "v0.9.1",
      createSurface: {
        surfaceId: "preview-1",
        catalogId: FRACTIONS_CATALOG_ID,
      },
    });

    expect(created).toMatchObject({ ok: true });

    const components = validateA2UIMessage(
      {
        version: "v0.9.1",
        updateComponents: {
          surfaceId: "preview-1",
          components: [...fractionComponents],
        },
      },
      { catalogVersion: "fractions-v2" }
    );

    expect(components).toMatchObject({ ok: true });

    const dataModel = validateA2UIMessage({
      version: "v0.9.1",
      updateDataModel: {
        surfaceId: "preview-1",
        path: "/",
        value: {
          sectionId: "section-equivalent-parts",
          purpose: "Recognize equivalent fractions",
          standardId: "standard_ccss_4_nf_a_01",
          grade: 4,
          language: "en",
          direction: "ltr",
          validationState: "ready-for-review",
        },
      },
    });

    expect(dataModel).toMatchObject({ ok: true });
  });

  it("rejects an unknown catalog id before schema parsing", () => {
    const rejected = validateA2UIMessage({
      version: "v0.9.1",
      createSurface: {
        surfaceId: "preview-1",
        catalogId: "https://edu-canvas.app/a2ui/v0.9.1/catalogs/rogue-v1",
      },
    });

    expect(rejected).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_CATALOG",
    });
  });

  it("keeps fraction components out of a pinned matching surface but allows the union unpinned", () => {
    const message = {
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "preview-1",
        components: [fractionComponents[0]],
      },
    };

    expect(validateA2UIMessage(message)).toMatchObject({ ok: true });

    const scoped = validateA2UIMessage(message, {
      catalogVersion: "matching-v1",
    });

    expect(scoped).toMatchObject({ ok: false, code: "UNKNOWN_COMPONENT" });

    const fractionScoped = validateA2UIMessage(message, {
      catalogVersion: "fractions-v2",
    });

    expect(fractionScoped).toMatchObject({ ok: true });
  });

  it("keeps matching actions out of a pinned fraction surface", () => {
    const rejected = validateA2UIMessage(
      {
        version: "v0.9.1",
        updateComponents: {
          surfaceId: "preview-1",
          components: [
            {
              id: "card",
              component: "Button",
              label: "Match one half",
              variant: "secondary",
              action: {
                event: {
                  name: "selectSource",
                  context: { surfaceId: "preview-1", itemId: "item-1" },
                },
              },
            },
          ],
        },
      },
      { catalogVersion: "fractions-v2" }
    );

    expect(rejected).toMatchObject({ ok: false, code: "UNKNOWN_ACTION" });
  });

  it("rejects math that does not parse with a dedicated blocking code", () => {
    const unbalanced = validateA2UIMessage({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "preview-1",
        components: [{ id: "stem", component: "MathText", latex: "\\frac{1}" }],
      },
    });

    expect(unbalanced).toMatchObject({ ok: false, code: "INVALID_MATH" });

    const macro = validateA2UIMessage({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "preview-1",
        components: [
          { id: "stem", component: "MathText", latex: "\\input{x}" },
        ],
      },
    });

    expect(macro).toMatchObject({ ok: false, code: "INVALID_MATH" });

    const character = validateA2UIMessage({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "preview-1",
        components: [{ id: "stem", component: "MathText", latex: "50\\% + 1" }],
      },
    });

    expect(character).toMatchObject({ ok: false, code: "INVALID_MATH" });
  });

  it("rejects a fraction value outside its whole and a whole outside the bounds", () => {
    const outsideWhole = validateA2UIMessage({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "preview-1",
        components: [
          {
            id: "diagram",
            component: "FractionDiagram",
            denominator: 4,
            numerator: 5,
            label: "Shade the fraction",
            action: {
              event: {
                name: "setFractionValue",
                context: { surfaceId: "preview-1" },
              },
            },
          },
        ],
      },
    });

    expect(outsideWhole).toMatchObject({
      ok: false,
      code: "INVALID_FRACTION_VALUE",
    });

    const outsideBounds = validateA2UIMessage({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "preview-1",
        components: [
          {
            id: "diagram",
            component: "FractionDiagram",
            denominator: 13,
            numerator: 0,
            label: "Shade the fraction",
            action: {
              event: {
                name: "setFractionValue",
                context: { surfaceId: "preview-1" },
              },
            },
          },
        ],
      },
    });

    expect(outsideBounds).toMatchObject({ ok: false, code: "INVALID_MESSAGE" });
  });
});
