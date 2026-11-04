import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioPreview } from "./studio-preview";

describe(StudioPreview, () => {
  const markup = renderToStaticMarkup(createElement(StudioPreview));

  it("names the objective and the standard it is grounded in", () => {
    expect(markup).toContain(
      "Students explain why 2/4 and 1/2 name the same amount"
    );
    expect(markup).toContain("4.NF.A.1");
  });

  it("marks itself as an illustration on synthetic data", () => {
    expect(markup).toContain("data-synthetic-marker");
    expect(markup).toContain("Illustration · synthetic data");
  });

  it("shows four drafted variants with their check verdicts", () => {
    expect(markup).toContain("Same bar, cut two ways");
    expect(markup).toContain("Slide to make an equal share");
    expect(markup).toContain("Pair each fraction with its twin");
    expect(markup).toContain("Ready to review");
    expect(markup).toContain("Ready · 1 warning");
  });

  it("shows the blocked variant as never reaching a student", () => {
    expect(markup).toContain("blocked");
    expect(markup).toContain("Not shown to students");
  });
});
