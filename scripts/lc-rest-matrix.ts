/**
 Runs the eight pilot rows and the ELA boundary against the live Learning
 Commons REST API and records the result as evidence (#218).

   node --import tsx scripts/lc-rest-matrix.ts

 Requires `LEARNING_COMMONS_API_KEY`. The script never prints the key, never
 records a raw provider body, and writes only facts the adapter already
 exposes (standard id, description hash, counts, codes, gaps, latency).

 Evidence output:
   docs/research/standards-generalization/live-matrix.json
   docs/research/standards-generalization/live-matrix.md
*/

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createLearningCommonsAdapter,
  createLearningCommonsRestTransport,
} from "@/server/grounding/standards/learning-commons-rest";
import { StandardGroundingError } from "@/server/grounding/standards/types";

import type { StandardResolution } from "@/server/grounding/standards/types";

const EVIDENCE_DIRECTORY = path.join(
  "docs",
  "research",
  "standards-generalization"
);
const EVIDENCE_JSON = path.join(EVIDENCE_DIRECTORY, "live-matrix.json");
const EVIDENCE_MARKDOWN = path.join(EVIDENCE_DIRECTORY, "live-matrix.md");
const ROW_DEADLINE_MS = 20_000;

interface MatrixRow {
  readonly id: string;
  readonly jurisdiction: string;
  readonly statementCode: string;
}

interface ExpectedRow {
  readonly componentCount: number;
  readonly prerequisiteResolution: "direct" | "crosswalk" | "unavailable";
  readonly prerequisiteCodes: readonly string[];
  readonly gapClasses: readonly string[];
}

const PILOT_ROWS: readonly MatrixRow[] = [
  {
    id: "multi-state-4.NF.A.1",
    jurisdiction: "Multi-State",
    statementCode: "4.NF.A.1",
  },
  {
    id: "multi-state-4.NF.A.2",
    jurisdiction: "Multi-State",
    statementCode: "4.NF.A.2",
  },
  {
    id: "multi-state-3.NF.A.3",
    jurisdiction: "Multi-State",
    statementCode: "3.NF.A.3",
  },
  {
    id: "multi-state-4.OA.A.3",
    jurisdiction: "Multi-State",
    statementCode: "4.OA.A.3",
  },
  {
    id: "california-4.NF.A.1",
    jurisdiction: "California",
    statementCode: "4.NF.A.1",
  },
  {
    id: "california-4.NF.A.2",
    jurisdiction: "California",
    statementCode: "4.NF.A.2",
  },
  {
    id: "california-3.NF.A.3",
    jurisdiction: "California",
    statementCode: "3.NF.A.3",
  },
  {
    id: "california-4.OA.A.3",
    jurisdiction: "California",
    statementCode: "4.OA.A.3",
  },
];

const BOUNDARY_ROWS: readonly MatrixRow[] = [
  {
    id: "multi-state-RI.5.2",
    jurisdiction: "Multi-State",
    statementCode: "RI.5.2",
  },
];

const EXPECTED: Readonly<Record<string, ExpectedRow>> = {
  "multi-state-4.NF.A.1": {
    componentCount: 5,
    prerequisiteResolution: "direct",
    prerequisiteCodes: ["4.OA.A.2", "3.NF.A.3"],
    gapClasses: [],
  },
  "multi-state-4.NF.A.2": {
    componentCount: 7,
    prerequisiteResolution: "direct",
    prerequisiteCodes: ["4.NF.A.1"],
    gapClasses: [],
  },
  "multi-state-3.NF.A.3": {
    componentCount: 2,
    prerequisiteResolution: "direct",
    prerequisiteCodes: ["3.NF.A.1", "3.NF.A.2"],
    gapClasses: [],
  },
  "multi-state-4.OA.A.3": {
    componentCount: 18,
    prerequisiteResolution: "direct",
    prerequisiteCodes: ["4.NBT.A.3", "4.NBT.B.6", "3.OA.D.8"],
    gapClasses: [],
  },
  "california-4.NF.A.1": {
    componentCount: 5,
    prerequisiteResolution: "crosswalk",
    prerequisiteCodes: ["4.OA.A.2", "3.NF.A.3"],
    gapClasses: [],
  },
  "california-4.NF.A.2": {
    componentCount: 7,
    prerequisiteResolution: "crosswalk",
    prerequisiteCodes: ["4.NF.A.1"],
    gapClasses: [],
  },
  "california-3.NF.A.3": {
    componentCount: 2,
    prerequisiteResolution: "crosswalk",
    prerequisiteCodes: ["3.NF.A.1", "3.NF.A.2"],
    gapClasses: [],
  },
  "california-4.OA.A.3": {
    componentCount: 18,
    prerequisiteResolution: "crosswalk",
    prerequisiteCodes: ["4.NBT.A.3", "4.NBT.B.6", "3.OA.D.8"],
    gapClasses: [],
  },
  "multi-state-RI.5.2": {
    componentCount: 0,
    prerequisiteResolution: "unavailable",
    prerequisiteCodes: [],
    gapClasses: ["skills-missing", "prerequisites-unavailable"],
  },
};

