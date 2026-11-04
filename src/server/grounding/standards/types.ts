import { createHash } from "node:crypto";

/**
The fixed gap vocabulary for a standard retrieval (#218). A resolution reports
one of these codes instead of a generic failure, so a teacher can see what the
provider did not supply.
*/
export const STANDARD_GROUNDING_GAP_CODES = [
  "standard-absent",
  "unsupported-envelope",
  "skills-missing",
  "prerequisites-unavailable",
  "crosswalk-inexact",
  "framework-ambiguous",
  "standard-not-current",
] as const;

export type StandardGroundingGapCode =
  (typeof STANDARD_GROUNDING_GAP_CODES)[number];

export interface StandardGroundingGap {
  readonly code: StandardGroundingGapCode;
  readonly message: string;
}

export const PREREQUISITE_RESOLUTIONS = [
  "direct",
  "crosswalk",
  "unavailable",
] as const;

export type PrerequisiteResolution = (typeof PREREQUISITE_RESOLUTIONS)[number];

export interface GroundedComponent {
  readonly id: string;
  readonly text: string;
}

export interface GroundedPrerequisite {
  readonly statementCode: string;
  readonly jurisdiction: string;
  readonly matchType: string;
  readonly alignmentScore: number;
}

export interface StandardProvenance {
  readonly license: string;
  readonly attribution: string;
  readonly sourceLink: string;
  readonly retrievedAt: string;
}

/** One total provider-pipeline budget, shared by every stage of a retrieval. */
export const DEFAULT_RESOLUTION_DEADLINE_MS = 10_000;

/** Bounded text keeps a hostile or oversized provider body out of storage. */
export const GROUNDING_TEXT_LIMITS = {
  description: 1200,
  component: 400,
  statementCode: 40,
  attribution: 200,
  license: 120,
} as const;

const SAFE_SOURCE_HOSTS = ["learningcommons.org", "corestandards.org"] as const;

export const boundText = (value: string, limit: number): string => {
  const normalized = value.trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
};

/**
Only an HTTPS link on a known standards host is kept. The adapter never fetches
a provider-supplied URL; a bad link falls back to the registry's safe link.
*/
export const safeSourceLink = (
  candidate: string | undefined,
  fallback: string
): string => {
  if (!candidate) {
    return fallback;
  }
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    const allowed = SAFE_SOURCE_HOSTS.some((safeHost) => {
      return host === safeHost || host.endsWith(`.${safeHost}`);
    });
    if (
      url.protocol !== "https:" ||
      !allowed ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      return fallback;
    }
    return url.toString();
  } catch {
    return fallback;
  }
};

export const sha256Hex = (value: string): string => {
  return createHash("sha256").update(value).digest("hex");
};

export interface StandardGroundingFacts {
  readonly registryVersion: string;
  readonly frameworkId: string;
  readonly jurisdiction: string;
  readonly statementCode: string;
  readonly subject: string;
  readonly grade: number;
  readonly standardId: string | null;
  readonly description: string | null;
  readonly components: readonly GroundedComponent[];
  readonly prerequisites: readonly GroundedPrerequisite[];
  readonly prerequisiteResolution: PrerequisiteResolution;
  readonly gaps: readonly StandardGroundingGap[];
  readonly provenance: StandardProvenance;
}

export const hashStandardGrounding = (
  facts: StandardGroundingFacts
): string => {
  const canonical = {
    registryVersion: facts.registryVersion,
    frameworkId: facts.frameworkId,
    jurisdiction: facts.jurisdiction,
    statementCode: facts.statementCode,
    subject: facts.subject,
    grade: facts.grade,
    standardId: facts.standardId,
    description: facts.description,
    components: facts.components.map((component) => {
      return { id: component.id, text: component.text };
    }),
    prerequisites: facts.prerequisites.map((prerequisite) => {
      return {
        statementCode: prerequisite.statementCode,
        jurisdiction: prerequisite.jurisdiction,
        matchType: prerequisite.matchType,
        alignmentScore: prerequisite.alignmentScore,
      };
    }),
    prerequisiteResolution: facts.prerequisiteResolution,
    gaps: facts.gaps.map((gap) => {
      return { code: gap.code, message: gap.message };
    }),
    provenance: {
      license: facts.provenance.license,
      attribution: facts.provenance.attribution,
      sourceLink: facts.provenance.sourceLink,
    },
  };
  return sha256Hex(JSON.stringify(canonical));
};

export const hashGroundingInput = (input: {
  readonly tenantId: string;
  readonly jurisdiction: string;
  readonly statementCode: string;
}): string => {
  return sha256Hex(
    [input.tenantId, input.jurisdiction, input.statementCode].join("\0")
  );
};

export interface StandardResolution extends StandardGroundingFacts {
  readonly descriptionHash: string | null;
  readonly contentHash: string;
}

export interface StandardGroundingRecord extends StandardResolution {
  readonly id: string;
  readonly tenantId: string;
  readonly requestKey: string;
  readonly inputHash: string;
  readonly retrievalAttempt: 1 | 2;
  readonly retrievedAt: string;
  readonly predecessorGroundingId: string | null;
  readonly createdAt: string;
}

export const STANDARD_GROUNDING_ERROR_CODES = [
  "invalid-request",
  "resolution-timeout",
  "provider-unavailable",
  "idempotency-key-reused",
  "persistence-conflict",
] as const;

export type StandardGroundingErrorCode =
  (typeof STANDARD_GROUNDING_ERROR_CODES)[number];

export type StandardGroundingRecovery = "retry" | "correct-request" | "none";

export interface StandardGroundingErrorOptions extends ErrorOptions {
  readonly retryable: boolean;
  readonly recovery: StandardGroundingRecovery;
}

/**
Every rejection names the recovery the teacher can take. A malformed request is
correctable, a timeout is retryable, and an exhausted retry is terminal.
*/
export class StandardGroundingError extends Error {
  readonly code: StandardGroundingErrorCode;
  readonly retryable: boolean;
  readonly recovery: StandardGroundingRecovery;

  constructor(
    message: string,
    code: StandardGroundingErrorCode,
    options: StandardGroundingErrorOptions
  ) {
    super(message, options);
    this.name = "StandardGroundingError";
    this.code = code;
    this.retryable = options.retryable;
    this.recovery = options.recovery;
  }
}
