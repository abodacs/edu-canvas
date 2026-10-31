import { describe, expect, it } from "vitest";

import {
  artifactCorpus,
  evaluateCorpusArtifact,
} from "@/server/generation/artifact-corpus";
import {
  A2UI_CATALOG_VERSION,
  FRACTIONS_CATALOG_VERSION,
  validateA2UIMessage,
} from "@/shared/a2ui-contract";

import { compileLessonPreview, LessonPreviewCompileError } from "./compiler";
import { compileFractionPreview } from "./fraction-compiler";

import type {
  ArtifactCorpusCase,
  CorpusEvaluation,
} from "@/server/generation/artifact-corpus";
import type { ArtifactGateResult } from "@/server/safety/artifact-gate";
import type { A2UICatalogVersion, A2UIMessage } from "@/shared/a2ui-contract";

// Differential oracle for issue #28. It lives under `src/server/a2ui` because
// the drafting context may not import preview compilation; the reverse
// direction is allowed for test modules by the architecture harness. Every
// fixture and expected verdict comes from `artifact-corpus.ts`.

interface CompileOutcome {
  readonly kind: "accepted" | "rejected" | "refused";
  readonly code?: string;
  readonly reason?: string;
}

const catalogFor = (entry: ArtifactCorpusCase): A2UICatalogVersion => {
  if (entry.messageMutation) {
    return entry.messageMutation.catalogVersion;
  }
  return entry.artifact.kind === "fraction"
    ? FRACTIONS_CATALOG_VERSION
    : A2UI_CATALOG_VERSION;
};

const messagesFor = (entry: ArtifactCorpusCase): A2UIMessage[] => {
  if (entry.artifact.kind === "fraction") {
    return compileFractionPreview({ draft: entry.artifact.draft }).messages;
  }

  const { draft, learningPath, context } = entry.artifact;
  if (!learningPath) {
    throw new Error("The corpus lesson has no validated learning path.");
  }
  return compileLessonPreview({
    requestId: "draft_corpus_oracle",
    grade: context.grade,
    standardId: context.standardId,
    language: context.language,
    draft,
    learningPath,
  }).messages;
};

const messageFailure = (
  messages: readonly A2UIMessage[],
  catalogVersion: A2UICatalogVersion
): CompileOutcome | undefined => {
  for (const message of messages) {
    const validation = validateA2UIMessage(message, { catalogVersion });
    if (!validation.ok) {
      return {
        kind: "rejected",
        code: validation.code,
        reason: validation.message,
      };
    }
  }
  return undefined;
};

const rawCompile = (entry: ArtifactCorpusCase): CompileOutcome => {
  if (entry.artifact.kind === "lesson" && !entry.artifact.learningPath) {
    return {
      kind: "rejected",
      code: "LEARNING_PATH_MISSING",
      reason: "The compile seam requires a validated learning path.",
    };
  }

  let messages: A2UIMessage[];
  try {
    messages = messagesFor(entry);
  } catch (error) {
    const reason = Error.isError(error) ? error.message : String(error);
    if (entry.compileFailure) {
      return { kind: "rejected", code: entry.compileFailure.code, reason };
    }
    return {
      kind: "rejected",
      code:
        error instanceof LessonPreviewCompileError
          ? "PRE_RENDER_BLOCKED"
          : "PRE_RENDER_FAILED",
      reason,
    };
  }

  if (entry.messageMutation) {
    entry.messageMutation.apply(messages);
  }
  return messageFailure(messages, catalogFor(entry)) ?? { kind: "accepted" };
};

/**
 * The enforced pipeline: a hard-blocked artifact has no renderable artifact, so the compile seam is never called. This is the branded rule, not a convention the oracle can skip.
 */
const compileThroughGate = (
  entry: ArtifactCorpusCase,
  gate: ArtifactGateResult
): CompileOutcome => {
  return gate.verdict === "hard_block"
    ? { kind: "refused", code: "HARD_BLOCKED" }
    : rawCompile(entry);
};

interface OracleRow {
  readonly entry: ArtifactCorpusCase;
  readonly evaluation: CorpusEvaluation;
  readonly raw: CompileOutcome;
  readonly enforced: CompileOutcome;
}

const oracleRows = (): Promise<OracleRow[]> => {
  return Promise.all(
    artifactCorpus.map(async (entry) => {
      const evaluation = await evaluateCorpusArtifact(entry);
      return {
        entry,
        evaluation,
        raw: rawCompile(entry),
        enforced: compileThroughGate(entry, evaluation.gate),
      };
    })
  );
};

const describeFailure = (entry: ArtifactCorpusCase, detail: string): string =>
  `${entry.id}: ${detail}`;

const rawOutcomeFailures = (
  entry: ArtifactCorpusCase,
  raw: CompileOutcome
): string[] => {
  const failures: string[] = [];
  if (entry.compileOutcome === "accept" && raw.kind !== "accepted") {
    failures.push(
      describeFailure(
        entry,
        `raw compile ${raw.kind}, expected accepted (${raw.code ?? ""})`
      )
    );
  }
  if (entry.compileOutcome === "reject" && raw.kind !== "rejected") {
    failures.push(
      describeFailure(entry, `raw compile ${raw.kind}, expected rejected`)
    );
  }
  if (
    raw.kind === "rejected" &&
    entry.compileFailure &&
    !entry.compileFailure.messagePattern.test(raw.reason ?? "")
  ) {
    failures.push(
      describeFailure(
        entry,
        `compile failure did not match ${String(entry.compileFailure.messagePattern)}: ${raw.reason ?? ""}`
      )
    );
  }
  return failures;
};

