/**
Measured run for the async advisory reviewer (#223).

Commands:
  record   Call the Meta advisory reviewer for the provisional K cases, write
           docs/research/standards-generalization/advisory-review.json and
           refresh the README table between the advisory-review markers.
  check    Offline: verify the committed evidence invariants.

The run never reads, prints, or writes a credential. Only the provider name,
the model id, and the base URL are recorded.

The reviewer is advisory by design: it runs after a draft reaches
ready-for-review. The blocked cases here are a discrimination probe — they test
whether the model notices a planted defect — not a product path. The shipped
service refuses every record that is not ready-for-review.
*/

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  advisoryReviewTimeoutMs,
  advisoryReviewerVersion,
} from "@/server/generation/advisory-review-contract";
import {
  classifyAdvisoryReviewFailure,
  runBoundedAdvisoryReview,
} from "@/server/generation/advisory-review-runner";
import { createMetaAdvisoryReviewAgent } from "@/server/generation/advisory-review-agent";
import { buildAdvisoryReviewEvalCases } from "@/server/generation/advisory-review-eval-cases";
import { toNormalizedReasoningPath } from "@/server/generation/learning-path";
import {
  cloneSemanticValidationInput,
  sanitizedRecommendations,
} from "@/server/generation/semantic-validation-utilities";
import type { AdvisoryReviewEvalCase } from "@/server/generation/advisory-review-eval-cases";
import type { AdvisoryReviewFinding } from "@/shared/generation-contract";

const { join } = path;

const EVIDENCE_DIRECTORY = "docs/research/standards-generalization";
const EVIDENCE_FILE = "advisory-review.json";
const README_FILE = "README.md";
const START_MARKER = "<!-- advisory-review:start -->";
const END_MARKER = "<!-- advisory-review:end -->";
const KEY_ENV = "META_API_KEY";
const MODEL_ENV = "META_MODEL";
const BASE_URL_ENV = "META_BASE_URL";
const DEFAULT_MODEL = "muse-spark-1.2-contributor";
const DEFAULT_BASE_URL = "https://api.meta.ai/v1";
const MAXIMUM_CASES = 12;
const USAGE_EXIT_CODE = 2;
const FAILURE_EXIT_CODE = 1;

type AdvisoryVerdict = "pass" | "warning" | "failed";

interface CaseEvidence {
  id: string;
  kind: "control" | "defect";
  source: string;
  standardCode: string;
  deterministic: {
    state: "ready-for-review" | "blocked-by-validation";
    codes: string[];
  };
  advisory: {
    verdict: AdvisoryVerdict;
    status: "complete" | "failed";
    findingCount: number;
    latencyMs: number;
    failureClass: string | null;
    findings: AdvisoryReviewFinding[];
  };
  /**
  The reviewer corroborated the deterministic gate: it flagged a draft the gate
  blocked, or stayed quiet on a draft the gate accepted.
  */
  agreesWithGate: boolean;
}

interface Evidence {
  schemaVersion: 1;
  generatedAt: string;
  provider: {
    provider: "meta";
    model: string;
    baseUrl: string;
    validatorVersion: string;
    boundMs: number;
  };
  caseCount: number;
  summary: {
    defectCases: number;
    defectRecall: string;
    controlCases: number;
    controlFalseAlarms: string;
    agreement: string;
    failures: number;
    meanLatencyMs: number;
    maximumLatencyMs: number;
  };
  cases: CaseEvidence[];
}

const loadEnvironment = (): void => {
  if (process.env[KEY_ENV] || !existsSync(".env")) {
    return;
  }
  process.loadEnvFile(".env");
};

const requireConfiguration = (): {
  apiKey: string;
  model: string;
  baseUrl: string;
} => {
  const apiKey = process.env[KEY_ENV]?.trim();
  if (!apiKey) {
    throw new Error(
      `${KEY_ENV} is required for a measured run. The evidence cannot be produced offline.`
    );
  }
  return {
    apiKey,
    model: process.env[MODEL_ENV]?.trim() || DEFAULT_MODEL,
    baseUrl: process.env[BASE_URL_ENV]?.trim() || DEFAULT_BASE_URL,
  };
};

const ratio = (matching: number, total: number): string => {
  return total === 0 ? "n/a" : `${matching}/${total}`;
};

