import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { moderationCategoryValues } from "@/shared/generation-contract";

import { ModerationRecoveryPanel } from "./moderation-recovery-panel";
import {
  GENERIC_MODERATION_REASON,
  MODERATION_RECOVERY_TITLE,
  REVISE_REQUEST_LABEL,
  resolveModerationRecovery,
} from "./moderation-recovery";

// Copy rule 2 and rule 8 from docs/design/blocked-generation-recovery.md:
// moderation copy never offers the unchanged request again.
const FORBIDDEN_PATTERNS = [
  /try again/iu,
  /retry/iu,
  /resubmit/iu,
  /same request/iu,
];

const renderPanel = (
  overrides: Partial<Parameters<typeof ModerationRecoveryPanel>[0]> = {}
): string => {
  return renderToStaticMarkup(
    createElement(ModerationRecoveryPanel, {
      objective: "equivalent fractions for grade 4",
      hasEarlierDraft: false,
      onRevise: vi.fn<() => void>(),
      ...overrides,
    })
  );
};

describe("moderation recovery copy", () => {
  it("gives every category a reason that never offers the unchanged request", () => {
    for (const category of moderationCategoryValues) {
      const recovery = resolveModerationRecovery({ category });

      expect({
        category,
        hasReason: recovery.reason.length > 0,
        hasLabel: recovery.categoryLabel !== null,
        offersRetry: FORBIDDEN_PATTERNS.some((pattern) =>
          pattern.test(recovery.reason)
        ),
      }).toStrictEqual({
        category,
        hasReason: true,
        hasLabel: true,
        offersRetry: false,
      });
    }
  });

  it("names the category the block reports", () => {
    expect(
      resolveModerationRecovery({ category: "personal-data" })
    ).toMatchObject({
      categoryLabel: "Information about a real person",
      categoryReference:
        "Category: Information about a real person (personal-data).",
    });
    expect(
      resolveModerationRecovery({ category: "harmful-content" })
    ).toMatchObject({
      categoryLabel: "Content that could harm students",
      reason: expect.stringContaining("could harm students"),
    });
  });

  it("falls back to the generic sentence when no category is known", () => {
    expect(resolveModerationRecovery()).toStrictEqual({
      title: MODERATION_RECOVERY_TITLE,
      reason: GENERIC_MODERATION_REASON,
      category: null,
      categoryLabel: null,
      categoryReference: null,
      requestReference: null,
      actionLabel: REVISE_REQUEST_LABEL,
    });
  });

  it("builds the request reference only when a request id exists", () => {
    expect(
      resolveModerationRecovery({
        category: "personal-data",
        requestId: "draft_blocked_1",
      })
    ).toMatchObject({
      requestReference: "Request draft_blocked_1.",
    });
    expect(
      resolveModerationRecovery({ category: "personal-data" })
    ).toMatchObject({ requestReference: null });
  });
});

describe("moderation recovery panel", () => {
  it("renders the title, reason, preserved objective, and one action", () => {
    const objective = "  equivalent fractions\nfor grade 4  ";
    const markup = renderPanel({
      category: "personal-data",
      requestId: "draft_blocked_1",
      objective,
    });

    expect(markup).toContain(`id="blocked-generation"`);
    expect(markup).toContain(MODERATION_RECOVERY_TITLE);
    expect(markup).toContain(
      resolveModerationRecovery({ category: "personal-data" }).reason
    );
    expect(markup).toContain("equivalent fractions\nfor grade 4");
  });

  it("names the blocked request and the category for the panel reference", () => {
    const markup = renderPanel({
      category: "personal-data",
      requestId: "draft_blocked_1",
    });

    expect(markup).toContain("Request draft_blocked_1.");
    expect(markup).toContain(
      "Category: Information about a real person (personal-data)."
    );
    expect(markup).toContain(REVISE_REQUEST_LABEL);
  });

  it("offers exactly one action and no retry control", () => {
    const markup = renderPanel({ category: "harmful-content" });
    const buttons = markup.match(/<button/gu) ?? [];

    expect(buttons).toHaveLength(1);
    expect(markup).not.toMatch(/try that again/iu);
    expect(markup).not.toMatch(/try again/iu);
    expect(markup).not.toMatch(/retry/iu);
  });

  it("never renders an internal diagnostic code or the server hint", () => {
    const markup = renderPanel({ category: "personal-data" });

    expect(markup).not.toContain("MODERATION_BLOCKED");
    expect(markup).not.toContain("MODERATION_REVISION_REQUIRED");
    expect(markup).not.toContain("before trying again");
  });

  it("omits the request reference on the same-prompt error path", () => {
    const markup = renderPanel({ objective: "unsafe prompt content" });

    expect(markup).toContain(GENERIC_MODERATION_REASON);
    expect(markup).not.toContain("blocked-generation-reference");
  });

  it("shows the earlier-draft note only when a draft exists", () => {
    expect(renderPanel({ hasEarlierDraft: true })).toContain(
      "Your earlier draft is unchanged."
    );
    expect(renderPanel({ hasEarlierDraft: false })).not.toContain(
      "Your earlier draft is unchanged."
    );
  });
});
