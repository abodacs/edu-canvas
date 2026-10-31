import { createHash } from "node:crypto";

import { validatorVersion as lessonValidatorVersion } from "@/server/generation/validation";
import { artifactGateSnapshotSchema } from "./artifact-gate-contract";
import {
  dominantRecovery,
  recoveryForCode,
  recoveryForFinding,
} from "./recovery-policy";
import type { FractionLessonDraft } from "@/shared/fractions-contract";

import type {
  ArtifactGateFinding,
  ArtifactGateSnapshot,
} from "./artifact-gate-contract";

import type {
  RecoveryAction,
  SemanticValidationFinding,
  SemanticValidationReport,
} from "@/server/generation/semantic-validation-contract";
import type {
  GenerationDiagnostic,
  ProviderLessonDraft,
  ValidatedLearningPath,
} from "@/server/generation/types";

export const artifactGatePolicyVersion = "artifact-gate-policy-v1";
export const a2uiCompileGuardVersion = "a2ui-compile-guard-v1";

const renderableArtifactBrand = Symbol("edu-canvas.renderable-artifact");

interface RenderableArtifactBase {
  readonly [renderableArtifactBrand]: typeof renderableArtifactBrand;
  readonly artifactHash: string;
  readonly policyVersion: string;
}

/**
 * A draft that cleared the gate. The module-private symbol makes an object
 * literal outside this module a type error; `gateArtifact` is the only
 * producer. A hard-blocked artifact never carries this brand.
 */
export type RenderableArtifact =
  | (RenderableArtifactBase & {
      readonly kind: "lesson";
      readonly draft: ProviderLessonDraft;
      readonly learningPath: ValidatedLearningPath;
    })
  | (RenderableArtifactBase & {
      readonly kind: "fraction";
      readonly draft: FractionLessonDraft;
    });

/**
 * Runtime proof of the brand. Type signatures keep callers honest at compile time; this guard stops a JavaScript caller from compiling a raw draft.
 */
export const isRenderableArtifact = (
  value: unknown
): value is RenderableArtifact => {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as RenderableArtifactBase)[renderableArtifactBrand] ===
      renderableArtifactBrand
  );
};

/**
 * A deterministic pre-render rejection produced by the A2UI compile guard or the payload validator it runs. The drafting context cannot import the preview compiler, so the compile seam maps its failure into this shape and the gate owns the verdict.
 */
export interface ArtifactPreRenderFailure {
  code: string;
  field: string;
  variantId?: string;
  reason: string;
}

interface ArtifactGateInputBase {
  structuralDiagnostics?: readonly GenerationDiagnostic[];
  preRenderFailures?: readonly ArtifactPreRenderFailure[];
  /**
   * Overrides the default policy. The result echoes the version it used, so a later derivation under a new policy never looks byte-identical.
   */
  policyVersion?: string;
}

export interface LessonArtifactGateInput extends ArtifactGateInputBase {
  kind: "lesson";
  draft: ProviderLessonDraft;
  /**
  Absent when the draft gate blocked the artifact before a path was accepted.
  */
  learningPath?: ValidatedLearningPath;
  report?: SemanticValidationReport;
}

export interface FractionArtifactGateInput extends ArtifactGateInputBase {
  kind: "fraction";
  draft: FractionLessonDraft;
}

export type ArtifactGateInput =
  LessonArtifactGateInput | FractionArtifactGateInput;

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

const hashArtifact = (input: ArtifactGateInput): string => {
  const canonicalArtifact =
    input.kind === "fraction"
      ? { kind: input.kind, draft: input.draft }
      : {
          kind: input.kind,
          draft: input.draft,
          learningPath: input.learningPath ?? null,
        };
  return createHash("sha256")
    .update(canonicalize(canonicalArtifact), "utf-8")
    .digest("hex");
};

const isActionableSemanticFinding = (
  item: SemanticValidationFinding
): item is Extract<
  SemanticValidationFinding,
  { verdict: "warning" | "hard_block" }
> => item.verdict !== "pass";

const semanticFindings = (
  report: SemanticValidationReport | undefined
): ArtifactGateFinding[] => {
  return (report?.findings ?? [])
    .filter(isActionableSemanticFinding)
    .map((item) => {
      return {
        validator: item.validator,
        validatorVersion: item.validatorVersion,
        verdict: item.verdict,
        code: item.code,
        field: item.field,
        ...(item.variantId && { variantId: item.variantId }),
        ...(item.nodeId && { nodeId: item.nodeId }),
        reason: item.reason,
        recovery: item.recovery,
      };
    });
};

// Issue #28's recovery decision lives in one table (`recovery-policy.ts`):
// executable or untrusted payloads are replaced, bounded infrastructure
// failures are retried, and schema or relationship breaks are edited.
const structuralFinding = (
  diagnostic: GenerationDiagnostic
): ArtifactGateFinding | null => {
  const verdict =
    diagnostic.verdict ??
    (diagnostic.severity === "error" ? "hard_block" : "warning");
  if (verdict === "pass") {
    return null;
  }

  return {
    validator: diagnostic.validator ?? "structural",
    validatorVersion: diagnostic.validatorVersion ?? lessonValidatorVersion,
    verdict,
    code: diagnostic.code,
    field: diagnostic.field ?? "draft",
    ...(diagnostic.variantId && { variantId: diagnostic.variantId }),
    ...(diagnostic.nodeId && { nodeId: diagnostic.nodeId }),
    reason: diagnostic.message,
    recovery: recoveryForFinding(diagnostic.code, verdict),
  };
};