const summarize = (cases: readonly CaseEvidence[]): Evidence["summary"] => {
  const defects = cases.filter((entry) => entry.kind === "defect");
  const controls = cases.filter((entry) => entry.kind === "control");
  const defectHits = defects.filter((entry) => entry.agreesWithGate).length;
  const controlHits = controls.filter((entry) => entry.agreesWithGate).length;
  const agreements = cases.filter((entry) => entry.agreesWithGate).length;
  const latencies = cases.map((entry) => entry.advisory.latencyMs);

  return {
    defectCases: defects.length,
    defectRecall: ratio(defectHits, defects.length),
    controlCases: controls.length,
    controlFalseAlarms: ratio(controls.length - controlHits, controls.length),
    agreement: ratio(agreements, cases.length),
    failures: cases.filter((entry) => entry.advisory.status === "failed")
      .length,
    meanLatencyMs:
      latencies.length === 0
        ? 0
        : Math.round(
            latencies.reduce((total, value) => total + value, 0) /
              latencies.length
          ),
    maximumLatencyMs: Math.max(0, ...latencies),
  };
};

const runCase = async (
  evalCase: AdvisoryReviewEvalCase,
  agent: ReturnType<typeof createMetaAdvisoryReviewAgent>
): Promise<CaseEvidence> => {
  const input = cloneSemanticValidationInput({
    draft: { variants: evalCase.draft.variants },
    context: evalCase.context,
    ...(evalCase.draft.learningPath && {
      path: toNormalizedReasoningPath(evalCase.draft.learningPath),
    }),
  });

  const deterministicBlocked =
    evalCase.deterministicState === "blocked-by-validation";
  const base = {
    id: evalCase.id,
    kind: evalCase.kind,
    source: evalCase.source,
    standardCode: evalCase.standardCode,
    deterministic: {
      state: evalCase.deterministicState,
      codes: [...evalCase.deterministicCodes],
    },
  };

  try {
    const run = await runBoundedAdvisoryReview(
      agent,
      input,
      advisoryReviewTimeoutMs
    );
    const findings = sanitizedRecommendations(run.recommendations);
    const verdict: AdvisoryVerdict = findings.length > 0 ? "warning" : "pass";
    return {
      ...base,
      advisory: {
        verdict,
        status: "complete",
        findingCount: findings.length,
        latencyMs: run.latencyMs,
        failureClass: null,
        findings,
      },
      agreesWithGate: deterministicBlocked === findings.length > 0,
    };
  } catch (error) {
    const failure = classifyAdvisoryReviewFailure(error);
    return {
      ...base,
      advisory: {
        verdict: "failed",
        status: "failed",
        findingCount: 0,
        latencyMs: 0,
        failureClass: failure.class,
        findings: [],
      },
      // A failed review proves nothing about agreement.
      agreesWithGate: false,
    };
  }
};

const tableFor = (evidence: Evidence): string => {
  const rows = evidence.cases.map((entry) => {
    return [
      `\`${entry.id}\``,
      entry.source,
      entry.deterministic.state,
      entry.advisory.verdict,
      entry.agreesWithGate ? "yes" : "no",
      `${entry.advisory.latencyMs} ms`,
      entry.advisory.failureClass ?? "—",
    ].join(" | ");
  });

  return [
    START_MARKER,
    "",
    `Measured ${evidence.generatedAt} with \`${evidence.provider.model}\` ` +
      `(${evidence.provider.provider}, bound ${evidence.provider.boundMs} ms) on ` +
      `${evidence.caseCount} provisional cases. No credential is recorded.`,
    "",
    "| Case | Draft source | Deterministic gate | Advisory verdict | Agrees | Latency | Failure class |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row} |`),
    "",
    `Agreement ${evidence.summary.agreement}; defect recall ` +
      `${evidence.summary.defectRecall}; control false alarms ` +
      `${evidence.summary.controlFalseAlarms}; failures ` +
      `${evidence.summary.failures}; mean latency ` +
      `${evidence.summary.meanLatencyMs} ms (max ${evidence.summary.maximumLatencyMs} ms).`,
    "",
    "A defect case is a planted wrong pair; the deterministic gate blocks it. A control",
    "case is a pack draft the gate accepts. The shipped reviewer only runs on",
    "`ready-for-review` drafts, so the defect cases are a discrimination probe, not a",
    "product path. Agreement means the advisory verdict matched the gate: a warning on",
    "a blocked draft, or no warning on an accepted draft.",
    "",
    END_MARKER,
  ].join("\n");
};

const writeReadmeTable = async (evidence: Evidence): Promise<void> => {
  const readmePath = join(EVIDENCE_DIRECTORY, README_FILE);
  const current = await readFile(readmePath, "utf-8");
  const start = current.indexOf(START_MARKER);
  const end = current.indexOf(END_MARKER);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `The research record needs ${START_MARKER} … ${END_MARKER} before the script can write the table.`
    );
  }

  const next = `${current.slice(0, start)}${tableFor(evidence)}${current.slice(
    end + END_MARKER.length
  )}`;
  await writeFile(readmePath, next, "utf-8");
};

