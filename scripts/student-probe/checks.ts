/* eslint-disable no-await-in-loop -- Key presses are sequential: each Tab depends on the focus the previous one left. */
/**
#9 student probe checks. Each check reads the live page and returns the
problems it found; an empty list is a pass. The checks never change page state
except where the name says so (keyboard and focus steps press keys).
*/
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type { Page } from "playwright-core";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf-8");

const blockingImpacts = new Set(["serious", "critical"]);
const minimumTargetBlockSize = 44;
const maximumTabSteps = 60;

interface AxeViolation {
  readonly id: string;
  readonly impact: string | null;
  readonly nodes: readonly { readonly target: readonly string[] }[];
}

/**
axe-core with every rule on; only serious and critical findings block.
*/
export const axeProblems = async (page: Page): Promise<string[]> => {
  // Evaluated through the protocol, so the page's nonce CSP stays in force.
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const { axe } = globalThis as unknown as {
      axe: {
        run: (
          context: Document,
          options: object
        ) => Promise<{ violations: AxeViolation[] }>;
      };
    };
    const result = await axe.run(document, {
      resultTypes: ["violations"],
    });
    return result.violations.map((violation) => {
      return {
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => {
          return {
            target: node.target.map(String),
          };
        }),
      };
    });
  });
  return violations
    .filter((violation) => blockingImpacts.has(violation.impact ?? ""))
    .map((violation) => {
      const targets = violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(" "))
        .join(", ");
      return `axe ${violation.impact ?? "unknown"} ${violation.id}: ${targets}`;
    });
};

/**
The house responsive check: the document never scrolls sideways.
*/
export const overflowProblems = async (page: Page): Promise<string[]> => {
  const sizes = await page.evaluate(() => {
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  return sizes.scrollWidth === sizes.clientWidth
    ? []
    : [
        `overflow: scrollWidth ${sizes.scrollWidth} ≠ clientWidth ${sizes.clientWidth}`,
      ];
};

/**
The card carries the pack language and the matching base direction.
*/
export const directionProblems = async (
  page: Page,
  language: "en" | "ar"
): Promise<string[]> => {
  const expected = language === "ar" ? "rtl" : "ltr";
  const found = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(".learn-card");
    return card
      ? {
          lang: card.lang,
          direction: getComputedStyle(card).direction,
        }
      : null;
  });
  if (!found) {
    return ["direction: no .learn-card"];
  }
  const problems: string[] = [];
  if (found.lang !== language) {
    problems.push(`direction: lang "${found.lang}" ≠ "${language}"`);
  }
  if (found.direction !== expected) {
    problems.push(`direction: computed ${found.direction} ≠ ${expected}`);
  }
  return problems;
};

/**
Every learner control keeps the house 44px touch block size.
*/
export const touchTargetProblems = async (page: Page): Promise<string[]> => {
  const small = await page.evaluate((minimum) => {
    return [...document.querySelectorAll<HTMLElement>(".learn-card button")]
      .filter((button) => button.getBoundingClientRect().height < minimum)
      .map(
        (button) =>
          `${button.textContent?.trim() ?? ""} (${Math.round(button.getBoundingClientRect().height)}px)`
      );
  }, minimumTargetBlockSize);
  return small.map((entry) => `touch target under 44px: ${entry}`);
};

/**
A Latin token inside an Arabic run keeps its own left-to-right order, and the
Arabic word before it stays to its right (it is read first).
*/
export const bidiProblems = async (
  page: Page,
  token: string,
  precedingWord: string
): Promise<string[]> => {
  const result = await page.evaluate(
    ({ code, word }) => {
      const body = document.querySelector<HTMLElement>(".learn-body");
      if (!body) {
        return { error: "no .learn-body" };
      }
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const lefts: number[] = [];
      let tokenBox: DOMRect | null = null;
      let wordBox: DOMRect | null = null;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        const codeAt = text.indexOf(code);
        if (codeAt !== -1) {
          for (let offset = 0; offset < code.length; offset += 1) {
            const range = document.createRange();
            range.setStart(node, codeAt + offset);
            range.setEnd(node, codeAt + offset + 1);
            lefts.push(range.getBoundingClientRect().left);
          }
          const range = document.createRange();
          range.setStart(node, codeAt);
          range.setEnd(node, codeAt + code.length);
          tokenBox = range.getBoundingClientRect();
        }
        const wordAt = text.indexOf(word);
        if (wordAt === -1) {
          continue;
        }
        const wordRange = document.createRange();
        wordRange.setStart(node, wordAt);
        wordRange.setEnd(node, wordAt + word.length);
        wordBox = wordRange.getBoundingClientRect();
      }
      return {
        direction: getComputedStyle(body).direction,
        lefts,
        tokenRight: tokenBox?.right ?? null,
        wordLeft: wordBox?.left ?? null,
      };
    },
    { code: token, word: precedingWord }
  );
  if ("error" in result) {
    return [`bidi: ${result.error}`];
  }
  const problems: string[] = [];
  if (result.direction !== "rtl") {
    problems.push(`bidi: base direction ${result.direction} ≠ rtl`);
  }
  if (result.lefts.length !== token.length) {
    problems.push(`bidi: "${token}" not found in one text node`);
  }
  const isLeftToRight = result.lefts.every(
    (left, index) => index === 0 || left > (result.lefts[index - 1] ?? 0)
  );
  if (!isLeftToRight) {
    problems.push(`bidi: "${token}" characters are not in left-to-right order`);
  }
  if (
    result.tokenRight === null ||
    result.wordLeft === null ||
    result.tokenRight > result.wordLeft + 1
  ) {
    problems.push(
      `bidi: "${token}" is not placed after "${precedingWord}" in reading order`
    );
  }
  return problems;
};

