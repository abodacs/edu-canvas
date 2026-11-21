import { readFileSync } from "node:fs";

import { z } from "zod";

import type {
  LearningCommonsTransport,
  ProviderResponse,
} from "../learning-commons-rest";

interface EvidenceRun {
  id: string;
  mode: string;
  row: { jurisdiction: string; code: string };
  resolvedStandard: {
    statementCode: string;
    caseIdentifierUUID: string;
    jurisdiction: string;
  };
  componentFacts: { componentCount: number } | null;
  progression: {
    prerequisiteCount: number;
    jurisdictions: string[];
    matchTypes: string[];
    statementCodes: string[];
    minAlignmentScore: number | null;
    maxAlignmentScore: number | null;
    errorMessage: string | null;
  } | null;
  stages: {
    tool: string;
    excerpt: string;
  }[];
}

interface EvidenceFile {
  runs: EvidenceRun[];
  elaBoundary: {
    resolvedCode: string;
    progressionIsError: boolean;
    message: string;
  };
}

interface FreeTextEvidenceRow {
  id: string;
  kind: string;
  expectedCode: string | null;
  rest: {
    ok: boolean;
    codes: string[];
    hasProvenance: boolean;
  } | null;
}

interface FreeTextEvidenceFile {
  environment: { restOrigin: string };
  rows: FreeTextEvidenceRow[];
}

const evidenceRunSchema: z.ZodType<EvidenceRun> = z.object({
  id: z.string(),
  mode: z.string(),
  row: z.object({ jurisdiction: z.string(), code: z.string() }),
  resolvedStandard: z.object({
    statementCode: z.string(),
    caseIdentifierUUID: z.string(),
    jurisdiction: z.string(),
  }),
  componentFacts: z.object({ componentCount: z.number() }).nullable(),
  progression: z
    .object({
      prerequisiteCount: z.number(),
      jurisdictions: z.array(z.string()),
      matchTypes: z.array(z.string()),
      statementCodes: z.array(z.string()),
      minAlignmentScore: z.number().nullable(),
      maxAlignmentScore: z.number().nullable(),
      errorMessage: z.string().nullable(),
    })
    .nullable(),
  stages: z.array(z.object({ tool: z.string(), excerpt: z.string() })),
});

const evidenceFileSchema: z.ZodType<EvidenceFile> = z.object({
  runs: z.array(evidenceRunSchema),
  elaBoundary: z.object({
    resolvedCode: z.string(),
    progressionIsError: z.boolean(),
    message: z.string(),
  }),
});

const freeTextEvidenceRowSchema: z.ZodType<FreeTextEvidenceRow> = z.object({
  id: z.string(),
  kind: z.string(),
  expectedCode: z.string().nullable(),
  rest: z
    .object({
      ok: z.boolean(),
      codes: z.array(z.string()),
      hasProvenance: z.boolean(),
    })
    .nullable(),
});

const freeTextEvidenceFileSchema: z.ZodType<FreeTextEvidenceFile> = z.object({
  environment: z.object({ restOrigin: z.string() }),
  rows: z.array(freeTextEvidenceRowSchema),
});

const evidenceUrl = new URL(
  "../../../../../docs/research/142-mcp-eval/evidence.json",
  import.meta.url
);
const freeTextEvidenceUrl = new URL(
  "../../../../../docs/research/142-mcp-eval/free-text-evidence.json",
  import.meta.url
);

export const recordedEvidence: EvidenceFile = evidenceFileSchema.parse(
  JSON.parse(readFileSync(evidenceUrl, "utf-8"))
);

export const recordedFreeTextEvidence: FreeTextEvidenceFile =
  freeTextEvidenceFileSchema.parse(
    JSON.parse(readFileSync(freeTextEvidenceUrl, "utf-8"))
  );

export const recordedColdRuns = recordedEvidence.runs.filter((run) => {
  return run.mode === "cold";
});

interface RecordedPrerequisite {
  readonly statementCode: string;
  readonly jurisdiction: string;
}

interface RecordedStandard {
  readonly jurisdiction: string;
  readonly subject: string;
  readonly statementCode: string;
  readonly frameworkCaseIdentifierUUID: string;
  readonly caseIdentifierUUID: string;
  readonly componentCount: number;
  readonly prerequisites: readonly RecordedPrerequisite[];
  readonly crosswalk?: {
    readonly caseIdentifierUUID: string;
    readonly jaccard: number;
  };
}

export const RECORDED_FRAMEWORKS = {
  "Multi-State\0Mathematics": [
    {
      caseIdentifierUUID: "c6496676-d7cb-11e8-824f-0242ac160002",
      name: "Common Core State Standards for Math",
      isCurrent: true,
    },
  ],
  "California\0Mathematics": [
    {
      caseIdentifierUUID: "c6487102-d7cb-11e8-824f-0242ac160002",
      name: "California Common Core State Standards - Mathematics",
      isCurrent: true,
    },
  ],
  "Multi-State\0English Language Arts": [
    {
      caseIdentifierUUID: "d3641881-a190-44a9-afbe-d93fdc65f078",
      name: "Marco de los estándares del desarrollo auténtico del lenguaje español de WIDA (Marco DALE) ",
      isCurrent: true,
    },
    {
      caseIdentifierUUID: "c64961be-d7cb-11e8-824f-0242ac160002",
      name: "Common Core State Standards for ELA",
      isCurrent: true,
    },
    {
      caseIdentifierUUID: "97c883b4-8590-454f-b222-f28298ec9a81",
      name: "WIDA English Language Development Standards Framework, 2020 Digital Explorer",
      isCurrent: true,
    },
  ],
} as const;