const recordEvidence = async (): Promise<number> => {
  loadEnvironment();
  const configuration = requireConfiguration();
  const agent = createMetaAdvisoryReviewAgent({
    apiKey: configuration.apiKey,
    model: configuration.model,
    version: advisoryReviewerVersion,
    baseUrl: configuration.baseUrl,
    timeoutMs: advisoryReviewTimeoutMs,
  });

  const evalCases = await buildAdvisoryReviewEvalCases();
  if (evalCases.length > MAXIMUM_CASES) {
    throw new Error(`The run allows at most ${MAXIMUM_CASES} cases.`);
  }

  const cases: CaseEvidence[] = [];
  for (const evalCase of evalCases) {
    // Sequential on purpose: one teacher request at a time is what the route
    // does, and concurrent calls would distort the latencies.
    // eslint-disable-next-line no-await-in-loop
    cases.push(await runCase(evalCase, agent));
    process.stderr.write(`[advisory-review] ${evalCase.id}\n`);
  }

  const evidence: Evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provider: {
      provider: "meta",
      model: configuration.model,
      baseUrl: configuration.baseUrl,
      validatorVersion: advisoryReviewerVersion,
      boundMs: advisoryReviewTimeoutMs,
    },
    caseCount: cases.length,
    summary: summarize(cases),
    cases,
  };

  await writeFile(
    join(EVIDENCE_DIRECTORY, EVIDENCE_FILE),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf-8"
  );
  await writeReadmeTable(evidence);

  process.stdout.write(
    `${JSON.stringify(evidence.summary, null, 2)}\n${join(
      EVIDENCE_DIRECTORY,
      EVIDENCE_FILE
    )}\n`
  );
  return evidence.summary.failures === evidence.caseCount
    ? FAILURE_EXIT_CODE
    : 0;
};

const looksLikeCredential = (value: unknown): boolean => {
  if (typeof value === "string") {
    return /^sk-[A-Za-z0-9_-]{16,}$|^[A-Za-z0-9_-]{40,}$/u.test(value.trim());
  }
  if (Array.isArray(value)) {
    return value.some(looksLikeCredential);
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).some(([key, child]) => {
      return /api[-_]?key|authorization|secret/iu.test(key)
        ? true
        : looksLikeCredential(child);
    });
  }
  return false;
};

const caseIssues = (entry: CaseEvidence): string[] => {
  const issues: string[] = [];
  const { advisory } = entry;

  if (!entry.id || !advisory || typeof entry.agreesWithGate !== "boolean") {
    return [`case ${entry.id ?? "(missing id)"} is incomplete`];
  }
  if (advisory.status === "complete" && advisory.failureClass !== null) {
    issues.push(
      `case ${entry.id} reports a failure class on a complete review`
    );
  }
  if (
    advisory.status === "failed" &&
    (advisory.failureClass === null || advisory.findings.length > 0)
  ) {
    issues.push(`case ${entry.id} reports an incomplete failure record`);
  }
  return issues;
};

const evidenceIssues = (evidence: Evidence): string[] => {
  const issues: string[] = [];

  if (evidence.caseCount > MAXIMUM_CASES) {
    issues.push(`caseCount ${evidence.caseCount} exceeds ${MAXIMUM_CASES}`);
  }
  if (evidence.cases?.length !== evidence.caseCount) {
    issues.push("caseCount does not match the recorded cases");
  }
  for (const entry of evidence.cases ?? []) {
    issues.push(...caseIssues(entry));
  }
  if (looksLikeCredential(evidence)) {
    issues.push("the evidence contains a credential-like value");
  }
  return issues;
};

const checkEvidence = async (): Promise<number> => {
  const raw = await readFile(join(EVIDENCE_DIRECTORY, EVIDENCE_FILE), "utf-8");
  const parsed = JSON.parse(raw) as unknown;

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("The advisory-review evidence is not a JSON object.");
  }
  const evidence = parsed as Evidence;
  const issues = evidenceIssues(evidence);

  if (issues.length > 0) {
    process.stderr.write(`FAIL advisory-review evidence\n`);
    for (const issue of issues) {
      process.stderr.write(`- ${issue}\n`);
    }
    return FAILURE_EXIT_CODE;
  }

  process.stdout.write(
    `OK advisory-review evidence: ${evidence.caseCount} cases, agreement ${evidence.summary.agreement}, failures ${evidence.summary.failures}\n`
  );
  return 0;
};

const main = async (): Promise<number> => {
  const command = process.argv[2] ?? "record";
  switch (command) {
    case "record": {
      return await recordEvidence();
    }
    case "check": {
      return await checkEvidence();
    }
    default: {
      process.stderr.write(
        `Unknown command ${command}. Use record or check.\n`
      );
      return USAGE_EXIT_CODE;
    }
  }
};

process.exitCode = await main();
