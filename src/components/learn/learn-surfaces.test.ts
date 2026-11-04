import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CheckOutcome,
  NextActivityCard,
  RepeatEvaluationNotice,
  RevealReport,
} from "./learn-surfaces";
import { BidiText } from "./bidi-text";
import { MatchingColumns } from "./learn-board";
import { learnerCopyFor } from "./learner-copy";
import type { LearnerAttemptResponse } from "@/shared/learner-contract";

const copy = learnerCopyFor("en");
const arabicCopy = learnerCopyFor("ar");

const render = (element: React.ReactElement): string =>
  renderToStaticMarkup(element);

const reveal = (
  overrides: Partial<LearnerAttemptResponse["reveal"]> = {}
): LearnerAttemptResponse["reveal"] => {
  return {
    ruleVersion: "reveal-v1",
    pairs: [
      {
        sourceId: "source-half",
        sourceLabel: "1/2",
        targetId: "distractor",
        targetLabel: "3/4",
        correct: false,
      },
    ],
    unresolved: [{ sourceId: "source-half", sourceLabel: "1/2" }],
    feedback: "Not yet. Multiply both parts by the same number.",
    connection: "equal parts keep the same value when both parts change.",
    ...overrides,
  };
};

describe(RevealReport, () => {
  it("renders the incorrect report for a distractor-only submission", () => {
    const markup = render(
      createElement(RevealReport, { reveal: reveal(), copy })
    );

    expect(markup).toContain("Not yet");
    expect(markup).toContain("1/2 to 3/4");
    expect(markup).toContain("Still to match: 1/2");
    expect(markup).toContain("Multiply both parts by the same number.");
    expect(markup).toContain('data-correct="false"');
  });

  it("never renders the answer the learner did not submit", () => {
    const markup = render(
      createElement(RevealReport, { reveal: reveal(), copy })
    );

    expect(markup).not.toContain("2/4");
    expect(markup).not.toContain("target-half");
  });

  it("degrades to pairs and labels when approved copy is absent", () => {
    const markup = render(
      createElement(RevealReport, {
        reveal: reveal({ feedback: null, connection: null }),
        copy,
      })
    );

    expect(markup).toContain("learn-pair");
    expect(markup).not.toContain("learn-feedback");
    expect(markup).not.toContain("learn-connection");
  });
});

describe(NextActivityCard, () => {
  it("renders the pause surface without naming an activity", () => {
    const markup = render(
      createElement(NextActivityCard, {
        activity: {
          activityId: null,
          activityAxis: "variant-kind",
          purpose: "pause",
          reason: "Independent evidence is missing.",
          ruleVersion: "next-activity-rule-x",
          evidenceHash: "a".repeat(64),
          derivedFromAttemptId: null,
        },
        copy,
      })
    );

    expect(markup).toContain("Independent evidence is missing.");
    expect(markup).toContain("Your teacher is choosing the next activity.");
    expect(markup).not.toContain("ready");
  });

  it("renders the ready surface for a decided activity", () => {
    const markup = render(
      createElement(NextActivityCard, {
        activity: {
          activityId: "variant_scaffold",
          activityAxis: "variant-kind",
          purpose: "scaffold",
          reason: "The learner needs another supported example.",
          ruleVersion: "next-activity-rule-x",
          evidenceHash: "a".repeat(64),
          derivedFromAttemptId: "attempt_1",
        },
        copy,
      })
    );

    expect(markup).toContain("The learner needs another supported example.");
    expect(markup).toContain("Your next approved activity is ready.");
  });

  it("renders the waiting surface when no decision exists yet", () => {
    const markup = render(
      createElement(NextActivityCard, { activity: null, copy })
    );

    expect(markup).toContain("Your teacher is choosing the next activity.");
  });
});