const recordedFrameworkEntries: Record<
  string,
  readonly { caseIdentifierUUID: string; name: string; isCurrent: boolean }[]
> = RECORDED_FRAMEWORKS;

const MULTI_STATE_MATH = "c6496676-d7cb-11e8-824f-0242ac160002";
const CALIFORNIA_MATH = "c6487102-d7cb-11e8-824f-0242ac160002";
const MULTI_STATE_ELA = "c64961be-d7cb-11e8-824f-0242ac160002";

const recordedStandard = (
  jurisdiction: string,
  subject: string,
  statementCode: string,
  frameworkCaseIdentifierUUID: string,
  caseIdentifierUUID: string,
  componentCount: number,
  prerequisites: readonly RecordedPrerequisite[],
  crosswalk?: { readonly caseIdentifierUUID: string; readonly jaccard: number }
): RecordedStandard => {
  return {
    jurisdiction,
    subject,
    statementCode,
    frameworkCaseIdentifierUUID,
    caseIdentifierUUID,
    componentCount,
    prerequisites,
    ...(crosswalk === undefined ? {} : { crosswalk }),
  };
};

const multiStatePrerequisite = (
  statementCode: string
): RecordedPrerequisite => {
  return { statementCode, jurisdiction: "Multi-State" };
};

export const RECORDED_STANDARDS: readonly RecordedStandard[] = [
  recordedStandard(
    "Multi-State",
    "Mathematics",
    "4.NF.A.1",
    MULTI_STATE_MATH,
    "6b9c09e2-d7cc-11e8-824f-0242ac160002",
    5,
    [multiStatePrerequisite("4.OA.A.2"), multiStatePrerequisite("3.NF.A.3")]
  ),
  recordedStandard(
    "Multi-State",
    "Mathematics",
    "4.NF.A.2",
    MULTI_STATE_MATH,
    "6b9d4e66-d7cc-11e8-824f-0242ac160002",
    7,
    [multiStatePrerequisite("4.NF.A.1")]
  ),
  recordedStandard(
    "Multi-State",
    "Mathematics",
    "3.NF.A.3",
    MULTI_STATE_MATH,
    "6b9e210d-d7cc-11e8-824f-0242ac160002",
    2,
    [multiStatePrerequisite("3.NF.A.1"), multiStatePrerequisite("3.NF.A.2")]
  ),
  recordedStandard(
    "Multi-State",
    "Mathematics",
    "4.OA.A.3",
    MULTI_STATE_MATH,
    "6b9e2e91-d7cc-11e8-824f-0242ac160002",
    18,
    [
      multiStatePrerequisite("4.NBT.A.3"),
      multiStatePrerequisite("4.NBT.B.6"),
      multiStatePrerequisite("3.OA.D.8"),
    ]
  ),
  recordedStandard(
    "California",
    "Mathematics",
    "4.NF.A.1",
    CALIFORNIA_MATH,
    "5ebefbed-d7cc-11e8-824f-0242ac160002",
    5,
    [],
    {
      caseIdentifierUUID: "6b9c09e2-d7cc-11e8-824f-0242ac160002",
      jaccard: 1,
    }
  ),
  recordedStandard(
    "California",
    "Mathematics",
    "4.NF.A.2",
    CALIFORNIA_MATH,
    "5ec026d1-d7cc-11e8-824f-0242ac160002",
    7,
    [],
    {
      caseIdentifierUUID: "6b9d4e66-d7cc-11e8-824f-0242ac160002",
      jaccard: 1,
    }
  ),
  recordedStandard(
    "California",
    "Mathematics",
    "3.NF.A.3",
    CALIFORNIA_MATH,
    "5ec0f3b6-d7cc-11e8-824f-0242ac160002",
    2,
    [],
    {
      caseIdentifierUUID: "6b9e210d-d7cc-11e8-824f-0242ac160002",
      jaccard: 1,
    }
  ),
  recordedStandard(
    "California",
    "Mathematics",
    "4.OA.A.3",
    CALIFORNIA_MATH,
    "5ec100e3-d7cc-11e8-824f-0242ac160002",
    18,
    [],
    {
      caseIdentifierUUID: "6b9e2e91-d7cc-11e8-824f-0242ac160002",
      jaccard: 1,
    }
  ),
  recordedStandard(
    "Multi-State",
    "English Language Arts",
    "RI.5.2",
    MULTI_STATE_ELA,
    "6b36c8ef-d7cc-11e8-824f-0242ac160002",
    0,
    []
  ),
];

const standardsByCaseId = new Map(
  RECORDED_STANDARDS.map((standard) => {
    return [standard.caseIdentifierUUID, standard] as const;
  })
);

