import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { createDefaultContentSafety } from "@/server/moderation/content-safety";
import { syntheticSeed } from "@/server/seed-data";

/**
#132 bake-off harness. It scores detectors on the same labeled corpus:
the shipped pre-#132 regex (`regex-v0`), the reviewed rule set (`rules-v1`),
and an optional Presidio PII arm.

Presidio covers personal data only, so the harness scores it on personal-data rows and on benign false positives, never on the other categories.

  node --import tsx scripts/moderation-bakeoff.ts <corpus.tsv> [--json]

Set MOD132_PRESIDIO_PYTHON to the venv interpreter to include the PII arm.
*/

const COLUMN_ID = 0;
const COLUMN_SOURCE = 1;
const COLUMN_SPLIT = 2;
const COLUMN_TEXT = 3;
const COLUMN_DECISION = 4;
const COLUMN_CATEGORY = 5;
const COLUMN_NOTES = 6;
const EXPECTED_COLUMNS = 7;

const LATENCY_RUNS = 200;
const PERCENTILE = 0.95;
const MILLISECONDS_PER_SECOND = 1_000_000;
const ROUNDING_FACTOR = 10_000;
const DECIMAL_PLACES = 4;
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const NO_MATCH_SCORE = 1;

type Decision = "allow" | "block";

interface CorpusRow {
  id: string;
  source: string;
  split: string;
  text: string;
  expectedDecision: Decision;
  expectedCategory: string;
  notes: string;
}

interface Prediction {
  allowed: boolean;
  category: string;
}

interface Detector {
  name: string;
  predicts: (row: CorpusRow) => Prediction;
}

interface CategoryScore {
  category: string;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
}

interface DetectorScore {
  detector: string;
  rows: number;
  blockTruePositives: number;
  blockFalsePositives: number;
  blockFalseNegatives: number;
  blockTrueNegatives: number;
  blockPrecision: number;
  blockRecall: number;
  categories: CategoryScore[];
  latencyMeanMs: number;
  latencyP95Ms: number;
  misses: string[];
}

const unescapeText = (value: string): string =>
  value.replaceAll(String.raw`\n`, "\n").replaceAll(String.raw`\t`, "\t");

const parseRow = (line: string): CorpusRow => {
  const columns = line.split("\t");
  if (columns.length < EXPECTED_COLUMNS) {
    throw new Error(`Corpus row has ${columns.length} columns: ${line}`);
  }
  const decision = columns[COLUMN_DECISION];
  if (decision !== "allow" && decision !== "block") {
    throw new Error(`Unknown expected decision: ${decision}`);
  }
  return {
    id: columns[COLUMN_ID] ?? "",
    source: columns[COLUMN_SOURCE] ?? "",
    split: columns[COLUMN_SPLIT] ?? "",
    text: unescapeText(columns[COLUMN_TEXT] ?? ""),
    expectedDecision: decision,
    expectedCategory: columns[COLUMN_CATEGORY] ?? "none",
    notes: columns[COLUMN_NOTES] ?? "",
  };
};

const parseCorpus = (content: string): CorpusRow[] => {
  const [, ...lines] = content.split("\n");
  return lines
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => parseRow(line));
};

const v0MarkupPatterns: readonly RegExp[] = [
  /<\s*\/?(?:script|iframe|object|embed)/iu,
  /javascript\s*:/iu,
];