/**
A short, stable description of the focused element for traces.
*/
export const describeFocus = (page: Page): Promise<string> => {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) {
      return "body";
    }
    const text = (active.textContent ?? "").trim().replaceAll(/\s+/gu, " ");
    const tag = active.tagName.toLowerCase();
    const firstClass = String(active.className).split(" ", 1)[0] ?? "";
    const classPart = firstClass === "" ? "" : `.${firstClass}`;
    return `${tag}${classPart} "${text.slice(0, 40)}"`;
  });
};

export interface FocusMatch {
  readonly selector: string;
  readonly text?: string;
}

export const isFocusMatching = (
  page: Page,
  match: FocusMatch
): Promise<boolean> => {
  return page.evaluate(({ selector, text }) => {
    const active = document.activeElement;
    return active instanceof HTMLElement && active.matches(selector)
      ? text === undefined || (active.textContent ?? "").includes(text)
      : false;
  }, match);
};

/**
Press Tab until the focused element matches, recording each stop. Returns false when the match is never reached inside the step budget.
*/
export const hasTabbedTo = async (
  page: Page,
  match: FocusMatch,
  trace: string[]
): Promise<boolean> => {
  for (let step = 0; step < maximumTabSteps; step += 1) {
    if (await isFocusMatching(page, match)) {
      return true;
    }
    await page.keyboard.press("Tab");
    trace.push(`Tab → ${await describeFocus(page)}`);
  }
  return isFocusMatching(page, match);
};

/**
Focus is never trapped: tabbing forward from the current element eventually
leaves the page (Chromium hands focus to the browser and the document reports
the body).
*/
export const focusTrapProblems = async (page: Page): Promise<string[]> => {
  const seen: string[] = [];
  for (let step = 0; step < maximumTabSteps; step += 1) {
    await page.keyboard.press("Tab");
    const focus = await describeFocus(page);
    if (focus === "body") {
      return [];
    }
    seen.push(focus);
  }
  return [
    `focus trapped after ${maximumTabSteps} Tab presses: ${seen.slice(-3).join(" | ")}`,
  ];
};

/**
Focus landed somewhere meaningful, not on the body.
*/
export const focusLandedProblems = async (
  page: Page,
  action: string,
  match: FocusMatch
): Promise<string[]> => {
  const focus = await describeFocus(page);
  if (focus === "body") {
    return [`focus lost to body after ${action}`];
  }
  if (await isFocusMatching(page, match)) {
    return [];
  }
  const expectedText = match.text ? ` "${match.text}"` : "";
  return [
    `focus after ${action} on ${focus}, expected ${match.selector}${expectedText}`,
  ];
};

/**
The page's polite live region carries the expected announcement.
*/
export const liveRegionProblems = async (
  page: Page,
  expected: string
): Promise<string[]> => {
  const text = await page.evaluate(() => {
    return [
      ...document.querySelectorAll<HTMLElement>("output, [role='status']"),
    ]
      .map((region) => region.textContent ?? "")
      .join(" | ");
  });
  return text.includes(expected)
    ? []
    : [`live region "${text}" does not announce "${expected}"`];
};

/**
Reduced motion leaves no running animation or transition.
*/
export const motionProblems = async (page: Page): Promise<string[]> => {
  const running = await page.evaluate(() => document.getAnimations().length);
  return running === 0
    ? []
    : [`${running} animation(s) run under reduced motion`];
};

export const canvasProblems = async (page: Page): Promise<string[]> => {
  const count = await page.evaluate(
    () => document.querySelectorAll("canvas").length
  );
  return count === 0 ? [] : [`${count} canvas element(s) on the learner page`];
};
