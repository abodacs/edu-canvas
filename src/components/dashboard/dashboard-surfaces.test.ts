import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  NeedsYouPanel,
  ProgressEmpty,
  ProgressLoading,
  ProgressMissingRun,
  ProgressPermission,
  ProgressServerError,
  ProgressStale,
  ProgressTable,
  ProvisionalNotice,
  RunDetail,
} from "./dashboard-surfaces";
import { purposeLabel, stageStatus } from "./purpose-copy";
import { runStageValues } from "@/shared/learner-contract";
import type { ProgressRun } from "@/shared/progress-contract";

const render = (element: React.ReactElement): string =>
  renderToStaticMarkup(element);

const noop = (): void => undefined;

type DecisionShape = NonNullable<ProgressRun["decision"]>;
type AttemptShape = ProgressRun["attempts"][number];
type PreviewShape = NonNullable<ProgressRun["preview"]>;
type DecisionPurpose = DecisionShape["purpose"];

const preview: PreviewShape = {
  lessonVersionId: "version_1",
  variantId: "variant_standard",
  section: {
    id: "section_1",
    kind: "independent-check",
    title: "Independent check",
    body: "Complete the matching on your own.",
    itemIds: ["item_1", "target_1", "target_2"],
    items: [
      { id: "item_1", label: "1/2", role: "source" },
      { id: "target_1", label: "2/4", role: "target" },
    ],
  },
  columns: { sourceLabel: "Fractions", targetLabel: "Equivalents" },
};

const attempt = (
  ordinal: number,
  overrides: Partial<AttemptShape> = {}
): AttemptShape => {
  return {
    attemptId: `attempt_${ordinal}`,
    itemId: "item_1",
    ordinal,
    priorAttemptId: ordinal === 1 ? null : `attempt_${ordinal - 1}`,
    score: 80,
    correctness: "partial",
    assistanceState: "none",
    assistanceEventIds: [],
    createdAt: "2026-10-28T00:00:00.000Z",
    ...overrides,
  };
};

const decision = (purpose: DecisionPurpose): DecisionShape => {
  return {
    activityId: purpose === "pause" ? null : "variant_scaffold",
    activityAxis: "variant-kind",
    purpose,
    reason: "The learner needs another supported example.",
    ruleVersion: "next-activity-rule-abc123",
    evidenceHash: "a".repeat(64),
    derivedFromAttemptId: "attempt_1",
  };
};

const run = (overrides: Partial<ProgressRun> = {}): ProgressRun => {
  return {
    runId: "run_1",
    assignmentId: "assignment_1",
    learnerId: "learner_lina",
    publicationId: "publication_1",
    assignedVariantId: "variant_standard",
    stage: "active",
    firstResponseStatus: "submitted",
    revision: 3,
    updatedAt: "2026-10-28T00:00:00.000Z",
    attempts: [attempt(1)],
    decision: decision("scaffold"),
    preview,
    ...overrides,
  };
};

describe(purposeLabel, () => {
  const purposes = [
    "pause",
    "scaffold",
    "standard",
    "challenge",
    "teacher-choice",
  ] as const;

  it("names a distinct routing for every stored purpose", () => {
    const labels = purposes.map((purpose) => purposeLabel(purpose));
    const distinct = new Set(labels);

    expect(distinct.size).toBe(purposes.length);
    expect(labels).toStrictEqual([
      "Waiting for the first response",
      "Needs another supported go",
      "Ready for more independent practice",
      "Ready for a harder challenge",
      "You chose this activity",
    ]);
  });
});

describe(stageStatus, () => {
  it("names every stored run stage in words and never as a failure", () => {
    const statuses = runStageValues.map((stage) => stageStatus(stage));

    expect(new Set(statuses.map((status) => status.label)).size).toBe(
      runStageValues.length
    );
    expect(statuses.some((status) => status.tone === "stop")).toBeFalsy();
  });
});

describe(ProvisionalNotice, () => {
  it("labels the view observational, never a diagnosis", () => {
    const markup = render(createElement(ProvisionalNotice));

    expect(markup).toContain("Observational evidence");
    expect(markup).toContain("not a mastery diagnosis");
  });
});

describe(NeedsYouPanel, () => {
  it("lists the scaffold-routed runs with their stored reason", () => {
    const markup = render(
      createElement(NeedsYouPanel, { runs: [run()], onOpen: noop })
    );

    expect(markup).toContain("Needs you · 1");
    expect(markup).toContain("Learner learner_lina");
    expect(markup).toContain("The learner needs another supported example.");
    expect(markup).toContain("See results");
  });

  it("renders nothing when no run needs the teacher", () => {
    const markup = render(
      createElement(NeedsYouPanel, { runs: [], onOpen: noop })
    );

    expect(markup).toBe("");
  });

  it("keeps a run out of the panel when its decision is not scaffold", () => {
    const markup = render(
      createElement(NeedsYouPanel, {
        runs: [run({ decision: decision("standard") })],
        onOpen: noop,
      })
    );

    expect(markup).toBe("");
  });
});