interface RowEvidence {
  readonly id: string;
  readonly jurisdiction: string;
  readonly statementCode: string;
  readonly found: boolean;
  readonly standardId: string | null;
  readonly descriptionHash: string | null;
  readonly contentHash: string | null;
  readonly componentCount: number;
  readonly prerequisiteResolution: "direct" | "crosswalk" | "unavailable";
  readonly prerequisiteCodes: readonly string[];
  readonly prerequisiteMatchTypes: readonly string[];
  readonly gapClasses: readonly string[];
  readonly latencyMs: number;
  readonly errorCode: string | null;
}

const loadApiKey = (): string => {
  if (process.env.LEARNING_COMMONS_API_KEY === undefined) {
    try {
      process.loadEnvFile(".env");
    } catch {
      // A missing .env is reported by the required-key check below.
    }
  }
  const key = process.env.LEARNING_COMMONS_API_KEY?.trim();
  if (!key) {
    console.error(
      "LEARNING_COMMONS_API_KEY is required. No live request was made."
    );
    process.exit(1);
  }
  return key;
};

const readRow = (
  row: MatrixRow,
  resolution: StandardResolution,
  latencyMs: number
): RowEvidence => {
  return {
    id: row.id,
    jurisdiction: row.jurisdiction,
    statementCode: row.statementCode,
    found: resolution.standardId !== null,
    standardId: resolution.standardId,
    descriptionHash: resolution.descriptionHash,
    contentHash: resolution.contentHash,
    componentCount: resolution.components.length,
    prerequisiteResolution: resolution.prerequisiteResolution,
    prerequisiteCodes: resolution.prerequisites.map((prerequisite) => {
      return prerequisite.statementCode;
    }),
    prerequisiteMatchTypes: resolution.prerequisites.map((prerequisite) => {
      return prerequisite.matchType;
    }),
    gapClasses: resolution.gaps.map((gap) => {
      return gap.code;
    }),
    latencyMs,
    errorCode: null,
  };
};

const errorCodeOf = (error: unknown): string => {
  if (error instanceof StandardGroundingError) {
    return error.code;
  }
  if (error instanceof Error) {
    return error.name;
  }
  return "unknown";
};

const failedRow = (
  row: MatrixRow,
  error: unknown,
  latencyMs: number
): RowEvidence => {
  return {
    id: row.id,
    jurisdiction: row.jurisdiction,
    statementCode: row.statementCode,
    found: false,
    standardId: null,
    descriptionHash: null,
    contentHash: null,
    componentCount: 0,
    prerequisiteResolution: "unavailable",
    prerequisiteCodes: [],
    prerequisiteMatchTypes: [],
    gapClasses: [],
    latencyMs,
    errorCode: errorCodeOf(error),
  };
};

const runRow = async (
  adapter: ReturnType<typeof createLearningCommonsAdapter>,
  row: MatrixRow
): Promise<RowEvidence> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROW_DEADLINE_MS);
  const startedAt = performance.now();
  try {
    const resolution = await adapter.resolve(
      {
        jurisdiction: row.jurisdiction,
        statementCode: row.statementCode,
      },
      { signal: controller.signal }
    );
    return readRow(row, resolution, Math.round(performance.now() - startedAt));
  } catch (error) {
    return failedRow(row, error, Math.round(performance.now() - startedAt));
  } finally {
    clearTimeout(timer);
  }
};

