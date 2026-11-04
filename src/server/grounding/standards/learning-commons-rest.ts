import { z } from "zod";

import {
  LEARNING_COMMONS_PROVENANCE,
  PILOT_STANDARD_REGISTRY,
  findRegistryEntry,
} from "./pilot-registry";
import {
  GROUNDING_TEXT_LIMITS,
  StandardGroundingError,
  boundText,
  hashStandardGrounding,
  safeSourceLink,
  sha256Hex,
} from "./types";

import type {
  PilotStandardRegistry,
  StandardRegistryEntry,
} from "./pilot-registry";
import type {
  GroundedComponent,
  GroundedPrerequisite,
  PrerequisiteResolution,
  StandardGroundingFacts,
  StandardGroundingGap,
  StandardResolution,
} from "./types";

/**
One provider response. The body stays `unknown` until this adapter parses it;
neither a raw provider object nor an arbitrary URL fetch crosses the adapter.
*/
export interface ProviderResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface LearningCommonsTransport {
  readonly findStandard: (
    input: {
      readonly jurisdiction: string;
      readonly statementCode: string;
    },
    context: { readonly signal?: AbortSignal }
  ) => Promise<ProviderResponse>;
  readonly findComponents: (
    input: { readonly caseIdentifierUUID: string },
    context: { readonly signal?: AbortSignal }
  ) => Promise<ProviderResponse>;
  readonly findProgression: (
    input: { readonly caseIdentifierUUID: string },
    context: { readonly signal?: AbortSignal }
  ) => Promise<ProviderResponse>;
}

export const LEARNING_COMMONS_REST_ORIGIN =
  "https://api.learningcommons.org/knowledge-graph/v0";

/**
UNVERIFIED LIVE PATHS. These three paths are reconstructed from the recorded
MCP tool shapes (`find_standard_statement`,
`find_learning_components_from_standard`,
`find_standards_progression_from_standard`). Only `/academic-standards/search`
was recorded against the REST API. Nothing here is live-verified: a live
404/401 must surface `unsupported-envelope`, never an empty content gap.

The exact live check that must replace this reconstruction: with
`LEARNING_COMMONS_API_KEY` present, GET all three paths for one pilot row in
each jurisdiction, record the status, body and schema into
`docs/research/142-mcp-eval/evidence.json`, then replay that evidence through
`createRecordedLearningCommonsTransport`. Do not claim live verification before
that record exists.
*/
const REST_PATHS = {
  standards: "/academic-standards",
  components: (caseIdentifierUUID: string): string => {
    return `/academic-standards/${encodeURIComponent(caseIdentifierUUID)}/learning-components`;
  },
  progression: (caseIdentifierUUID: string): string => {
    return `/academic-standards/${encodeURIComponent(caseIdentifierUUID)}/progression`;
  },
} as const;

export interface LearningCommonsRestTransportOptions {
  readonly apiKey: string;
  readonly origin?: string;
  readonly fetchImpl?: typeof fetch;
}

const REST_SEARCH_LIMIT = "5";

const requireSafeOrigin = (origin: string): string => {
  const parsed = new URL(origin);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "api.learningcommons.org"
  ) {
    throw new Error(
      "Learning Commons transport requires the fixed HTTPS API origin."
    );
  }
  return parsed.origin + parsed.pathname.replace(/\/$/u, "");
};

const readJsonBody = async (response: Response): Promise<unknown> => {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
};

/**
The production transport. Every request goes to a fixed Learning Commons path;
a provider field can never select a URL. The API key stays in the request
header and is never logged. The live matrix is unrun because no credential is
present; recorded fixtures drive the tests.
*/
export const createLearningCommonsRestTransport = (
  options: LearningCommonsRestTransportOptions
): LearningCommonsTransport => {
  if (options.apiKey.trim().length === 0) {
    throw new Error("Learning Commons transport requires an API key.");
  }
  const origin = requireSafeOrigin(
    options.origin ?? LEARNING_COMMONS_REST_ORIGIN
  );
  const fetchImpl = options.fetchImpl ?? fetch;

  const request = async (
    path: string,
    query: Readonly<Record<string, string>>,
    signal: AbortSignal | undefined
  ): Promise<ProviderResponse> => {
    const url = new URL(`${origin}${path}`);
    for (const [name, value] of Object.entries(query)) {
      url.searchParams.set(name, value);
    }
    const response = await fetchImpl(url, {
      headers: { "x-api-key": options.apiKey },
      redirect: "error",
      ...(signal === undefined ? {} : { signal }),
    });
    return { status: response.status, body: await readJsonBody(response) };
  };

  return {
    findStandard: (input, context) => {
      return request(
        REST_PATHS.standards,
        {
          statementCode: input.statementCode,
          jurisdiction: input.jurisdiction,
          limit: REST_SEARCH_LIMIT,
        },
        context.signal
      );
    },
    findComponents: (input, context) => {
      return request(
        REST_PATHS.components(input.caseIdentifierUUID),
        {},
        context.signal
      );
    },
    findProgression: (input, context) => {
      return request(
        REST_PATHS.progression(input.caseIdentifierUUID),
        { direction: "backward" },
        context.signal
      );
    },
  };
};

