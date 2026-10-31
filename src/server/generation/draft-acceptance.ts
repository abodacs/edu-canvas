import {
  gateArtifact,
  snapshotArtifactGateResult,
} from "@/server/safety/artifact-gate";

import {
  buildValidatedLearningPath,
  LearningPathBuildError,
  toNormalizedReasoningPath,
} from "./learning-path";
import {
  createDemoCurriculumContext,
  semanticValidationRunnerVersion,
  validateSemanticLesson,
} from "./semantic-validation";
import type {
  ArtifactGateFinding,
  ArtifactGateInput,
  ArtifactGateResult,
  ArtifactGateSnapshot,
} from "@/server/safety/artifact-gate";
import type {
  SemanticValidationInput,
  SemanticValidationReport,
  SemanticValidationVerdict,
  VersionedCurriculumContext,
} from "./semantic-validation";
import type {
  DiagnosticSeverity,
  GenerationDiagnostic,
  NormalizedGenerationRequest,
  ProviderLessonDraft,
  ProviderProvenance,
  ValidatedLearningPath,
} from "./types";

export interface DraftAcceptanceOptions {
  curriculumContext?: (
    input: NormalizedGenerationRequest
  ) => VersionedCurriculumContext | undefined;
  semanticValidation?: (
    input: SemanticValidationInput
  ) => Promise<SemanticValidationReport>;
  /**
   * Overridable only for fail-closed tests; production uses `gateArtifact`.
   */
  artifactGate?: (input: ArtifactGateInput) => ArtifactGateResult;
}

type DraftAcceptanceResult =
  | {
      state: "ready-for-review";
      learningPath: ValidatedLearningPath;
      diagnostics: GenerationDiagnostic[];
      gate: ArtifactGateSnapshot;
    }
  | {
      state: "blocked-by-validation" | "failed-retryable";
      diagnostics: GenerationDiagnostic[];
    };

const BLOCKED_BY_VALIDATION_STATE = "blocked-by-validation";
const FAILED_RETRYABLE_STATE = "failed-retryable";

const diagnostic = (
  code: string,
  message: string,
  recovery?: GenerationDiagnostic["recovery"]
): GenerationDiagnostic => {
  return {
    severity: "error",
    code,
    message,
    ...(recovery && { recovery }),
  };
};

/**
 * Fail closed: an unavailable gate is infrastructure, not artifact evidence.
 * The attempt stays retryable and never becomes ready-for-review.
 */
const gateUnavailableDiagnostic = (): GenerationDiagnostic => {
  return diagnostic(
    "ARTIFACT_GATE_UNAVAILABLE",
    "The safety gate could not complete safely. Try this draft again."
  );
};

const curriculumContextDiagnostic = (
  context: VersionedCurriculumContext,
  tenantId: string,
  input: NormalizedGenerationRequest,
  graphVersion: string
): GenerationDiagnostic | undefined => {
  if (context.tenantId !== tenantId) {
    return diagnostic(
      "CURRICULUM_TENANT_MISMATCH",
      "The approved prerequisite graph belongs to a different classroom. Teacher review is required before student content can be generated.",
      "edit"
    );
  }

  if (
    context.standardId !== input.standardId ||
    context.grade !== input.grade ||
    context.language !== input.language
  ) {
    return diagnostic(
      "CURRICULUM_CONTEXT_MISMATCH",
      "The approved prerequisite graph does not match this lesson request. Teacher review is required before student content can be generated.",
      "edit"
    );
  }

  return context.graphVersion === graphVersion
    ? undefined
    : diagnostic(
        "CURRICULUM_GRAPH_VERSION_UNSUPPORTED",
        "The approved prerequisite graph version is not available for this lesson. Teacher review is required before student content can be generated.",
        "edit"
      );
};

const diagnosticSeverity = (
  verdict: SemanticValidationVerdict
): DiagnosticSeverity => {
  switch (verdict) {
    case "pass": {
      // Pass findings are filtered before this mapping runs.
      return "warning";
    }
    case "warning": {
      return "warning";
    }
    case "hard_block": {
      return "error";
    }
    default: {
      const exhaustive: never = verdict;
      throw new Error(`Unhandled semantic validation verdict: ${exhaustive}`);
    }
  }
};

const semanticValidationDiagnostics = (
  report: SemanticValidationReport
): GenerationDiagnostic[] => {
  return report.findings
    .filter((finding) => finding.verdict !== "pass")
    .map((finding) => {
      return {
        severity: diagnosticSeverity(finding.verdict),
        code: finding.code,
        message: finding.reason,
        ...(finding.variantId && { variantId: finding.variantId }),
        ...(finding.field && { field: finding.field }),
        ...(finding.nodeId && { nodeId: finding.nodeId }),
        validator: finding.validator,
        verdict: finding.verdict,
        validatorVersion: finding.validatorVersion,
        recovery: finding.recovery,
        ...(finding.recommendation && {
          recommendation: finding.recommendation,
        }),
      };
    });
};

const diagnosticIdentity = (entry: GenerationDiagnostic): string => {
  return [
    entry.validator ?? "structural",
    entry.code,
    entry.field ?? "draft",
    entry.variantId ?? "",
    entry.nodeId ?? "",
  ].join("|");
};

const findingIdentity = (finding: ArtifactGateFinding): string => {
  return [
    finding.validator,
    finding.code,
    finding.field,
    finding.variantId ?? "",
    finding.nodeId ?? "",
  ].join("|");
};

/**
 * The gate decides the verdict for the whole artifact, so its findings become the record diagnostics on a hard block. Each one keeps its recovery action; a prior diagnostic with the same identity contributes its recommendation.
 */
