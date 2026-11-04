import { readFileSync } from "node:fs";

import type {
  LearningCommonsTransport,
  ProviderResponse,
} from "../learning-commons-rest";

/**
Replay transport built only from the committed Learning Commons evidence
(`docs/research/142-mcp-eval/evidence.json`). It makes no network call.

The committed evidence records response facts, identifiers, match types and a
240-character excerpt per stage — not full provider bodies. This module
therefore reconstructs a minimal provider-shaped response: counts, codes,
jurisdictions and match types come from the recorded facts, the description
prefix comes from the recorded excerpt, and component bodies the evidence does
not commit are marked. Tests assert the recorded facts; the live matrix remains
the unrun acceptance item.
*/

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

const evidenceUrl = new URL(
  "../../../../../docs/research/142-mcp-eval/evidence.json",
  import.meta.url
);

export const recordedEvidence = JSON.parse(
  readFileSync(evidenceUrl, "utf-8")
) as EvidenceFile;

export const recordedColdRuns = recordedEvidence.runs.filter(
  (run) => run.mode === "cold"
);

const decodeJsonStringPrefix = (raw: string): string => {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw.replaceAll('\\"', '"').replaceAll("\\\\", "\\");
  }
};

const firstJsonString = (
  excerpt: string,
  field: string
): string | undefined => {
  const pattern = new RegExp(`"${field}":"((?:[^"\\\\]|\\\\.)*)`, "u");
  const match = pattern.exec(excerpt);
  return match?.[1] === undefined
    ? undefined
    : decodeJsonStringPrefix(match[1]);
};

const stageExcerpt = (run: EvidenceRun, tool: string): string => {
  return run.stages.find((stage) => stage.tool === tool)?.excerpt ?? "";
};

const statementDescription = (run: EvidenceRun): string => {
  return (
    firstJsonString(
      stageExcerpt(run, "find_standard_statement"),
      "description"
    ) ?? "Recorded statement description (body not committed in evidence)."
  );
};

interface RecordedComponent {
  identifier: string;
  description: string;
}

const componentPrefix = (run: EvidenceRun): RecordedComponent[] => {
  const excerpt = stageExcerpt(run, "find_learning_components_from_standard");
  const pattern =
    /"description":"(?<description>(?:[^"\\]|\\.)*)","identifier":"(?<identifier>[^"]+)"/gu;
  return [...excerpt.matchAll(pattern)].map((match) => {
    return {
      description: decodeJsonStringPrefix(match.groups?.description ?? ""),
      identifier: match.groups?.identifier ?? "",
    };
  });
};

const recordedComponents = (run: EvidenceRun): RecordedComponent[] => {
  const count = run.componentFacts?.componentCount ?? 1;
  const prefix = componentPrefix(run);
  return Array.from({ length: count }, (_, index) => {
    const recorded = prefix[index];
    if (recorded) {
      return recorded;
    }
    return {
      identifier: `${run.resolvedStandard.caseIdentifierUUID}:recorded-component-${index + 1}`,
      description: "Recorded component text (body not committed in evidence).",
    };
  });
};

const recordedProgressionRows = (
  run: EvidenceRun
): Record<string, unknown>[] => {
  const { progression } = run;
  if (!progression) {
    return [];
  }
  const [jurisdiction = run.row.jurisdiction] = progression.jurisdictions;
  const [matchType = "exact"] = progression.matchTypes;
  const alignmentScore = progression.minAlignmentScore ?? 1;
  return progression.statementCodes.map((statementCode) => {
    return {
      academicSubject: "Mathematics",
      alignmentScore,
      caseIdentifierUUID: run.resolvedStandard.caseIdentifierUUID,
      description: "Recorded progression row (body not committed in evidence).",
      gradeLevel: [statementCode.slice(0, 1)],
      jurisdiction,
      learningComponents: [],
      matchType,
      statementCode,
    };
  });
};

const rowsByKey = new Map(
  recordedColdRuns.map((run) => [
    `${run.row.jurisdiction}\0${run.row.code}`,
    run,
  ])
);

const runsByCaseId = new Map(
  recordedColdRuns.map((run) => {
    return [run.resolvedStandard.caseIdentifierUUID, run] as const;
  })
);

const ELA_ROW: EvidenceRun = {
  id: "boundary-ela-progression",
  mode: "cold",
  row: {
    jurisdiction: "Multi-State",
    code: recordedEvidence.elaBoundary.resolvedCode,
  },
  resolvedStandard: {
    statementCode: recordedEvidence.elaBoundary.resolvedCode,
    caseIdentifierUUID: "recorded-ela-ri-5-2",
    jurisdiction: "Multi-State",
  },
  componentFacts: { componentCount: 1 },
  progression: null,
  stages: [],
};

const emptyStandards: ProviderResponse = {
  status: 200,
  body: { standards: [] },
};

export const createRecordedLearningCommonsTransport =
  (): LearningCommonsTransport => {
    return {
      findStandard: ({ jurisdiction, statementCode }) => {
        const run = rowsByKey.get(`${jurisdiction}\0${statementCode}`);
        if (!run) {
          if (
            jurisdiction === ELA_ROW.row.jurisdiction &&
            statementCode === ELA_ROW.row.code
          ) {
            return Promise.resolve({
              status: 200,
              body: {
                standards: [
                  {
                    academicSubject: "English Language Arts",
                    caseIdentifierUUID:
                      ELA_ROW.resolvedStandard.caseIdentifierUUID,
                    description:
                      "Determine two or more main ideas of a text and explain how they are supported by key details; summarize the text.",
                    gradeLevels: ["5"],
                    jurisdiction,
                    license: "CC BY 4.0",
                    sourceLink: "https://www.learningcommons.org/",
                    statementCode,
                  },
                ],
              },
            });
          }
          return Promise.resolve(emptyStandards);
        }

        return Promise.resolve({
          status: 200,
          body: {
            standards: [
              {
                academicSubject: "Mathematics",
                alternateStatementCode: statementCode
                  .replace("4.NF.A.1", "4.NF.1")
                  .replace("4.NF.A.2", "4.NF.2")
                  .replace("3.NF.A.3", "3.NF.3")
                  .replace("4.OA.A.3", "4.OA.3"),
                caseIdentifierUUID: run.resolvedStandard.caseIdentifierUUID,
                description: statementDescription(run),
                gradeLevels: [statementCode.slice(0, 1)],
                jurisdiction,
                statementCode,
              },
            ],
          },
        });
      },

      findComponents: ({ caseIdentifierUUID }) => {
        const run =
          caseIdentifierUUID === ELA_ROW.resolvedStandard.caseIdentifierUUID
            ? ELA_ROW
            : runsByCaseId.get(caseIdentifierUUID);
        return Promise.resolve({
          status: 200,
          body: {
            learning_components: (run ? recordedComponents(run) : []).map(
              (component) => {
                return {
                  description: component.description,
                  identifier: component.identifier,
                };
              }
            ),
          },
        });
      },

      findProgression: ({ caseIdentifierUUID }) => {
        if (
          caseIdentifierUUID === ELA_ROW.resolvedStandard.caseIdentifierUUID
        ) {
          return Promise.resolve({
            status: 200,
            body: { message: recordedEvidence.elaBoundary.message },
          });
        }
        const run = runsByCaseId.get(caseIdentifierUUID);
        return Promise.resolve({
          status: 200,
          body: {
            standards: run ? recordedProgressionRows(run) : [],
          },
        });
      },
    };
  };