export interface ResolveStandardInput {
  readonly jurisdiction: string;
  readonly statementCode: string;
}

export interface LearningCommonsAdapter {
  readonly resolve: (
    input: ResolveStandardInput,
    context?: { readonly signal?: AbortSignal }
  ) => Promise<StandardResolution>;
}

export interface LearningCommonsAdapterOptions {
  readonly transport: LearningCommonsTransport;
  readonly registry?: PilotStandardRegistry;
  readonly now?: () => string;
}

const CURRENT_ISO = (): string => new Date().toISOString();

const providerUnavailable = (cause?: unknown): StandardGroundingError => {
  return new StandardGroundingError(
    "The Learning Commons provider is unavailable. Retry the retrieval.",
    "provider-unavailable",
    { retryable: true, recovery: "retry", cause }
  );
};

const timeout = (cause?: unknown): StandardGroundingError => {
  return new StandardGroundingError(
    "The Learning Commons retrieval exceeded its total deadline.",
    "resolution-timeout",
    { retryable: true, recovery: "retry", cause }
  );
};

const assertNotAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) {
    throw timeout();
  }
};

const isServerFailure = (response: ProviderResponse): boolean => {
  return response.status === 0 || response.status >= 500;
};

const isClientFailure = (response: ProviderResponse): boolean => {
  return response.status >= 400 && response.status < 500;
};

/**
A 4xx on a sub-resource says the path or credential is wrong, not that the
standard has no skills or prerequisites. It must stay distinguishable from a
genuine empty 200 body.
*/
const clientFailureGap = (
  stage: "components" | "prerequisites",
  status: number
): StandardGroundingGap => {
  return {
    code: "unsupported-envelope",
    message: `The provider rejected the ${stage} request with HTTP ${status}; the reconstructed ${stage} path is unverified, so no content is claimed.`,
  };
};

/**
Provider shapes, pinned to the recorded evidence:
- `standards[]` for a statement scan and a backward progression
- `learning_components[]` with `identifier` and `description`
Extra provider keys are accepted but never retained.
*/
const standardItemSchema = z
  .object({
    academicSubject: z.string().optional(),
    alternateStatementCode: z.string().optional(),
    attribution: z.string().optional(),
    caseIdentifierUUID: z.string().min(1),
    deprecated: z.boolean().optional(),
    description: z.string().min(1),
    gradeLevel: z.array(z.string()).optional(),
    gradeLevels: z.array(z.string()).optional(),
    isCurrent: z.boolean().optional(),
    jurisdiction: z.string().min(1),
    license: z.string().optional(),
    sourceLink: z.string().optional(),
    statementCode: z.string().min(1),
    status: z.string().optional(),
  })
  .loose();

const standardsEnvelopeSchema = z
  .object({
    standards: z.array(standardItemSchema).max(50),
  })
  .loose();

const componentsEnvelopeSchema = z
  .object({
    learning_components: z
      .array(
        z
          .object({
            description: z.string().min(1),
            identifier: z.string().min(1),
          })
          .loose()
      )
      .max(500),
  })
  .loose();

const progressionItemSchema = z
  .object({
    alignmentScore: z.number().optional(),
    caseIdentifierUUID: z.string().optional(),
    description: z.string().optional(),
    jurisdiction: z.string().optional(),
    matchType: z.string().optional(),
    statementCode: z.string().min(1),
  })
  .loose();

const progressionEnvelopeSchema = z
  .object({
    message: z.string().optional(),
    standards: z.array(progressionItemSchema).max(100),
  })
  .loose();

type StandardItem = z.infer<typeof standardItemSchema>;

const parseStandards = (body: unknown): StandardItem[] => {
  const parsed = standardsEnvelopeSchema.safeParse(body);
  return parsed.success ? parsed.data.standards : [];
};

const parseComponents = (body: unknown): GroundedComponent[] => {
  const parsed = componentsEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.learning_components.map((component) => {
    return {
      id: boundText(component.identifier, GROUNDING_TEXT_LIMITS.statementCode),
      text: boundText(component.description, GROUNDING_TEXT_LIMITS.component),
    };
  });
};

const parseProgression = (body: unknown): GroundedPrerequisite[] => {
  const parsed = progressionEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.standards.map((row) => {
    return {
      statementCode: boundText(
        row.statementCode,
        GROUNDING_TEXT_LIMITS.statementCode
      ),
      jurisdiction: row.jurisdiction ?? "Multi-State",
      matchType: row.matchType ?? "unknown",
      alignmentScore: row.alignmentScore ?? 0,
    };
  });
};