describe(ProgressTable, () => {
  it("renders the results list with attempts, next step, and an open action", () => {
    const markup = render(
      createElement(ProgressTable, { runs: [run()], onOpen: noop })
    );

    expect(markup).toContain("Learner learner_lina");
    expect(markup).toContain("First response: partial");
    expect(markup).toContain("1 attempt · latest score 80");
    expect(markup).toContain("Needs another supported go");
    expect(markup).toContain("Open");
  });

  it("names the run stage in a status pill", () => {
    const markup = render(
      createElement(ProgressTable, { runs: [run()], onOpen: noop })
    );

    expect(markup).toMatch(/class="pill"[^>]*>In progress</u);
  });

  it("renders a not-started row without inventing a result", () => {
    const markup = render(
      createElement(ProgressTable, {
        runs: [
          run({
            attempts: [],
            decision: null,
            firstResponseStatus: "pending",
          }),
        ],
        onOpen: noop,
      })
    );

    expect(markup).toContain("Not started");
    expect(markup).toContain("Waiting for evidence");
    expect(markup).not.toContain("score");
  });
});

describe(RunDetail, () => {
  it("renders the stored reason verbatim with rule version and evidence hash", () => {
    const markup = render(createElement(RunDetail, { run: run() }));

    expect(markup).toContain("The learner needs another supported example.");
    expect(markup).toContain("next-activity-rule-abc123");
    expect(markup).toContain("a".repeat(64));
  });

  it("keeps first response, assistance, and retries distinct", () => {
    const markup = render(
      createElement(RunDetail, {
        run: run({
          attempts: [
            attempt(1, {
              assistanceState: "hinted",
              assistanceEventIds: ["event_1"],
            }),
            attempt(2, { score: 100, correctness: "correct" }),
          ],
        }),
      })
    );

    expect(markup).toContain("First response");
    expect(markup).toContain("Retry 1");
    expect(markup).toContain("with help");
    expect(markup).toContain("on their own");
  });

  it("offers the read-only preview of the approved screen", () => {
    const markup = render(createElement(RunDetail, { run: run() }));

    expect(markup).toContain("Open a read-only preview of the approved screen");
    expect(markup).toContain("Independent check");
    expect(markup).toContain("Fractions to Equivalents");
    expect(markup).toContain("1/2");
  });

  it("names the no-decision and no-preview states honestly", () => {
    const markup = render(
      createElement(RunDetail, {
        run: run({ decision: null, preview: null, attempts: [] }),
      })
    );

    expect(markup).toContain("No decision is stored yet.");
    expect(markup).toContain("not available to preview");
    expect(markup).toContain("No attempt is recorded yet.");
  });
});

describe("designed teacher states (issue #8 AC6)", () => {
  it("renders the before-data screens: loading and empty", () => {
    const loading = render(createElement(ProgressLoading));
    const empty = render(createElement(ProgressEmpty));

    expect(loading).toContain("Loading results…");
    expect(empty).toContain("No learner results yet");
    expect(empty).toContain("Nothing is shown until then.");
  });

  it("renders the missing-assignment and permission screens", () => {
    const missing = render(createElement(ProgressMissingRun));
    const permission = render(createElement(ProgressPermission));

    expect(missing).toContain("This result is not on your roster");
    expect(permission).toContain("Teacher sign-in required");
  });

  it("renders the server-error screen with a retry action and the stale marker", () => {
    const failure = render(
      createElement(ProgressServerError, { onRetry: noop })
    );
    const stale = render(createElement(ProgressStale));

    expect(failure).toContain("Results are unavailable right now");
    expect(failure).toContain("Try again");
    expect(stale).toContain("New learner activity since you opened this page");
  });

  it("gives every designed state an intentional class instead of a generic error", () => {
    const states = [
      ProgressLoading,
      ProgressEmpty,
      ProgressMissingRun,
      ProgressPermission,
    ];
    const markups = states.map((state) => render(createElement(state)));

    for (const markup of markups) {
      expect(markup).toContain("progress-state");
    }
  });
});

describe("dashboard styles", () => {
  const stylesUrl = new URL("../../styles/progress.css", import.meta.url);
  const styles = readFileSync(stylesUrl, "utf-8");
  const marker = styles.indexOf("/* #8 teacher progress dashboard");
  const progressBlock = styles.slice(marker);

  it("reads the progress block it checks", () => {
    expect(marker).toBeGreaterThanOrEqual(0);
  });

  it("adds no animation to the progress surfaces", () => {
    expect(progressBlock).not.toMatch(
      /\banimation\b|\btransition\b|@keyframes/u
    );
  });
});
