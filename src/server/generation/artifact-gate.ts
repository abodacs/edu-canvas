import { createHash } from "node:crypto";

import { reportRecovery, reviewVerdict } from "./semantic-validation-utilities";
import type {
  RecoveryAction,
  SemanticValidationFinding,
  SemanticValidationReport,
} from "./semantic-validation-contract";
import type { ProviderLessonDraft, ValidatedLearningPath } from "./types";

export const artifactGatePolicyVersion = "artifact-gate-policy-v1";

const renderableArtifactBrand = Symbol("edu-canvas.renderable-artifact");

/**
 * A draft and learning path that cleared the gate. The module-private symbol
 * makes an object literal outside this module a type error; `gateArtifact`
 * is the only producer.
 */
export interface RenderableArtifact {
  readonly [renderableArtifactBrand]: typeof renderableArtifactBrand;
  readonly draft: ProviderLessonDraft;
  readonly learningPath: ValidatedLearningPath;
  readonly artifactHash: string;
  readonly policyVersion: string;
}

export interface ArtifactGateInput {
  draft: ProviderLessonDraft;
  learningPath: ValidatedLearningPath;
  report: SemanticValidationReport;
  /**
   * Overrides the default policy. The result echoes the version it used, so a later derivation under a new policy never looks byte-identical.
   */
  policyVersion?: string;
}

export interface ArtifactGateFinding {
  validator: "curriculum" | "learning-quality";
  validatorVersion: string;
  code: string;
  field: string;
  variantId?: string;
  nodeId?: string;
  reason: string;
  recovery: RecoveryAction;
}

interface ArtifactGateResultBase {
  policyVersion: string;
  artifactHash: string;
  findings: readonly ArtifactGateFinding[];
}

export type ArtifactGateResult =
  | (ArtifactGateResultBase & {
      verdict: "pass";
      recovery: null;
      findings: readonly [];
      renderable: RenderableArtifact;
    })
  | (ArtifactGateResultBase & {
      verdict: "warning";
      recovery: RecoveryAction;
      renderable: RenderableArtifact;
    })
  | (ArtifactGateResultBase & {
      verdict: "hard_block";
      recovery: RecoveryAction;
      renderable: null;
    });

const compareKeys = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
};

const canonicalize = (value: unknown): string => {
  if (value === undefined) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries: string[] = [];
    const keys = Object.keys(record).toSorted(compareKeys);
    for (const key of keys) {
      const entry = record[key];
      if (entry !== undefined) {
        entries.push(`${JSON.stringify(key)}:${canonicalize(entry)}`);
      }
    }
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

const hashArtifact = (input: {
  draft: ProviderLessonDraft;
  learningPath: ValidatedLearningPath;
}): string => {
  return createHash("sha256")
    .update(
      canonicalize({
        draft: input.draft,
        learningPath: input.learningPath,
      }),
      "utf-8"
    )
    .digest("hex");
};

const isActionableFinding = (
  item: SemanticValidationFinding
): item is Extract<
  SemanticValidationFinding,
  { verdict: "warning" | "hard_block" }
> => item.verdict !== "pass";

const gateFindings = (
  report: SemanticValidationReport
): ArtifactGateFinding[] => {
  return report.findings.filter(isActionableFinding).map((item) => {
    return {
      validator: item.validator,
      validatorVersion: item.validatorVersion,
      code: item.code,
      field: item.field,
      ...(item.variantId && { variantId: item.variantId }),
      ...(item.nodeId && { nodeId: item.nodeId }),
      reason: item.reason,
      recovery: item.recovery,
    };
  });
};

const createRenderableArtifact = (input: {
  draft: ProviderLessonDraft;
  learningPath: ValidatedLearningPath;
  artifactHash: string;
  policyVersion: string;
}): RenderableArtifact => {
  return {
    [renderableArtifactBrand]: renderableArtifactBrand,
    draft: input.draft,
    learningPath: input.learningPath,
    artifactHash: input.artifactHash,
    policyVersion: input.policyVersion,
  };
};

export const gateArtifact = (input: ArtifactGateInput): ArtifactGateResult => {
  const policyVersion = input.policyVersion ?? artifactGatePolicyVersion;
  if (!policyVersion.trim()) {
    throw new Error("The artifact gate requires a policy version.");
  }

  const artifactHash = hashArtifact(input);
  const findings = gateFindings(input.report);
  const verdict = reviewVerdict(input.report.findings);

  switch (verdict) {
    case "pass": {
      return {
        verdict,
        recovery: null,
        findings: [],
        policyVersion,
        artifactHash,
        renderable: createRenderableArtifact({
          draft: input.draft,
          learningPath: input.learningPath,
          artifactHash,
          policyVersion,
        }),
      };
    }
    case "warning": {
      return {
        verdict,
        recovery: reportRecovery(input.report.findings),
        findings,
        policyVersion,
        artifactHash,
        renderable: createRenderableArtifact({
          draft: input.draft,
          learningPath: input.learningPath,
          artifactHash,
          policyVersion,
        }),
      };
    }
    case "hard_block": {
      return {
        verdict,
        recovery: reportRecovery(input.report.findings),
        findings,
        policyVersion,
        artifactHash,
        renderable: null,
      };
    }
    default: {
      const exhaustive: never = verdict;
      throw new Error(`Unhandled artifact gate verdict: ${exhaustive}`);
    }
  }
};