const v0PersonalPatterns: readonly RegExp[] = [
  /\b[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+\b/u,
  ...syntheticSeed.identities
    .flatMap((identity) => {
      return identity.role === "student"
        ? [identity.displayName, identity.demoHandle]
        : [];
    })
    .map((name) => new RegExp(`\\b${RegExp.escape(name)}\\b`, "iu")),
];

const v0InjectionPatterns: readonly RegExp[] = [
  /ignore\s+(?:all|any|the|previous)\s+instructions/iu,
  /\b(?:api|secret|access)\s+key\b/iu,
];

const regexV0 = (row: CorpusRow): Prediction => {
  const { text } = row;
  if (v0PersonalPatterns.some((pattern) => pattern.test(text))) {
    return { allowed: false, category: "personal-data" };
  }
  if (v0InjectionPatterns.some((pattern) => pattern.test(text))) {
    return { allowed: false, category: "prompt-injection" };
  }
  return v0MarkupPatterns.some((pattern) => pattern.test(text))
    ? { allowed: false, category: "unsafe-markup" }
    : { allowed: true, category: "none" };
};

const shippedSafety = createDefaultContentSafety();

const rulesV1 = (row: CorpusRow): Prediction => {
  const result = shippedSafety.checkPrompt(row.text);
  return { allowed: result.allowed, category: result.category };
};

interface PresidioRow {
  id: string;
  allowed: boolean;
  category: string;
}

const presidioScriptUrl = new URL(
  "../docs/hackathon/meta-global-2026/evidence/moderation-2026-10-31/presidio_scan.py",
  import.meta.url
);

const presidioScriptPath = presidioScriptUrl.pathname;

const readPresidio = (corpusPath: string): Map<string, Prediction> | null => {
  const python = process.env["MOD132_PRESIDIO_PYTHON"];
  if (!python) {
    return null;
  }
  const output = execFileSync(python, [presidioScriptPath, corpusPath], {
    encoding: "utf-8",
    maxBuffer: MAX_BUFFER_BYTES,
  });
  const entries: [string, Prediction][] = output
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const row = JSON.parse(line) as PresidioRow;
      return [row.id, { allowed: row.allowed, category: row.category }];
    });
  return new Map(entries);
};

const round = (value: number): number =>
  Math.round(value * ROUNDING_FACTOR) / ROUNDING_FACTOR;

const ratio = (numerator: number, denominator: number): number =>
  denominator === 0 ? NO_MATCH_SCORE : round(numerator / denominator);

const format = (value: number): string => value.toFixed(DECIMAL_PLACES);

const categoriesIn = (rows: readonly CorpusRow[]): string[] => {
  return [...new Set(rows.map((row) => row.expectedCategory))].toSorted(
    (left, right) => left.localeCompare(right)
  );
};

const emptyCategory = (category: string): CategoryScore => {
  return {
    category,
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0,
    precision: 0,
    recall: 0,
  };
};

const entryFor = (
  scores: CategoryScore[],
  category: string
): CategoryScore | undefined =>
  scores.find((entry) => entry.category === category);

const tallyCategory = (
  scores: CategoryScore[],
  category: string,
  isExpected: boolean,
  isPredicted: boolean
): void => {
  const entry = entryFor(scores, category);
  if (!entry) {
    return;
  }
  if (isExpected && isPredicted) {
    entry.truePositives += 1;
  } else if (isExpected) {
    entry.falseNegatives += 1;
  } else if (isPredicted) {
    entry.falsePositives += 1;
  }
};

interface BlockCounts {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
}

const recordBlock = (
  counts: BlockCounts,
  row: CorpusRow,
  prediction: Prediction,
  misses: string[]
): void => {
  const isExpectedBlock = row.expectedDecision === "block";
  const isPredictedBlock = !prediction.allowed;
  if (isExpectedBlock && isPredictedBlock) {
    counts.truePositives += 1;
    return;
  }
  if (isExpectedBlock) {
    counts.falseNegatives += 1;
    misses.push(`${row.id} expected block, got allow`);
    return;
  }
  if (isPredictedBlock) {
    counts.falsePositives += 1;
    misses.push(`${row.id} expected allow, got ${prediction.category} block`);
    return;
  }
  counts.trueNegatives += 1;
};