describe(CheckOutcome, () => {
  const correctnessStates = ["correct", "partial", "incorrect"] as const;

  it("renders an intentional surface for each correctness state", () => {
    for (const correctness of correctnessStates) {
      const markup = render(createElement(CheckOutcome, { correctness, copy }));

      expect(markup).toContain(`data-correctness="${correctness}"`);
      // The page's single live region announces the grade; the outcome line
      // itself stays static so the result is not announced twice.
      expect(markup).not.toContain("<output");
    }
  });

  it("keeps every state's fixed template distinct", () => {
    const markups = correctnessStates.map((correctness) =>
      render(createElement(CheckOutcome, { correctness, copy }))
    );

    const distinctMarkups = new Set(markups);

    expect(distinctMarkups.size).toBe(correctnessStates.length);
    expect(markups[0]).toContain("You matched every pair.");
    expect(markups[1]).toContain("Some matches are still missing.");
    expect(markups[2]).toContain("Not every match is right yet.");
  });
});

describe(RepeatEvaluationNotice, () => {
  it("names the repeat state without reclassifying the first response", () => {
    const markup = render(createElement(RepeatEvaluationNotice, { copy }));

    expect(markup).toContain("This check repeats from the start.");
    expect(markup).toContain("Your first response stays on record.");
  });
});

describe("Arabic learner surfaces", () => {
  it("renders the reveal in Arabic with isolated Latin tokens", () => {
    const markup = render(
      createElement(RevealReport, {
        reveal: reveal({ feedback: "راجع المعيار 4.NF.A.1 ثم حاول." }),
        copy: arabicCopy,
      })
    );

    expect(markup).toContain("نتيجة تحققك");
    expect(markup).toContain(
      '<bdi dir="ltr">1/2</bdi> مع <bdi dir="ltr">3/4</bdi>'
    );
    expect(markup).toContain('المعيار <bdi dir="ltr">4.NF.A.1</bdi> ثم');
    expect(markup).not.toContain("Your check");
  });
});

const boardItem = (id: string, label: string, role: "source" | "target") => ({
  id,
  label,
  role,
});
const ignoreSelection = (): void => {
  // The static render never clicks.
};

const board = (input: {
  readonly pairs: Readonly<Record<string, string>>;
  readonly activeSource: string | null;
  readonly language?: "en" | "ar";
}): string =>
  render(
    createElement(MatchingColumns, {
      copy: learnerCopyFor(input.language ?? "en"),
      sourceHeading: "Fractions",
      targetHeading: "Same amount",
      sources: [
        boardItem("half", "1/2", "source"),
        boardItem("third", "1/3", "source"),
      ],
      targets: [
        boardItem("two-quarters", "2/4", "target"),
        boardItem("two-sixths", "2/6", "target"),
      ],
      pairs: input.pairs,
      activeSource: input.activeSource,
      isLocked: false,
      onSelectSource: ignoreSelection,
      onSelectTarget: ignoreSelection,
    })
  );

describe(MatchingColumns, () => {
  it("numbers a formed pair on both of its cards, in the order formed", () => {
    const markup = board({
      pairs: { third: "two-sixths", half: "two-quarters" },
      activeSource: null,
    });

    expect(markup.match(/Pair 1/gu)).toHaveLength(2);
    expect(markup.match(/Pair 2/gu)).toHaveLength(2);
    expect(markup.indexOf("1/3")).toBeLessThan(markup.indexOf("Pair 1"));
    expect(markup).not.toContain("matched");
  });

  it("marks only paired cards and keeps the tick out of the name", () => {
    const markup = board({
      pairs: { half: "two-quarters" },
      activeSource: null,
    });

    expect(markup.match(/data-paired="true"/gu)).toHaveLength(2);
    expect(markup.match(/data-paired="false"/gu)).toHaveLength(2);
    expect(markup).toContain('<svg aria-hidden="true"');
  });

  it("presses the waiting source and locks nothing while the board is open", () => {
    const markup = board({ pairs: {}, activeSource: "half" });

    expect(markup.match(/aria-pressed="true"/gu)).toHaveLength(1);
    expect(markup).not.toContain("data-locked");
  });

  it("speaks the pair label in the pack language", () => {
    const markup = board({
      pairs: { half: "two-quarters" },
      activeSource: null,
      language: "ar",
    });

    expect(markup).toContain("الزوج 1");
    expect(markup).not.toContain("Pair 1");
  });
});

