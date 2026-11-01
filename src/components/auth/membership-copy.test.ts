import { describe, expect, it } from "vitest";

import { membershipCopy } from "./membership-copy";

const textOf = (value: unknown): string[] => {
  if (typeof value === "string") {
    return [value];
  }
  return typeof value === "object" && value !== null
    ? Object.values(value).flatMap((entry) => textOf(entry))
    : [];
};

const copyStrings = textOf(membershipCopy);
const schoolStrings = copyStrings.filter((text) => /\bschool\b/iu.test(text));

describe("membership copy", () => {
  it("names a class where the teacher makes the choice", () => {
    const heading = membershipCopy.heading.toLowerCase();

    expect(heading).toContain("class");
    expect(heading).not.toContain("school");
  });

  it("keeps school only where it names the administrator role", () => {
    const unexplained = schoolStrings.filter(
      (text) => !text.includes("school administrator")
    );

    expect(unexplained).toHaveLength(0);
  });

  it("sends the teacher to the administrator when the attempt limit blocks", () => {
    expect(membershipCopy.errors.rateLimited.message).toContain(
      "school administrator"
    );
  });
});