const standardsByFramework = new Map<string, RecordedStandard[]>();
for (const standard of RECORDED_STANDARDS) {
  const list = standardsByFramework.get(standard.frameworkCaseIdentifierUUID);
  if (list) {
    list.push(standard);
  } else {
    standardsByFramework.set(standard.frameworkCaseIdentifierUUID, [standard]);
  }
}

const standardRow = (standard: RecordedStandard): Record<string, unknown> => {
  return {
    identifier: `${standard.caseIdentifierUUID}:item`,
    caseIdentifierURI: `https://satchelcommons.com/ims/case/v1p0/CFItems/${standard.caseIdentifierUUID}`,
    caseIdentifierUUID: standard.caseIdentifierUUID,
    statementCode: standard.statementCode,
    description: `Recorded description for ${standard.statementCode} (live 2026-11-04).`,
    jurisdiction: standard.jurisdiction,
    academicSubject: standard.subject,
    gradeLevel: [
      standard.statementCode.includes("RI.")
        ? (standard.statementCode.split(".")[1] ?? "")
        : standard.statementCode.slice(0, 1),
    ],
    provider: "Learning Commons",
    license: "https://creativecommons.org/licenses/by/4.0/",
    hasChildren: false,
  };
};

const componentRows = (
  standard: RecordedStandard
): Record<string, unknown>[] => {
  return Array.from({ length: standard.componentCount }, (_, index) => {
    return {
      identifier: `${standard.caseIdentifierUUID}:component-${index + 1}`,
      description: `Recorded component ${index + 1} for ${standard.statementCode}.`,
      provider: "Learning Commons",
      license: "https://creativecommons.org/licenses/by/4.0/",
    };
  });
};

const prerequisiteRows = (
  standard: RecordedStandard
): Record<string, unknown>[] => {
  return standard.prerequisites.map((prerequisite) => {
    return {
      caseIdentifierUUID: `recorded-${prerequisite.statementCode}`,
      statementCode: prerequisite.statementCode,
      description: `Recorded prerequisite ${prerequisite.statementCode}.`,
      jurisdiction: prerequisite.jurisdiction,
      provider: "Learning Commons",
    };
  });
};

const page = (
  data: readonly unknown[],
  nextCursor: string | null = null
): ProviderResponse => {
  return {
    status: 200,
    body: {
      data,
      pagination: {
        limit: 100,
        nextCursor,
        hasMore: nextCursor !== null,
      },
    },
  };
};

const emptyPage: ProviderResponse = page([]);

export const createRecordedLearningCommonsTransport =
  (): LearningCommonsTransport => {
    return {
      findFrameworks: async ({ jurisdiction, academicSubject }) => {
        const frameworks =
          recordedFrameworkEntries[`${jurisdiction}\0${academicSubject}`] ?? [];
        return await Promise.resolve(page(frameworks));
      },

      findStandardsPage: async ({ frameworkCaseIdentifierUUID, cursor }) => {
        const standards =
          standardsByFramework.get(frameworkCaseIdentifierUUID) ?? [];
        if (standards.length === 0) {
          return await Promise.resolve(emptyPage);
        }
        const groupingRow = {
          caseIdentifierUUID: `${frameworkCaseIdentifierUUID}:grouping`,
          statementCode: null,
          description: "Recorded domain grouping.",
          jurisdiction: standards[0]?.jurisdiction ?? "Multi-State",
          academicSubject: standards[0]?.subject ?? "Mathematics",
        };
        if (
          frameworkCaseIdentifierUUID === CALIFORNIA_MATH &&
          cursor === undefined
        ) {
          return page(
            [
              groupingRow,
              standardRow({
                ...standards[0],
                statementCode: "recorded-filler-1",
              }),
            ],
            "recorded-page-2"
          );
        }
        return page([groupingRow, ...standards.map(standardRow)]);
      },

      findComponentsPage: async ({ standardCaseIdentifierUUID }) => {
        const standard = standardsByCaseId.get(standardCaseIdentifierUUID);
        return await Promise.resolve(
          standard ? page(componentRows(standard)) : emptyPage
        );
      },

      findPrerequisitesPage: async ({ standardCaseIdentifierUUID }) => {
        const standard = standardsByCaseId.get(standardCaseIdentifierUUID);
        return await Promise.resolve(
          standard ? page(prerequisiteRows(standard)) : emptyPage
        );
      },

      findCrosswalks: async ({ standardCaseIdentifierUUID }) => {
        const standard = standardsByCaseId.get(standardCaseIdentifierUUID);
        if (!standard?.crosswalk) {
          return await Promise.resolve(emptyPage);
        }
        const target = standardsByCaseId.get(
          standard.crosswalk.caseIdentifierUUID
        );
        return page([
          {
            caseIdentifierUUID: standard.crosswalk.caseIdentifierUUID,
            statementCode: target?.statementCode ?? "",
            description: `Recorded crosswalk to ${target?.statementCode ?? ""}.`,
            jurisdiction: "Multi-State",
            jaccard: standard.crosswalk.jaccard,
            provider: "Learning Commons",
          },
        ]);
      },
    };
  };