const sameCodes = (
  actual: readonly string[],
  expected: readonly string[]
): boolean => {
  return (
    actual.length === expected.length &&
    actual.every((code, index) => code === expected[index])
  );
};

const verify = (evidence: RowEvidence): string[] => {
  const expected = EXPECTED[evidence.id];
  if (!expected) {
    return [];
  }
  const failures: string[] = [];
  if (!evidence.found) {
    failures.push("standard not found");
  }
  if (evidence.componentCount !== expected.componentCount) {
    failures.push(
      `component count ${evidence.componentCount} != ${expected.componentCount}`
    );
  }
  if (evidence.prerequisiteResolution !== expected.prerequisiteResolution) {
    failures.push(
      `prerequisite path ${evidence.prerequisiteResolution} != ${expected.prerequisiteResolution}`
    );
  }
  if (!sameCodes(evidence.prerequisiteCodes, expected.prerequisiteCodes)) {
    failures.push(
      `prerequisites ${evidence.prerequisiteCodes.join(",")} != ${expected.prerequisiteCodes.join(",")}`
    );
  }
  if (!sameCodes([...evidence.gapClasses], expected.gapClasses)) {
    failures.push(
      `gaps ${evidence.gapClasses.join(",")} != ${expected.gapClasses.join(",")}`
    );
  }
  return failures;
};

const markdownTable = (rows: readonly RowEvidence[]): string => {
  const header = [
    "| Row | Found | Components | Prerequisite path | Prerequisites | Gap classes | Latency (ms) |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  const body = rows.map((row) => {
    return `| ${row.id} | ${row.found ? "yes" : "no"} | ${row.componentCount} | ${row.prerequisiteResolution} | ${row.prerequisiteCodes.join(", ") || "—"} | ${row.gapClasses.join(", ") || "—"} | ${row.latencyMs} |`;
  });
  return [...header, ...body].join("\n");
};

const main = async (): Promise<void> => {
  const apiKey = loadApiKey();
  const adapter = createLearningCommonsAdapter({
    transport: createLearningCommonsRestTransport({ apiKey }),
  });

  const rows: RowEvidence[] = [];
  for (const row of [...PILOT_ROWS, ...BOUNDARY_ROWS]) {
    // eslint-disable-next-line no-await-in-loop -- rows run in order so provider latency and rate limits stay observable.
    rows.push(await runRow(adapter, row));
  }

  const failures: string[] = [];
  for (const row of rows) {
    for (const failure of verify(row)) {
      failures.push(`${row.id}: ${failure}`);
    }
  }

  const capturedAt = new Date().toISOString();
  const evidence = {
    schemaVersion: 1,
    capturedAt,
    origin: "https://api.learningcommons.org/knowledge-graph/v0",
    rows,
    pilotRows: rows.filter((row) => {
      return (
        row.id.startsWith("multi-state-") || row.id.startsWith("california-")
      );
    }).length,
    boundaryRows: BOUNDARY_ROWS.length,
    failures,
  };

  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  await writeFile(EVIDENCE_JSON, `${JSON.stringify(evidence, null, 2)}\n`);
  await writeFile(
    EVIDENCE_MARKDOWN,
    [
      "# Live Learning Commons REST matrix (2026-11-04)",
      "",
      `Captured ${capturedAt} against \`${evidence.origin}\` with the production adapter.`,
      "Descriptions are recorded as SHA-256 only; no raw provider body is stored.",
      "",
      markdownTable(rows),
      "",
      failures.length === 0
        ? "All eight pilot rows and the ELA boundary matched the recorded expectations."
        : `Unexpected results: ${failures.join("; ")}.`,
      "",
    ].join("\n")
  );

  for (const row of rows) {
    console.log(
      `${row.id}: found=${String(row.found)} components=${row.componentCount} path=${row.prerequisiteResolution} gaps=${row.gapClasses.join(",") || "none"} ${row.latencyMs}ms`
    );
  }

  if (failures.length > 0) {
    console.error(`Live matrix mismatches: ${failures.join("; ")}`);
    process.exitCode = 1;
  }
};

await main();