const gateDiagnostics = (
  findings: readonly ArtifactGateFinding[],
  existing: readonly GenerationDiagnostic[]
): GenerationDiagnostic[] => {
  const existingByIdentity = new Map(
    existing.map((entry) => [diagnosticIdentity(entry), entry])
  );

  return findings.map((finding): GenerationDiagnostic => {
    const prior = existingByIdentity.get(findingIdentity(finding));
    return {
      severity: finding.verdict === "hard_block" ? "error" : "warning",
      code: finding.code,
      message: finding.reason,
      field: finding.field,
      ...(finding.variantId && { variantId: finding.variantId }),
      ...(finding.nodeId && { nodeId: finding.nodeId }),
      ...(finding.validator !== "structural" && {
        validator: finding.validator,
      }),
      verdict: finding.verdict,
      validatorVersion: finding.validatorVersion,
      recovery: finding.recovery,
      ...(prior?.recommendation && { recommendation: prior.recommendation }),
    };
  });
};

export const resolveCurriculumContext = (
  input: NormalizedGenerationRequest,
  tenantId: string,
  options: DraftAcceptanceOptions
): VersionedCurriculumContext | undefined => {
  return options.curriculumContext
    ? options.curriculumContext(input)
    : createDemoCurriculumContext(input, tenantId);
};

export const reviewDraftForAcceptance = async (
  {
    draft,
    input,
    tenantId,
    requestId,
    provenance,
    structuralDiagnostics,
    graphVersion,
  }: {
    draft: ProviderLessonDraft;
    input: NormalizedGenerationRequest;
    tenantId: string;
    requestId: string;
    provenance: ProviderProvenance;
    structuralDiagnostics: GenerationDiagnostic[];
    graphVersion: string;
  },
  options: DraftAcceptanceOptions
): Promise<DraftAcceptanceResult> => {
  if (!draft.learningPath) {
    return {
      state: BLOCKED_BY_VALIDATION_STATE,
      diagnostics: [
        ...structuralDiagnostics,
        diagnostic(
          "PREREQUISITE_PATH_MISSING",
          "The approved prerequisite path is missing. Review the draft before trying again.",
          "retry"
        ),
      ],
    };
  }

  const context = resolveCurriculumContext(input, tenantId, options);
  if (!context) {
    return {
      state: BLOCKED_BY_VALIDATION_STATE,
      diagnostics: [
        ...structuralDiagnostics,
        diagnostic(
          "PREREQUISITE_PACK_MISSING",
          "The approved prerequisite graph is unavailable. Teacher review is required before student content can be generated.",
          "retry"
        ),
      ],
    };
  }

  const contextDiagnostic = curriculumContextDiagnostic(
    context,
    tenantId,
    input,
    graphVersion
  );
  if (contextDiagnostic) {
    return {
      state: BLOCKED_BY_VALIDATION_STATE,
      diagnostics: [...structuralDiagnostics, contextDiagnostic],
    };
  }

  const semanticValidation =
    options.semanticValidation ?? validateSemanticLesson;
  let report: SemanticValidationReport;
  try {
    report = await semanticValidation({
      draft,
      context,
      path: toNormalizedReasoningPath(draft.learningPath),
    });
  } catch {
    return {
      state: FAILED_RETRYABLE_STATE,
      diagnostics: [
        ...structuralDiagnostics,
        {
          ...diagnostic(
            "SEMANTIC_VALIDATION_UNAVAILABLE",
            "Semantic validation could not complete safely. Try this draft again."
          ),
          validatorVersion: semanticValidationRunnerVersion,
        },
      ],
    };
  }

  const diagnostics = [
    ...structuralDiagnostics,
    ...semanticValidationDiagnostics(report),
  ];
  if (report.status === "retryable" || report.verdict === "hard_block") {
    return {
      state:
        report.status === "retryable"
          ? FAILED_RETRYABLE_STATE
          : BLOCKED_BY_VALIDATION_STATE,
      diagnostics,
    };
  }

  let learningPath: ValidatedLearningPath;
  try {
    learningPath = buildValidatedLearningPath({
      proposal: draft.learningPath,
      context,
      draftId: requestId,
      provenance,
      validatorVersion: semanticValidationRunnerVersion,
    });
  } catch (error) {
    return {
      state: BLOCKED_BY_VALIDATION_STATE,
      diagnostics: [
        ...diagnostics,
        diagnostic(
          "LEARNING_PATH_BLOCKED",
          error instanceof LearningPathBuildError
            ? error.message
            : "The learning path could not be accepted safely. Review the draft before trying again.",
          "edit"
        ),
      ],
    };
  }

  const runGate = options.artifactGate ?? gateArtifact;
  let gateResult: ArtifactGateResult;
  try {
    gateResult = runGate({
      kind: "lesson",
      draft: { variants: draft.variants },
      learningPath,
      report,
      structuralDiagnostics,
    });
  } catch {
    return {
      state: FAILED_RETRYABLE_STATE,
      diagnostics: [...diagnostics, gateUnavailableDiagnostic()],
    };
  }

  if (gateResult.verdict === "hard_block") {
    return {
      state: BLOCKED_BY_VALIDATION_STATE,
      diagnostics: gateDiagnostics(gateResult.findings, diagnostics),
    };
  }

  try {
    return {
      state: "ready-for-review",
      learningPath,
      diagnostics,
      gate: snapshotArtifactGateResult(gateResult),
    };
  } catch {
    return {
      state: FAILED_RETRYABLE_STATE,
      diagnostics: [...diagnostics, gateUnavailableDiagnostic()],
    };
  }
};
