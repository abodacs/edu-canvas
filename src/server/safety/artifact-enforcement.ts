import { FRACTIONS_CATALOG_VERSION } from "@/shared/a2ui-contract";

import { validateProviderDraft } from "@/server/generation/validation";
import { gateArtifact } from "./artifact-gate";
import type { LessonGenerationRecord } from "@/server/generation/types";
import type { RecoveryAction } from "@/shared/generation-contract";

import type {
  ArtifactGateFinding,
  ArtifactGateResult,
  ArtifactGateSnapshot,
  ArtifactPreRenderFailure,
  RenderableArtifact,
} from "./artifact-gate";

export type StoredArtifactGateRefusalCode =
  | "GATE_RECORD_NOT_READY"
  | "GATE_ARTIFACT_MISSING"
  | "GATE_SNAPSHOT_MISSING"
  | "GATE_SNAPSHOT_STALE"
  | "GATE_HARD_BLOCKED";

export interface StoredArtifactGateRefusal {
  code: StoredArtifactGateRefusalCode;
  message: string;
  verdict?: "hard_block";
  findings: readonly ArtifactGateFinding[];
  recovery: RecoveryAction;
}

export type RenderableArtifactGateResult = Extract<
  ArtifactGateResult,
  { renderable: RenderableArtifact }
>;

export type StoredArtifactGateOutcome =
  | {
      ok: true;
      result: RenderableArtifactGateResult;
      snapshot: ArtifactGateSnapshot;
    }
  | { ok: false; refusal: StoredArtifactGateRefusal };

export interface StoredArtifactGateOptions {
  /**
   * Deterministic compile-guard rejections collected by the render seam. The gate owns their verdict; the compile seam only maps the failure.
   */
  preRenderFailures?: readonly ArtifactPreRenderFailure[];
}

const refusal = (
  code: StoredArtifactGateRefusalCode,
  message: string,
  recovery: RecoveryAction,
  extra: {
    verdict?: "hard_block";
    findings?: readonly ArtifactGateFinding[];
  } = {}
): StoredArtifactGateOutcome => {
  return {
    ok: false,
    refusal: {
      code,
      message,
      findings: extra.findings ?? [],
      recovery,
      ...(extra.verdict && { verdict: extra.verdict }),
    },
  };
};

const isFractionRecord = (record: LessonGenerationRecord): boolean =>
  record.provenance?.catalogVersion === FRACTIONS_CATALOG_VERSION;

/**
 * Re-derives the gate from the stored artifact. Preview and Share call this; it never trusts the stored verdict alone.
 */
export const deriveStoredArtifactGate = (
  record: LessonGenerationRecord,
  options: StoredArtifactGateOptions = {}
): ArtifactGateResult => {
  const { preRenderFailures } = options;
  if (isFractionRecord(record)) {
    if (!record.fractionDraft) {
      throw new Error(
        "A fraction-pinned record cannot be gated without its fraction draft."
      );
    }
    return gateArtifact({
      kind: "fraction",
      draft: record.fractionDraft,
      ...(preRenderFailures && { preRenderFailures }),
    });
  }

  if (!record.draft) {
    throw new Error("A lesson record cannot be gated without its draft.");
  }

  // The gate hash covers the artifact's variants and validated learning path.
  // The wrapper metadata (request, provenance, timestamps) stays outside it.
  const structural = validateProviderDraft(
    { variants: record.draft.variants },
    { expectedLanguage: record.input.language }
  );

  return gateArtifact({
    kind: "lesson",
    draft: { variants: record.draft.variants },
    learningPath: record.draft.learningPath,
    structuralDiagnostics: structural.diagnostics,
    ...(preRenderFailures && { preRenderFailures }),
  });
};

/**
 * Re-derives the gate and proves the stored snapshot still describes this artifact under the current policy. Returns the branded artifact only when the derivation is renderable.
 */
export const gateStoredArtifact = (
  record: LessonGenerationRecord,
  options: StoredArtifactGateOptions = {}
): StoredArtifactGateOutcome => {
  if (record.state !== "ready-for-review") {
    return refusal(
      "GATE_RECORD_NOT_READY",
      "Only a ready-for-review artifact can be rendered or shared.",
      "retry"
    );
  }

  if (!record.draft && !record.fractionDraft) {
    return refusal(
      "GATE_ARTIFACT_MISSING",
      "The record has no stored artifact to gate. Generate the draft again.",
      "retry"
    );
  }

  const snapshot = record.gate;
  if (!snapshot) {
    return refusal(
      "GATE_SNAPSHOT_MISSING",
      "The artifact has no accepted safety-gate snapshot. Re-derive the gate before rendering or sharing.",
      "retry"
    );
  }

  const result = deriveStoredArtifactGate(record, options);

  if (snapshot.policyVersion !== result.policyVersion) {
    return refusal(
      "GATE_SNAPSHOT_STALE",
      `The artifact was accepted under ${snapshot.policyVersion}, but the current policy is ${result.policyVersion}. Re-derive the gate before rendering or sharing.`,
      "retry"
    );
  }

  if (snapshot.artifactHash !== result.artifactHash) {
    return refusal(
      "GATE_SNAPSHOT_STALE",
      "The stored artifact no longer matches its accepted safety-gate result. Re-derive the gate from the current artifact before rendering or sharing.",
      "retry"
    );
  }

  if (result.verdict === "hard_block") {
    return refusal(
      "GATE_HARD_BLOCKED",
      "The artifact is hard-blocked by the safety gate. Resolve the findings before rendering or sharing.",
      result.recovery,
      { verdict: "hard_block", findings: result.findings }
    );
  }

  return {
    ok: true,
    result,
    snapshot: {
      verdict: result.verdict,
      recovery: result.recovery,
      policyVersion: result.policyVersion,
      artifactHash: result.artifactHash,
      findings: result.findings,
    },
  };
};

export class ArtifactShareRejectedError extends Error {
  readonly refusal: StoredArtifactGateRefusal;

  constructor(
    rejection: StoredArtifactGateRefusal,
    options: ErrorOptions = {}
  ) {
    super(rejection.message, options);
    this.name = "ArtifactShareRejectedError";
    this.refusal = rejection;
  }
}

/**
 * Publication guard (#5): accepts only a snapshot that still passes, and
 * returns the branded renderable artifact. Idempotent and side-effect free.
 */
export const assertShareable = (
  record: LessonGenerationRecord
): RenderableArtifact => {
  const outcome = gateStoredArtifact(record);
  if (!outcome.ok) {
    throw new ArtifactShareRejectedError(outcome.refusal);
  }
  return outcome.result.renderable;
};
