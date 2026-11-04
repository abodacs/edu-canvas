import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TeacherStudio } from "./teacher-studio";
import {
  boardHeading,
  groupDiagnostics,
  readyCountLine,
  variantStatus,
} from "./teacher-studio-board";
import type { PublicGenerationResult } from "@/shared/generation-contract";

type Diagnostic = PublicGenerationResult["diagnostics"][number];

const note = (overrides: Partial<Diagnostic>): Diagnostic => ({
  severity: "warning",
  code: "VARIANT_NOT_MEANINGFULLY_DIFFERENT",
  message: "Two variants ask the same thing.",
  ...overrides,
});

const renderStudio = (): string =>
  renderToStaticMarkup(
    createElement(TeacherStudio, {
      csrf: "csrf",
      generation: "1",
      onOpenReview: vi.fn<(requestId: string) => void>(),
      onCloseReview: vi.fn<() => void>(),
      onUnauthorized: vi.fn<() => void>(),
    })
  );

describe("the studio composer", () => {
  it("names the topic once and keeps the trust promise in the header", () => {
    const markup = renderStudio();
    expect(markup).toContain(
      '<h1 id="generation-heading">Equivalent fractions</h1>'
    );
    expect(markup).toContain("Nothing reaches a student until you approve it.");
    expect(markup).toContain('aria-current="step"');
  });

  it("drops the retired hero, guidance and kicker chrome", () => {
    const markup = renderStudio();
    for (const retired of [
      "teacher-hero",
      "teacher-guidance",
      "insight-card",
      "teacher-marquee",
      'class="kicker',
    ]) {
      expect(markup).not.toContain(retired);
    }
  });

  it("keeps Create lesson in the footer, bound to the objective form", () => {
    const markup = renderStudio();
    expect(markup).toMatch(/<form id="lesson-composer"[^>]*>/u);
    expect(markup).toMatch(
      /<button[^>]*form="lesson-composer"[^>]*>(?:<[^>]+>)*Create lesson/u
    );
    expect(markup).toContain('aria-describedby="lesson-prompt-count"');
    expect(markup).toContain("32 of 500 characters");
  });

  it("shows what the draft is read from as facts, not controls", () => {
    const markup = renderStudio();
    expect(markup).toContain("<dt>Grade</dt><dd>Grade 4</dd>");
    expect(markup).toContain("<dt>Language</dt><dd>English</dd>");
    expect(markup).toContain('<span class="studio-code">4.NF.A.1</span>');
  });
});

describe("the variant board", () => {
  it("names the real variant count", () => {
    expect(boardHeading(4)).toBe("Four variants to review");
    expect(boardHeading(1)).toBe("One variant to review");
    expect(boardHeading(9)).toBe("9 variants to review");
  });

  it("marks a variant with no notes ready, and counts distinct notes in words", () => {
    const diagnostics = [
      note({ variantId: "v1" }),
      note({ variantId: "v1" }),
      note({ variantId: "v1", code: "SCAFFOLD_LEVEL_UNCLEAR", message: "x" }),
      note({ variantId: "v2" }),
    ];
    expect(variantStatus("v3", diagnostics)).toStrictEqual({
      tone: "ok",
      label: "Ready to review",
    });
    expect(variantStatus("v1", diagnostics)).toStrictEqual({
      tone: "warn",
      label: "Ready · 2 notes",
    });
    expect(variantStatus("v2", diagnostics)).toStrictEqual({
      tone: "warn",
      label: "Ready · 1 note",
    });
  });

  it("says how many ready variants carry notes, never a bare n of n", () => {
    const variants = [{ id: "v1" }, { id: "v2" }, { id: "v3" }];
    expect(readyCountLine(variants, [])).toBe("3 ready");
    expect(
      readyCountLine(variants, [note({ variantId: "v2" }), note({})])
    ).toBe("3 ready · 1 with notes");
  });

  it("collapses identical notes into one that names each variant", () => {
    const groups = groupDiagnostics(
      [note({ variantId: "v1" }), note({ variantId: "v2" }), note({})],
      new Map([
        ["v1", "Practice (Core idea)"],
        ["v2", "Guided (Extra support)"],
      ])
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.variantNames).toStrictEqual([
      "Practice (Core idea)",
      "Guided (Extra support)",
    ]);
    expect(groups[0]?.label).toBe("Worth noticing");
  });
});
