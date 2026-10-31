import { describe, expect, it } from "vitest";

import {
  buildStoryPlan,
  extractConnectionExplanation,
  storyPlanSchema,
  StoryPlanBuildError,
} from "./story-plan";
import type { StoryLanguage, StoryPlanSource } from "./story-plan";

const acceptedPath: StoryPlanSource = {
  direction: "forward",
  steps: [
    {
      nodeId: "graph_node_equal_parts",
      label: "Understand equal parts",
      role: "prerequisite",
      screenPurposeId: "screen_purpose_equal_parts",
      screenPurpose: "Show how a whole is divided into equal parts.",
    },
    {
      nodeId: "graph_node_equivalent_fractions",
      label: "Recognize equivalent fractions",
      role: "target",
      screenPurposeId: "screen_purpose_equivalent_fractions",
      screenPurpose: "Match different names for the same part of a whole.",
    },
  ],
  rationale:
    "Start with equal parts so the lesson can connect the same whole to different fraction names.",
  nextScreenRationale:
    "The matching screen makes that connection visible before teacher review.",
  versionPins: {
    draftId: "draft_01",
    graphVersion: "graph_v1",
    catalogVersion: "matching-v1",
    modelVersion: "model_v1",
    validatorVersion: "validator_v1",
  },
};

const learnerAction = "Select a source card, then a target card.";

const buildPlan = (language: StoryLanguage = "en") => buildStoryPlan({ path: acceptedPath, language, learnerAction });

describe(buildStoryPlan, () => {
  it("returns identical bytes for the same accepted path", () => {
    const first = JSON.stringify(buildPlan());
    const second = JSON.stringify(buildPlan());

    expect(second).toBe(first);
    expect(buildPlan()).toStrictEqual(buildPlan());
  });

  it("budgets three beats for the two-screen seeded path", () => {
    const plan = buildPlan();

    expect(plan.beats.map((beat) => beat.role)).toStrictEqual([
      "prerequisite",
      "hinge",
      "target",
    ]);
  });

  it("orders beats by path order with the hinge before the target", () => {
    const plan = buildPlan();

    expect(plan.beats.map((beat) => beat.label)).toStrictEqual([
      "Understand equal parts",
      "Connection reveal",
      "Recognize equivalent fractions",
    ]);
    expect(plan.beats.map((beat) => beat.position)).toStrictEqual([1, 2, 3]);
    expect(plan.beats.map((beat) => beat.id)).toStrictEqual([
      "story-beat-1",
      "story-beat-2",
      "story-beat-3",
    ]);
  });

  it("marks only the hinge as the connection reveal", () => {
    const plan = buildPlan();

    expect(plan.beats.filter((beat) => beat.reveal)).toHaveLength(1);
    expect(plan.beats.find((beat) => beat.reveal)?.role).toBe("hinge");
  });

  it("pins the hinge to the target screen instead of inventing one", () => {
    const plan = buildPlan();
    const hinge = plan.beats.find((beat) => beat.role === "hinge");

    expect(hinge?.screenPurposeId).toBe("screen_purpose_equivalent_fractions");
    expect(hinge?.screenPurpose).toBe(
      "Match different names for the same part of a whole."
    );
  });

  it("names the next screen in the final transition", () => {
    const plan = buildPlan();

    expect(plan.beats.at(-1)?.transition).toBe(
      "The matching screen makes that connection visible before teacher review."
    );
    expect(plan.beats[0]?.transition).toBe("Connection reveal");
    expect(plan.beats[1]?.transition).toBe("Recognize equivalent fractions");
  });

  it("keeps every beat fact inside the approved sources", () => {
    const plan = buildPlan();
    const allowedLabels = new Set([
      ...acceptedPath.steps.map((step) => step.label),
      "Connection reveal",
    ]);
    const allowedNarratives = new Set([
      ...acceptedPath.steps.map((step) => step.screenPurpose),
      plan.connectionExplanation,
    ]);
    const allowedTransitions = new Set([
      ...plan.beats.map((beat) => beat.label),
      acceptedPath.nextScreenRationale,
    ]);

    for (const beat of plan.beats) {
      expect(allowedLabels.has(beat.label)).toBeTruthy();
      expect(allowedTransitions.has(beat.transition)).toBeTruthy();
      expect(allowedNarratives.has(beat.narrative)).toBeTruthy();
      expect(
        acceptedPath.steps.some(
          (step) => step.screenPurposeId === beat.screenPurposeId
        )
      ).toBeTruthy();
    }
  });

  it("derives the connection explanation from the rationale without new words", () => {
    const plan = buildPlan();

    expect(plan.connectionExplanation).toBe(
      "The lesson can connect the same whole to different fraction names."
    );
    expect(
      acceptedPath.rationale
        .toLowerCase()
        
    ).toContain(plan.connectionExplanation.toLowerCase());
  });

  it("satisfies the published story plan schema", () => {
    const parsed = storyPlanSchema.parse(buildPlan());

    expect(parsed.version).toBe("story-v1");
    expect(parsed.direction).toBe("ltr");
    expect(parsed.versionPins.storyPlanVersion).toBe("story-v1");
  });

  it("gives every beat a screen purpose, learner action, and accessibility text", () => {
    for (const beat of buildPlan().beats) {
      expect([
        beat.screenPurposeId,
        beat.screenPurpose,
        beat.learnerAction,
        beat.transition,
      ]).toStrictEqual([
        beat.screenPurposeId,
        beat.screenPurpose,
        learnerAction,
        beat.transition,
      ]);
      expect(beat.accessibility.announcement).toContain(beat.label);
      expect(beat.accessibility.reducedMotionSafe).toBeTruthy();
    }
  });

  it("carries the accepted path version pins", () => {
    const plan = buildPlan();

    expect(plan.versionPins).toStrictEqual({
      ...acceptedPath.versionPins,
      storyPlanVersion: "story-v1",
    });
  });

  it("throws instead of inventing a beat for a path without an edge", () => {
    const singleStepPath: StoryPlanSource = {
      ...acceptedPath,
      steps: acceptedPath.steps.slice(0, 1),
    };

    expect(() =>
      buildStoryPlan({ path: singleStepPath, language: "en", learnerAction })
    ).toThrow(StoryPlanBuildError);
  });
});

describe(buildStoryPlan, () => {
  it("renders right-to-left Arabic without translated English frames", () => {
    const plan = buildPlan("ar");

    expect(plan.direction).toBe("rtl");
    expect(plan.language).toBe("ar");
    expect(plan.beats.map((beat) => beat.role)).toStrictEqual([
      "prerequisite",
      "hinge",
      "target",
    ]);
    expect(plan.beats[1]?.label).toBe("كشف الارتباط");
  });
});

describe(extractConnectionExplanation, () => {
  it("falls back to the whole rationale when no connective exists", () => {
    const rationale = "Equal parts come before equivalent fractions.";

    expect(extractConnectionExplanation(rationale, "en")).toBe(rationale);
  });

  it("drops the premise only and keeps every remaining word", () => {
    expect(
      extractConnectionExplanation(acceptedPath.rationale, "en")
    ).toBe("The lesson can connect the same whole to different fraction names.");
  });

  it("splits Arabic rationales on the Arabic connective", () => {
    expect(
      extractConnectionExplanation(
        "نبدأ بالأجزاء المتساوية حتى يربط الدرس بين الكل نفسه وأسماء الكسور المختلفة.",
        "ar"
      )
    ).toBe("يربط الدرس بين الكل نفسه وأسماء الكسور المختلفة.");
  });
});