const notCurrent = (item: StandardItem): boolean => {
  return (
    item.isCurrent === false ||
    item.deprecated === true ||
    item.status === "superseded" ||
    item.status === "retired"
  );
};

interface ResolutionParts {
  readonly entry: StandardRegistryEntry;
  readonly description: string | null;
  readonly descriptionHash: string | null;
  readonly standardId: string | null;
  readonly components: readonly GroundedComponent[];
  readonly prerequisites: readonly GroundedPrerequisite[];
  readonly prerequisiteResolution: PrerequisiteResolution;
  readonly gaps: readonly StandardGroundingGap[];
  readonly license: string;
  readonly attribution: string;
  readonly sourceLink: string;
}

const resolvePrerequisites = (
  entry: StandardRegistryEntry,
  rows: readonly GroundedPrerequisite[],
  gaps: StandardGroundingGap[]
): {
  readonly prerequisites: readonly GroundedPrerequisite[];
  readonly resolution: PrerequisiteResolution;
} => {
  if (rows.length === 0) {
    gaps.push({
      code: "prerequisites-unavailable",
      message:
        "The provider returned no prerequisite rows. Empty is reported, not read as none.",
    });
    return { prerequisites: [], resolution: "unavailable" };
  }

  const exactRows = rows.filter((row) => {
    return (
      (row.matchType === "exact" || row.matchType === "direct") &&
      row.alignmentScore >= 1
    );
  });

  if (entry.prerequisiteResolution === "direct") {
    if (exactRows.length !== rows.length) {
      gaps.push({
        code: "prerequisites-unavailable",
        message:
          "The provider returned a prerequisite row that is not a direct edge.",
      });
      return { prerequisites: [], resolution: "unavailable" };
    }
    return { prerequisites: exactRows, resolution: "direct" };
  }

  if (exactRows.length === 0) {
    gaps.push(
      {
        code: "crosswalk-inexact",
        message:
          "The crosswalk returned no exact prerequisite row, so no prerequisite is claimed.",
      },
      {
        code: "prerequisites-unavailable",
        message:
          "The crosswalk could not supply an exact prerequisite, so the path is unavailable.",
      }
    );
    return { prerequisites: [], resolution: "unavailable" };
  }

  if (exactRows.length !== rows.length) {
    gaps.push({
      code: "crosswalk-inexact",
      message:
        "Part of the crosswalk was inexact; only exact rows are used as prerequisites.",
    });
  }
  return { prerequisites: exactRows, resolution: "crosswalk" };
};

const buildResolution = (
  parts: ResolutionParts,
  retrievedAt: string,
  registryVersion: string
) => {
  const facts: StandardGroundingFacts = {
    registryVersion,
    frameworkId: parts.entry.frameworkId,
    jurisdiction: parts.entry.jurisdiction,
    statementCode: parts.entry.statementCode,
    subject: parts.entry.subject,
    grade: parts.entry.grade,
    standardId: parts.standardId,
    description: parts.description,
    components: parts.components,
    prerequisites: parts.prerequisites,
    prerequisiteResolution: parts.prerequisiteResolution,
    gaps: parts.gaps,
    provenance: {
      license: parts.license,
      attribution: parts.attribution,
      sourceLink: parts.sourceLink,
      retrievedAt,
    },
  };
  return {
    ...facts,
    descriptionHash: parts.descriptionHash,
    contentHash: hashStandardGrounding(facts),
  };
};

const unresolved = (
  entry: StandardRegistryEntry,
  gaps: readonly StandardGroundingGap[],
  retrievedAt: string,
  registryVersion: string
): StandardResolution => {
  return buildResolution(
    {
      entry,
      description: null,
      descriptionHash: null,
      standardId: null,
      components: [],
      prerequisites: [],
      prerequisiteResolution: "unavailable",
      gaps,
      license: entry.provenance.license,
      attribution: entry.provenance.attribution,
      sourceLink: entry.provenance.sourceLink,
    },
    retrievedAt,
    registryVersion
  );
};

const entryForEnvelopeMiss = (
  registry: PilotStandardRegistry,
  input: ResolveStandardInput
): StandardRegistryEntry => {
  const envelope =
    registry.envelopes.find((candidate) => {
      return candidate.jurisdiction === input.jurisdiction;
    }) ?? registry.envelopes[0];
  return {
    id: `${input.jurisdiction}-${input.statementCode}`,
    kind: "boundary",
    jurisdiction: input.jurisdiction,
    statementCode: input.statementCode,
    subject: envelope?.subject ?? "Unknown",
    grade: Math.trunc(Number(input.statementCode)) || 0,
    frameworkId: "unregistered",
    prerequisiteResolution: "direct",
    provenance: LEARNING_COMMONS_PROVENANCE,
    expectedGaps: [],
  };
};

