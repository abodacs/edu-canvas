import { describe, expect, it } from "vitest";

import { decideFractionValue, permittedStageAfter } from "./fraction-stage";

describe(permittedStageAfter, () => {
  const stages = ["section-a", "section-b", "section-c"] as const;

  it("returns only the immediately next permitted stage", () => {
    expect(permittedStageAfter(stages, "section-a")).toMatchObject({
      ok: true,
      nextSectionId: "section-b",
    });
  });

  it("refuses unknown stages, skipping, and past-the-end advances", () => {
    expect(permittedStageAfter(stages, "section-missing")).toMatchObject({
      ok: false,
      code: "STAGE_NOT_FOUND",
    });
    expect(permittedStageAfter(stages, "section-c")).toMatchObject({
      ok: false,
      code: "STAGE_COMPLETE",
    });
  });
});

describe(decideFractionValue, () => {
  it("accepts integers 0 through the whole", () => {
    expect(decideFractionValue({ numerator: 0, denominator: 1 })).toMatchObject(
      { ok: true, numerator: 0 }
    );
    expect(
      decideFractionValue({ numerator: 12, denominator: 12 })
    ).toMatchObject({ ok: true, numerator: 12 });
  });

  it("refuses values outside the trusted range", () => {
    expect(decideFractionValue({ numerator: 5, denominator: 4 })).toMatchObject(
      {
        ok: false,
        code: "INVALID_FRACTION_VALUE",
      }
    );
    expect(
      decideFractionValue({ numerator: 1, denominator: 13 })
    ).toMatchObject({
      ok: false,
      code: "INVALID_FRACTION_VALUE",
    });
    expect(
      decideFractionValue({ numerator: NaN, denominator: 4 })
    ).toMatchObject({ ok: false, code: "INVALID_FRACTION_VALUE" });
  });
});