const compileAgreementFailures = (
  entry: ArtifactCorpusCase,
  evaluation: CorpusEvaluation,
  raw: CompileOutcome,
  enforced: CompileOutcome
): string[] => {
  const failures: string[] = [];
  const isGateBlocked = evaluation.gate.verdict === "hard_block";

  if (!isGateBlocked && raw.kind === "rejected") {
    failures.push(
      describeFailure(entry, "compile rejected an artifact the gate passed")
    );
  }
  if (!isGateBlocked && raw.kind !== "accepted") {
    failures.push(
      describeFailure(entry, "the gate accepted but the compile guard did not")
    );
  }
  if (!isGateBlocked && enforced.kind !== "accepted") {
    failures.push(
      describeFailure(entry, "the enforced pipeline did not compile")
    );
  }
  if (isGateBlocked && enforced.kind !== "refused") {
    failures.push(
      describeFailure(entry, "a hard-blocked artifact reached the compile seam")
    );
  }
  return failures;
};

describe("artifact gate differential oracle", () => {
  it("every corpus entry matches its expected verdict and named rule", async () => {
    const rows = await oracleRows();
    const failures: string[] = [];

    for (const { entry, evaluation } of rows) {
      const { gate } = evaluation;
      if (gate.verdict !== entry.expectedVerdict) {
        failures.push(
          describeFailure(
            entry,
            `verdict ${gate.verdict}, expected ${entry.expectedVerdict}`
          )
        );
      }

      const shouldRender = entry.expectedVerdict !== "hard_block";
      if (shouldRender !== (gate.renderable !== null)) {
        failures.push(
          describeFailure(
            entry,
            shouldRender
              ? "expected a renderable artifact"
              : "expected renderable to be null"
          )
        );
      }

      for (const expectation of entry.expectedFindings) {
        const matched = gate.findings.some((finding) => {
          return (
            finding.code === expectation.code &&
            finding.validator === expectation.validator &&
            finding.recovery === expectation.recovery
          );
        });
        if (!matched) {
          failures.push(
            describeFailure(
              entry,
              `missing ${expectation.validator} finding ${expectation.code} (${expectation.recovery})`
            )
          );
        }
      }
    }

    expect(failures).toStrictEqual([]);
  });

  it("records every raw compile outcome and refuses to compile a hard block", async () => {
    const rows = await oracleRows();
    const failures = rows.flatMap((row) => {
      return [
        ...rawOutcomeFailures(row.entry, row.raw),
        ...compileAgreementFailures(
          row.entry,
          row.evaluation,
          row.raw,
          row.enforced
        ),
      ];
    });

    expect(failures).toStrictEqual([]);
  });

  it("keeps the compile guard weaker only where the gate documents the stricter seam", async () => {
    const rows = await oracleRows();
    const failures: string[] = [];

    for (const { entry, evaluation, raw } of rows) {
      const isStricter =
        raw.kind === "accepted" && evaluation.gate.verdict === "hard_block";
      if (!isStricter) {
        continue;
      }

      // The compile guard only sees the rendered projection. A draft or
      // semantic rule it cannot observe is stricter by design; every such
      // case names the reason in the corpus table instead of weakening the
      // gate to make the seams agree.
      if (!entry.stricterThanCompile) {
        failures.push(
          describeFailure(
            entry,
            "compile accepted a hard-blocked artifact without a recorded reason"
          )
        );
      }
      if (entry.rejectingSeams.includes("compile")) {
        failures.push(
          describeFailure(
            entry,
            "a compile-rejecting entry cannot be stricter than the compile guard"
          )
        );
      }
    }

    expect(failures).toStrictEqual([]);
  });

  it("does not hard-block an artifact the gate accepted for rendering", async () => {
    const rows = await oracleRows();
    const failures: string[] = [];

    for (const { entry, evaluation, raw } of rows) {
      if (evaluation.gate.verdict === "hard_block") {
        continue;
      }
      if (evaluation.structural.verdict === "hard_block") {
        failures.push(
          describeFailure(
            entry,
            "the draft gate hard-blocked an accepted artifact"
          )
        );
      }
      if (evaluation.semantic.verdict === "hard_block") {
        failures.push(
          describeFailure(
            entry,
            "the semantic gate hard-blocked an accepted artifact"
          )
        );
      }
      if (raw.kind !== "accepted") {
        failures.push(
          describeFailure(
            entry,
            "the compile guard rejected an accepted artifact"
          )
        );
      }
    }

    expect(failures).toStrictEqual([]);
  });

  it("re-evaluates every corpus artifact to the same verdict, findings, and hash", async () => {
    const evaluations = await Promise.all(
      artifactCorpus.map(async (entry) => {
        return {
          entry,
          first: await evaluateCorpusArtifact(entry),
          second: await evaluateCorpusArtifact(entry),
        };
      })
    );
    const failures: string[] = [];

    for (const { entry, first, second } of evaluations) {
      if (second.gate.verdict !== first.gate.verdict) {
        failures.push(describeFailure(entry, "verdict changed on rerun"));
      }
      if (second.gate.artifactHash !== first.gate.artifactHash) {
        failures.push(describeFailure(entry, "artifact hash changed on rerun"));
      }
      if (second.gate.recovery !== first.gate.recovery) {
        failures.push(describeFailure(entry, "recovery changed on rerun"));
      }
      if (second.gate.policyVersion !== first.gate.policyVersion) {
        failures.push(
          describeFailure(entry, "policy version changed on rerun")
        );
      }
      if (
        JSON.stringify(second.gate.findings) !==
        JSON.stringify(first.gate.findings)
      ) {
        failures.push(describeFailure(entry, "findings changed on rerun"));
      }
    }

    expect(failures).toStrictEqual([]);
  });
});