// The compile guard is fail-closed: any pre-render rejection is a hard block.
// Unknown component, action, catalog, or payload is replaced; every schema,
// id, relationship, or math break is edited; infrastructure is retried.
const preRenderFinding = (
  failure: ArtifactPreRenderFailure
): ArtifactGateFinding => {
  return {
    validator: "structural",
    validatorVersion: a2uiCompileGuardVersion,
    verdict: "hard_block",
    code: failure.code,
    field: failure.field,
    ...(failure.variantId && { variantId: failure.variantId }),
    reason: failure.reason,
    recovery: recoveryForCode(failure.code),
  };
};

const missingLearningPathFinding = (): ArtifactGateFinding => {
  return {
    validator: "structural",
    validatorVersion: lessonValidatorVersion,
    verdict: "hard_block",
    code: "LEARNING_PATH_MISSING",
    field: "learningPath",
    reason:
      "The lesson draft has no validated prerequisite path and cannot be rendered.",
    recovery: "edit",
  };
};

const gateFindings = (input: ArtifactGateInput): ArtifactGateFinding[] => {
  const structuralFindings = (input.structuralDiagnostics ?? []).flatMap(
    (diagnostic) => {
      const finding = structuralFinding(diagnostic);
      return finding ? [finding] : [];
    }
  );
  const missingLearningPath =
    input.kind === "lesson" && !input.learningPath
      ? [missingLearningPathFinding()]
      : [];

  return [
    ...structuralFindings,
    ...missingLearningPath,
    ...semanticFindings(input.kind === "lesson" ? input.report : undefined),
    ...(input.preRenderFailures ?? []).map(preRenderFinding),
  ];
};

const findingsVerdict = (
  findings: readonly ArtifactGateFinding[]
): "pass" | "warning" | "hard_block" => {
  if (findings.some((finding) => finding.verdict === "hard_block")) {
    return "hard_block";
  }
  return findings.some((finding) => finding.verdict === "warning")
    ? "warning"
    : "pass";
};

const findingsRecovery = (
  findings: readonly ArtifactGateFinding[]
): RecoveryAction => {
  const recovery = dominantRecovery(
    findings.map((finding) => finding.recovery)
  );
  if (!recovery) {
    throw new Error("A non-pass gate result needs an actionable finding.");
  }
  return recovery;
};

const createRenderableArtifact = (
  input: ArtifactGateInput,
  artifactHash: string,
  policyVersion: string
): RenderableArtifact | null => {
  if (input.kind === "fraction") {
    return {
      [renderableArtifactBrand]: renderableArtifactBrand,
      kind: "fraction",
      draft: input.draft,
      artifactHash,
      policyVersion,
    };
  }
  if (!input.learningPath) {
    return null;
  }
  return {
    [renderableArtifactBrand]: renderableArtifactBrand,
    kind: "lesson",
    draft: input.draft,
    learningPath: input.learningPath,
    artifactHash,
    policyVersion,
  };
};

export const gateArtifact = (input: ArtifactGateInput): ArtifactGateResult => {
  const policyVersion = input.policyVersion ?? artifactGatePolicyVersion;
  if (!policyVersion.trim()) {
    throw new Error("The artifact gate requires a policy version.");
  }

  const artifactHash = hashArtifact(input);
  const findings = gateFindings(input);
  const verdict = findingsVerdict(findings);
  const renderable = createRenderableArtifact(
    input,
    artifactHash,
    policyVersion
  );

  switch (verdict) {
    case "pass": {
      if (!renderable) {
        throw new Error(
          "A passing artifact gate result must produce a renderable artifact."
        );
      }
      return {
        verdict,
        recovery: null,
        findings: [],
        policyVersion,
        artifactHash,
        renderable,
      };
    }
    case "warning": {
      if (!renderable) {
        throw new Error(
          "A warning artifact gate result must produce a renderable artifact."
        );
      }
      return {
        verdict,
        recovery: findingsRecovery(findings),
        findings,
        policyVersion,
        artifactHash,
        renderable,
      };
    }
    case "hard_block": {
      return {
        verdict,
        recovery: findingsRecovery(findings),
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

/**
 * Serializes a renderable gate result into the evidence acceptance stores on the record. Hard-blocked results have no snapshot: they never persist.
 */
export const snapshotArtifactGateResult = (
  result: ArtifactGateResult
): ArtifactGateSnapshot => {
  if (result.verdict === "hard_block" || !result.renderable) {
    throw new Error(
      "A hard-blocked artifact gate result cannot produce a shareable snapshot."
    );
  }

  return artifactGateSnapshotSchema.parse({
    verdict: result.verdict,
    recovery: result.recovery,
    policyVersion: result.policyVersion,
    artifactHash: result.artifactHash,
    findings: result.findings,
  });
};

export {
  type ArtifactGateValidator,
  type ArtifactGateFinding,
  type ArtifactGateSnapshot,
} from "./artifact-gate-contract";