const measureLatency = (
  detector: Detector,
  rows: readonly CorpusRow[]
): { meanMs: number; p95Ms: number } => {
  const durations: number[] = [];
  for (let run = 0; run < LATENCY_RUNS; run += 1) {
    for (const row of rows) {
      const started = process.hrtime.bigint();
      detector.predicts(row);
      durations.push(
        Number(process.hrtime.bigint() - started) / MILLISECONDS_PER_SECOND
      );
    }
  }
  const sorted = durations.toSorted((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const percentileIndex = Math.min(
    sorted.length - 1,
    Math.ceil(PERCENTILE * sorted.length) - 1
  );
  return {
    meanMs: total / sorted.length,
    p95Ms: sorted[percentileIndex] ?? 0,
  };
};

const score = (
  detector: Detector,
  rows: readonly CorpusRow[]
): DetectorScore => {
  const categories = categoriesIn(rows);
  const categoryScores = categories.map((category) => emptyCategory(category));
  const misses: string[] = [];
  const counts: BlockCounts = {
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0,
    trueNegatives: 0,
  };

  for (const row of rows) {
    const prediction = detector.predicts(row);
    recordBlock(counts, row, prediction, misses);
    for (const category of categories) {
      tallyCategory(
        categoryScores,
        category,
        row.expectedCategory === category,
        prediction.category === category
      );
    }
  }

  const latency = measureLatency(detector, rows);

  return {
    detector: detector.name,
    rows: rows.length,
    blockTruePositives: counts.truePositives,
    blockFalsePositives: counts.falsePositives,
    blockFalseNegatives: counts.falseNegatives,
    blockTrueNegatives: counts.trueNegatives,
    blockPrecision: ratio(
      counts.truePositives,
      counts.truePositives + counts.falsePositives
    ),
    blockRecall: ratio(
      counts.truePositives,
      counts.truePositives + counts.falseNegatives
    ),
    categories: categoryScores.map((entry) => {
      return {
        ...entry,
        precision: ratio(
          entry.truePositives,
          entry.truePositives + entry.falsePositives
        ),
        recall: ratio(
          entry.truePositives,
          entry.truePositives + entry.falseNegatives
        ),
      };
    }),
    latencyMeanMs: latency.meanMs,
    latencyP95Ms: latency.p95Ms,
    misses,
  };
};

const decisionTable = (scores: readonly DetectorScore[]): string[] => {
  const lines = [
    "## Decision level",
    "",
    "| detector | TP | FP | FN | TN | precision | recall | mean ms | p95 ms |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const entry of scores) {
    lines.push(
      `| ${entry.detector} | ${entry.blockTruePositives} | ${entry.blockFalsePositives} | ${entry.blockFalseNegatives} | ${entry.blockTrueNegatives} | ${format(entry.blockPrecision)} | ${format(entry.blockRecall)} | ${format(entry.latencyMeanMs)} | ${format(entry.latencyP95Ms)} |`
    );
  }
  return lines;
};

const categoryTable = (scores: readonly DetectorScore[]): string[] => {
  const lines = [
    "",
    "## Category level",
    "",
    "| detector | category | TP | FP | FN | precision | recall |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const entry of scores) {
    for (const category of entry.categories) {
      lines.push(
        `| ${entry.detector} | ${category.category} | ${category.truePositives} | ${category.falsePositives} | ${category.falseNegatives} | ${format(category.precision)} | ${format(category.recall)} |`
      );
    }
  }
  return lines;
};

const missList = (scores: readonly DetectorScore[]): string[] => {
  const lines = ["", "## Misses", ""];
  for (const entry of scores) {
    lines.push(`- ${entry.detector}: ${entry.misses.length}`);
    for (const miss of entry.misses) {
      lines.push(`  - ${miss}`);
    }
  }
  return lines;
};

const markdown = (scores: readonly DetectorScore[]): string => {
  return [
    ...decisionTable(scores),
    ...categoryTable(scores),
    ...missList(scores),
  ].join("\n");
};

const readSplit = (): string | undefined => {
  const flag = process.argv.find((value) => value.startsWith("--split="));
  return flag?.slice("--split=".length);
};

const buildDetectors = (
  presidio: Map<string, Prediction> | null
): Detector[] => {
  const detectors: Detector[] = [
    { name: "regex-v0", predicts: regexV0 },
    { name: "rules-v1", predicts: rulesV1 },
  ];
  if (presidio) {
    detectors.push({
      name: "presidio-personal-data",
      predicts: (row) =>
        presidio.get(row.id) ?? { allowed: true, category: "none" },
    });
  }
  return detectors;
};

const main = (): void => {
  const cliArguments = process.argv.slice(2);
  const corpusPath = cliArguments.at(0);
  if (!corpusPath) {
    throw new Error("Usage: moderation-bakeoff.ts <corpus.tsv> [--json]");
  }
  const split = readSplit();
  const rows = parseCorpus(readFileSync(corpusPath, "utf-8")).filter(
    (row) => !split || row.split === split
  );
  const detectors = buildDetectors(readPresidio(corpusPath));
  const scores = detectors.map((detector) => score(detector, rows));

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ corpus: corpusPath, scores }, null, 2));
    return;
  }
  console.log(markdown(scores));
  if (!process.env["MOD132_PRESIDIO_PYTHON"]) {
    console.log(
      "\nPresidio arm skipped: set MOD132_PRESIDIO_PYTHON to a venv interpreter."
    );
  }
};

main();
