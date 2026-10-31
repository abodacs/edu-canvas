import { z } from "zod";

import {
  recoveryActionValues,
  semanticValidatorRoleValues,
} from "@/shared/generation-contract";
import type { RecoveryAction } from "@/shared/generation-contract";

/**
 * A deterministic or semantic validator that produced a finding. `structural`
 * covers the draft gate and the A2UI compile guard; the other values keep the
 * semantic validator provenance.
 */
export type ArtifactGateValidator =
  "structural" | (typeof semanticValidatorRoleValues)[number];

export interface ArtifactGateFinding {
  validator: ArtifactGateValidator;
  validatorVersion: string;
  verdict: "warning" | "hard_block";
  code: string;
  field: string;
  variantId?: string;
  nodeId?: string;
  reason: string;
  recovery: RecoveryAction;
}

/**
 * The serializable evidence acceptance persists beside a renderable artifact.
 * It never carries a renderable artifact: only `gateArtifact` mints that.
 */
export interface ArtifactGateSnapshot {
  verdict: "pass" | "warning";
  recovery: RecoveryAction | null;
  policyVersion: string;
  artifactHash: string;
  findings: readonly ArtifactGateFinding[];
}

export const artifactGateFindingSchema = z
  .object({
    validator: z.union([
      z.literal("structural"),
      z.enum(semanticValidatorRoleValues),
    ]),
    validatorVersion: z.string().min(1),
    verdict: z.enum(["warning", "hard_block"]),
    code: z.string().min(1),
    field: z.string().min(1),
    variantId: z.string().optional(),
    nodeId: z.string().optional(),
    reason: z.string().min(1),
    recovery: z.enum(recoveryActionValues),
  })
  .strict();

export const artifactGateSnapshotSchema = z
  .object({
    verdict: z.enum(["pass", "warning"]),
    recovery: z.enum(recoveryActionValues).nullable(),
    policyVersion: z.string().trim().min(1),
    artifactHash: z.string().regex(/^[a-f\d]{64}$/u),
    findings: z.array(artifactGateFindingSchema),
  })
  .strict();