/**
Standard → components → prerequisites, in one bounded pipeline. A zero-row
answer is an explicit gap at every stage; the adapter never turns an empty
provider answer into a confident one.
*/
export const createLearningCommonsAdapter = (
  options: LearningCommonsAdapterOptions
): LearningCommonsAdapter => {
  const registry = options.registry ?? PILOT_STANDARD_REGISTRY;
  const now = options.now ?? CURRENT_ISO;

  return {
    async resolve(input, context = {}) {
      const retrievedAt = now();
      const lookup = findRegistryEntry(registry, input);
      if (!lookup.ok) {
        return unresolved(
          entryForEnvelopeMiss(registry, input),
          [lookup.gap],
          retrievedAt,
          registry.version
        );
      }
      const { entry } = lookup;

      assertNotAborted(context.signal);
      const statementResponse = await options.transport
        .findStandard(input, context)
        .catch((error: unknown) => {
          throw providerUnavailable(error);
        });
      if (isServerFailure(statementResponse)) {
        throw providerUnavailable(statementResponse);
      }
      if (isClientFailure(statementResponse)) {
        return unresolved(
          entry,
          [
            {
              code: "standard-absent",
              message:
                "The provider rejected the standard scan for this envelope.",
            },
          ],
          retrievedAt,
          registry.version
        );
      }

      const standards = parseStandards(statementResponse.body);
      if (standards.length > 1) {
        return unresolved(
          entry,
          [
            {
              code: "framework-ambiguous",
              message:
                "The provider returned more than one standard for this code; the adapter does not guess.",
            },
          ],
          retrievedAt,
          registry.version
        );
      }
      const [standard] = standards;
      if (!standard) {
        return unresolved(
          entry,
          [
            {
              code: "standard-absent",
              message:
                "The provider returned no standard for this code in the supported envelope.",
            },
          ],
          retrievedAt,
          registry.version
        );
      }

      const gaps: StandardGroundingGap[] = [];
      if (notCurrent(standard)) {
        gaps.push({
          code: "standard-not-current",
          message:
            "The provider marks this standard as superseded or not current.",
        });
      }

      const description = boundText(
        standard.description,
        GROUNDING_TEXT_LIMITS.description
      );
      const descriptionHash = sha256Hex(description);

      assertNotAborted(context.signal);
      const componentResponse = await options.transport
        .findComponents(
          { caseIdentifierUUID: standard.caseIdentifierUUID },
          context
        )
        .catch((error: unknown) => {
          throw providerUnavailable(error);
        });
      if (isServerFailure(componentResponse)) {
        throw providerUnavailable(componentResponse);
      }
      const components = isClientFailure(componentResponse)
        ? []
        : parseComponents(componentResponse.body);
      if (isClientFailure(componentResponse)) {
        gaps.push(clientFailureGap("components", componentResponse.status));
      } else if (components.length === 0) {
        gaps.push({
          code: "skills-missing",
          message:
            "The provider returned no learning components. Empty is reported, not read as none.",
        });
      }

      assertNotAborted(context.signal);
      const progressionResponse = await options.transport
        .findProgression(
          { caseIdentifierUUID: standard.caseIdentifierUUID },
          context
        )
        .catch((error: unknown) => {
          throw providerUnavailable(error);
        });
      if (isServerFailure(progressionResponse)) {
        throw providerUnavailable(progressionResponse);
      }
      let prerequisiteOutcome: {
        readonly prerequisites: readonly GroundedPrerequisite[];
        readonly resolution: PrerequisiteResolution;
      };
      if (isClientFailure(progressionResponse)) {
        gaps.push(
          clientFailureGap("prerequisites", progressionResponse.status)
        );
        prerequisiteOutcome = { prerequisites: [], resolution: "unavailable" };
      } else {
        prerequisiteOutcome = resolvePrerequisites(
          entry,
          parseProgression(progressionResponse.body),
          gaps
        );
      }

      const license = boundText(
        standard.license ?? entry.provenance.license,
        GROUNDING_TEXT_LIMITS.license
      );
      const attribution = boundText(
        standard.attribution ?? entry.provenance.attribution,
        GROUNDING_TEXT_LIMITS.attribution
      );
      const sourceLink = safeSourceLink(
        standard.sourceLink,
        entry.provenance.sourceLink
      );

      return buildResolution(
        {
          entry,
          description,
          descriptionHash,
          standardId: standard.caseIdentifierUUID,
          components,
          prerequisites: prerequisiteOutcome.prerequisites,
          prerequisiteResolution: prerequisiteOutcome.resolution,
          gaps,
          license,
          attribution,
          sourceLink,
        },
        retrievedAt,
        registry.version
      );
    },
  };
};