describe(BidiText, () => {
  it("leaves a sentence period with the Arabic text", () => {
    const markup = render(
      createElement(BidiText, { text: "تمت مطابقة 3 من 6.", direction: "rtl" })
    );

    expect(markup).toBe(
      'تمت مطابقة <bdi dir="ltr">3</bdi> من <bdi dir="ltr">6</bdi>.'
    );
  });

  it("isolates an all-Latin sentence once on a right-to-left page", () => {
    const markup = render(
      createElement(BidiText, {
        text: "The learner needs another supported example.",
        direction: "rtl",
      })
    );

    expect(markup).toBe(
      '<bdi dir="ltr">The learner needs another supported example.</bdi>'
    );
  });

  it("passes left-to-right text through untouched", () => {
    const markup = render(
      createElement(BidiText, { text: "Match 1/2.", direction: "ltr" })
    );

    expect(markup).toBe("Match 1/2.");
  });
});

// #9: learner rules must not pin a physical side, or the Arabic page cannot
// mirror. One- and two-value margin and padding are symmetric and allowed.
const physicalSides = ["top", "right", "bottom", "left"] as const;
const physicalProperties = new Set<string>([
  ...physicalSides,
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  ...["margin", "padding", "border"].flatMap((box) =>
    physicalSides.map((side) => `${box}-${side}`)
  ),
  ...["top", "bottom"].flatMap((block) =>
    ["left", "right"].map((inline) => `border-${block}-${inline}-radius`)
  ),
]);
const sidedValueProperties = new Set(["text-align", "float", "clear"]);
const symmetricShorthands = new Set(["margin", "padding", "inset"]);
const maximumSymmetricValues = 2;

const isPhysicalDeclaration = (declaration: string): boolean => {
  const separator = declaration.indexOf(":");
  if (separator === -1) {
    return false;
  }
  const property = declaration.slice(0, separator).trim();
  const value = declaration.slice(separator + 1).trim();
  const isBorderSide = physicalSides.some((side) =>
    property.startsWith(`border-${side}-`)
  );
  if (isBorderSide || physicalProperties.has(property)) {
    return true;
  }
  return sidedValueProperties.has(property)
    ? value === "left" || value === "right"
    : symmetricShorthands.has(property) &&
        value.split(" ").filter(Boolean).length > maximumSymmetricValues;
};

const learnerDeclarations = (css: string): string[] => {
  const declarations: string[] = [];
  for (const block of css.split("}")) {
    const open = block.lastIndexOf("{");
    const selector = block.slice(0, open).split("{").at(-1)?.trim() ?? "";
    if (open === -1 || !selector.includes(".learn-")) {
      continue;
    }
    const body = block.slice(open + 1).split(";");
    for (const declaration of body) {
      if (declaration.trim() !== "") {
        declarations.push(`${selector} { ${declaration.trim()} }`);
      }
    }
  }
  return declarations;
};

describe("learn styles", () => {
  const stylesUrl = new URL("../../styles/learn.css", import.meta.url);
  const styles = readFileSync(stylesUrl, "utf-8");

  it("wraps the board columns so they stack at 320px", () => {
    expect(styles).toContain(
      "grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));"
    );
  });

  it("uses only logical properties in learner rules", () => {
    const declarations = learnerDeclarations(styles);
    const violations = declarations.filter((line) => {
      return isPhysicalDeclaration(
        line.slice(line.indexOf("{") + 1, line.lastIndexOf("}"))
      );
    });

    expect(declarations.length).toBeGreaterThan(0);
    expect(violations).toStrictEqual([]);
  });

  it("flags a physical side in a learner rule", () => {
    const flagged = learnerDeclarations(
      ".learn-x { margin-left: 1rem; inline-size: 100%; margin: 0 0 1rem; text-align: left; padding: 0 1rem }"
    ).filter((line) => {
      return isPhysicalDeclaration(
        line.slice(line.indexOf("{") + 1, line.lastIndexOf("}"))
      );
    });

    expect(flagged).toHaveLength(3);
  });

  it("adds no animation to the learner surfaces", () => {
    const learnBlock = styles.slice(styles.indexOf(".learn-card {"));

    expect(learnBlock).not.toMatch(/\banimation\b|\btransition\b|@keyframes/u);
  });
});
