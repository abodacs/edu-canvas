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
  SemanticValidationInput,
  SemanticValidationReport,
  VersionedCurriculumContext,
} from "./semantic-validation";
import type {
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
}

type DraftAcceptanceResult =
  | {
      state: "ready-for-review";
      learningPath: ValidatedLearningPath;
      diagnostics: GenerationDiagnostic[];
    }
  | {
      state: "blocked-by-validation" | "failed-retryable";
      diagnostics: GenerationDiagnostic[];
    };

const BLOCKED_BY_VALIDATION_STATE = "blocked-by-validation";

const diagnostic = (code: string, message: string): GenerationDiagnostic => {
  return {
    severity: "error",
    code,
    message,
  };
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
      "The approved prerequisite graph belongs to a different classroom. Teacher review is required before student content can be generated."
    );
  }

  if (
    context.standardId !== input.standardId ||
    context.grade !== input.grade ||
    context.language !== input.language
  ) {
    return diagnostic(
      "CURRICULUM_CONTEXT_MISMATCH",
      "The approved prerequisite graph does not match this lesson request. Teacher review is required before student content can be generated."
    );
  }

  return context.graphVersion === graphVersion
    ? undefined
    : diagnostic(
        "CURRICULUM_GRAPH_VERSION_UNSUPPORTED",
        "The approved prerequisite graph version is not available for this lesson. Teacher review is required before student content can be generated."
      );
};

const semanticValidationDiagnostics = (
  report: SemanticValidationReport
): GenerationDiagnostic[] => {
  return report.findings
    .filter((finding) => finding.verdict !== "pass")
    .map((finding) => {
      return {
        severity: finding.verdict === "warning" ? "warning" : "error",
        code: finding.code,
        message: finding.reason,
        ...(finding.variantId && { variantId: finding.variantId }),
        ...(finding.field && { field: finding.field }),
        ...(finding.nodeId && { nodeId: finding.nodeId }),
        validator: finding.validator,
        verdict: finding.verdict,
        validatorVersion: finding.validatorVersion,
        ...(finding.recommendation && {
          recommendation: finding.recommendation,
        }),
      };
    });
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
          "The approved prerequisite path is missing. Review the draft before trying again."
        ),
      ],
    };
  }

  const context = options.curriculumContext
    ? options.curriculumContext(input)
    : createDemoCurriculumContext(input);
  if (!context) {
    return {
      state: BLOCKED_BY_VALIDATION_STATE,
      diagnostics: [
        ...structuralDiagnostics,
        diagnostic(
          "PREREQUISITE_PACK_MISSING",
          "The approved prerequisite graph is unavailable. Teacher review is required before student content can be generated."
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
      state: "failed-retryable",
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
  if (report.status === "retryable" || report.verdict === "block") {
    return {
      state:
        report.status === "retryable"
          ? "failed-retryable"
          : BLOCKED_BY_VALIDATION_STATE,
      diagnostics,
    };
  }

  try {
    const learningPath = buildValidatedLearningPath({
      proposal: draft.learningPath,
      context,
      draftId: requestId,
      provenance,
      validatorVersion: semanticValidationRunnerVersion,
    });
    return { state: "ready-for-review", learningPath, diagnostics };
  } catch (error) {
    return {
      state: BLOCKED_BY_VALIDATION_STATE,
      diagnostics: [
        ...diagnostics,
        diagnostic(
          "LEARNING_PATH_BLOCKED",
          error instanceof LearningPathBuildError
            ? error.message
            : "The learning path could not be accepted safely. Review the draft before trying again."
        ),
      ],
    };
  }
};
