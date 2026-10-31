import {
  dominantRecovery,
  recoveryForCode,
} from "@/server/safety/recovery-policy";

import type {
  PublicDiagnosticsRollup,
  PublicGenerationDiagnostic,
  PublicScreenDiagnostics,
  RecoveryAction,
} from "@/shared/generation-contract";
import type { GenerationDiagnostic } from "./types";

/**
 * A branch-new payload for a diagnostic that failed the public scrub. The teacher still sees that a check fired and what to do; the private detail stays on the server.
 */
const SAFE_FINDING_MESSAGE =
  "This draft needs a teacher review before it can continue.";

const MAX_PUBLIC_MESSAGE_LENGTH = 240;

const unsafePublicTextPatterns: readonly RegExp[] = [
  /answer[\s_-]*key/iu,
  /\b(?:api|access|secret|session|auth|private|service)[\s_-]*key\b/iu,
  /\b(?:secret|token|password|credential)s?\b/iu,
  /\bsk-[a-z\d_-]{6,}/iu,
  /\bbearer\s+[a-z\d._~+/-]{8,}/iu,
  /student[\s_-]*(?:id|identifier|record|profile|email|name)/iu,
  /learner[\s_-]*(?:id|identifier|record|profile|email|name)/iu,
  /raw[\s_-]*provider|provider[\s_-]*(?:raw|response|payload|body)/iu,
  /<script/iu,
  /chain[\s_-]*of[\s_-]*thought/iu,
];

const isUnsafePublicText = (value: string): boolean =>
  unsafePublicTextPatterns.some((pattern) => pattern.test(value));

/**
 * Normalizes teacher-facing copy and replaces it when it carries an answer key, a secret, a token, raw provider text, or a student identifier.
 */
export const scrubPublicMessage = (message: string): string => {
  const normalized = message.trim().replaceAll(/\s+/gu, " ");
  return !normalized ||
    normalized.length > MAX_PUBLIC_MESSAGE_LENGTH ||
    isUnsafePublicText(normalized)
    ? SAFE_FINDING_MESSAGE
    : normalized;
};

const unsafeIdentifierPattern =
  /(?:student|learner|identity|user|answer|secret|token|password|email)/iu;

const safePublicIdentifier = (
  value: string | undefined
): string | undefined => {
  if (!value || !/^[a-z][a-z\d_.:-]{0,79}$/iu.test(value)) {
    return undefined;
  }
  return unsafeIdentifierPattern.test(value) ? undefined : value;
};

const safePublicField = (value: string | undefined): string | undefined =>
  value && /^[a-z][a-z\d_.:-]{0,119}$/iu.test(value) ? value : undefined;

const recoveryForDiagnostic = (
  diagnostic: GenerationDiagnostic
): RecoveryAction => diagnostic.recovery ?? recoveryForCode(diagnostic.code);

const diagnosticVerdict = (
  diagnostic: PublicGenerationDiagnostic
): "warning" | "hard_block" => {
  if (diagnostic.verdict === "hard_block") {
    return "hard_block";
  }
  if (diagnostic.verdict === "warning") {
    return "warning";
  }
  return diagnostic.severity === "error" ? "hard_block" : "warning";
};

const toPublicDiagnostic = (
  diagnostic: GenerationDiagnostic
): PublicGenerationDiagnostic => {
  const variantId = safePublicIdentifier(diagnostic.variantId);
  const nodeId = safePublicIdentifier(diagnostic.nodeId);
  const field = safePublicField(diagnostic.field);
  const validatorVersion = safePublicIdentifier(diagnostic.validatorVersion);

  return {
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: scrubPublicMessage(diagnostic.message),
    ...(variantId && { variantId }),
    ...(field && { field }),
    ...(nodeId && { nodeId }),
    ...(diagnostic.validator && { validator: diagnostic.validator }),
    ...((diagnostic.verdict === "warning" ||
      diagnostic.verdict === "hard_block") && { verdict: diagnostic.verdict }),
    ...(validatorVersion && { validatorVersion }),
    ...(diagnostic.moderationCategory && {
      moderationCategory: diagnostic.moderationCategory,
    }),
    ...(diagnostic.recommendation && {
      recommendation: scrubPublicMessage(diagnostic.recommendation),
    }),
    recovery: recoveryForDiagnostic(diagnostic),
  };
};

const isActionable = (diagnostic: PublicGenerationDiagnostic): boolean =>
  diagnostic.verdict !== "pass";

const screenVerdict = (
  findings: readonly PublicGenerationDiagnostic[]
): "warning" | "hard_block" => {
  return findings.some((finding) => diagnosticVerdict(finding) === "hard_block")
    ? "hard_block"
    : "warning";
};

const dominantFindingRecovery = (
  findings: readonly PublicGenerationDiagnostic[]
): RecoveryAction | null => {
  return dominantRecovery(
    findings.map((finding) => finding.recovery ?? "edit")
  );
};

const overallVerdict = (
  screens: readonly PublicScreenDiagnostics[],
  flow: readonly PublicGenerationDiagnostic[]
): "pass" | "warning" | "hard_block" => {
  const findings = [...screens.flatMap((screen) => screen.findings), ...flow];
  if (findings.length === 0) {
    return "pass";
  }
  return findings.some((finding) => diagnosticVerdict(finding) === "hard_block")
    ? "hard_block"
    : "warning";
};

export interface PublicDiagnosticsPayload {
  diagnostics: PublicGenerationDiagnostic[];
  rollup: PublicDiagnosticsRollup;
}

/**
 * The public diagnostics seam: per-screen findings plus a flow-level roll-up.
 * It scrubs private detail and gives every finding exactly one recovery action.
 */
export const toPublicDiagnosticsPayload = (
  diagnostics: readonly GenerationDiagnostic[]
): PublicDiagnosticsPayload => {
  const publicDiagnostics = diagnostics
    .map((diagnostic) => toPublicDiagnostic(diagnostic))
    .filter((diagnostic) => isActionable(diagnostic));

  const findingsByScreen = new Map<string, PublicGenerationDiagnostic[]>();
  const flow: PublicGenerationDiagnostic[] = [];
  for (const finding of publicDiagnostics) {
    if (finding.variantId) {
      const findings = findingsByScreen.get(finding.variantId) ?? [];
      findings.push(finding);
      findingsByScreen.set(finding.variantId, findings);
    } else {
      flow.push(finding);
    }
  }

  const screens: PublicScreenDiagnostics[] = [...findingsByScreen].map(
    ([variantId, findings]) => {
      return {
        variantId,
        verdict: screenVerdict(findings),
        findings,
      };
    }
  );

  const verdict = overallVerdict(screens, flow);
  const actionableFindings = [
    ...screens.flatMap((screen) => screen.findings),
    ...flow,
  ];

  return {
    diagnostics: publicDiagnostics,
    rollup: {
      verdict,
      recovery:
        verdict === "pass" ? null : dominantFindingRecovery(actionableFindings),
      screens,
      flow,
      affectedScreens: screens.map((screen) => screen.variantId),
    },
  };
};
