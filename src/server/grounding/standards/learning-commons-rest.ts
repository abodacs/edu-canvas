import { z } from "zod";

import {
  LEARNING_COMMONS_PROVENANCE,
  PILOT_STANDARD_REGISTRY,
  findRegistryEntry,
  gradeFromStatementCode,
} from "./pilot-registry";
import {
  GROUNDING_TEXT_LIMITS,
  StandardGroundingError,
  boundText,
  currentIso,
  hashStandardGrounding,
  resolutionTimeout,
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

/**
 The one transport seam. Every method maps to a fixed Learning Commons REST path;
 a provider field can never select a URL. Pagination stays in the adapter so the
 transport has no loop of its own.
*/
export interface LearningCommonsTransport {
  readonly findFrameworks: (
    input: {
      readonly jurisdiction: string;
      readonly academicSubject: string;
      readonly cursor?: string;
    },
    context: { readonly signal?: AbortSignal }
  ) => Promise<ProviderResponse>;
  readonly findStandardsPage: (
    input: {
      readonly frameworkCaseIdentifierUUID: string;
      readonly cursor?: string;
    },
    context: { readonly signal?: AbortSignal }
  ) => Promise<ProviderResponse>;
  readonly findComponentsPage: (
    input: {
      readonly standardCaseIdentifierUUID: string;
      readonly cursor?: string;
    },
    context: { readonly signal?: AbortSignal }
  ) => Promise<ProviderResponse>;
  readonly findPrerequisitesPage: (
    input: {
      readonly standardCaseIdentifierUUID: string;
      readonly cursor?: string;
    },
    context: { readonly signal?: AbortSignal }
  ) => Promise<ProviderResponse>;
  readonly findCrosswalks: (
    input: {
      readonly standardCaseIdentifierUUID: string;
      readonly jurisdiction: string;
      readonly cursor?: string;
    },
    context: { readonly signal?: AbortSignal }
  ) => Promise<ProviderResponse>;
}

export const LEARNING_COMMONS_REST_ORIGIN =
  "https://api.learningcommons.org/knowledge-graph/v0";

/**
 VERIFIED LIVE 2026-11-04. The pipeline and its responses are recorded in
 `docs/research/standards-generalization/live-matrix.json`:
 - `/standards-frameworks?jurisdiction=&academicSubject=` resolves a current
   framework. The old `/academic-standards?statementCode=` call returns 422.
 - `/academic-standards?standardsFrameworkCaseIdentifierUUID=` scans standards;
   the code can need pagination (California math has more than 1000 rows).
 - `/academic-standards/{uuid}/learning-components`
 - `/academic-standards/{uuid}/prerequisites` (the old `/progression` is 404)
 - `/academic-standards/{uuid}/crosswalks?jurisdiction=Multi-State` supplies the
   CCSS match for a state standard with no direct prerequisites.
*/
const REST_PATHS = {
  frameworks: "/standards-frameworks",
  standards: "/academic-standards",
  components: (caseIdentifierUUID: string): string => {
    return `/academic-standards/${encodeURIComponent(caseIdentifierUUID)}/learning-components`;
  },
  prerequisites: (caseIdentifierUUID: string): string => {
    return `/academic-standards/${encodeURIComponent(caseIdentifierUUID)}/prerequisites`;
  },
  crosswalks: (caseIdentifierUUID: string): string => {
    return `/academic-standards/${encodeURIComponent(caseIdentifierUUID)}/crosswalks`;
  },
} as const;

export interface LearningCommonsRestTransportOptions {
  readonly apiKey: string;
  readonly origin?: string;
  readonly fetchImpl?: typeof fetch;
}

export const LEARNING_COMMONS_REST_LIMITS = {
  frameworks: 100,
  standards: 1000,
  subresource: 100,
} as const;

/**
 Every provider loop has a page ceiling. A provider that keeps saying
 `hasMore: true` can spend the total ten-second deadline but can never keep the
 adapter in an unbounded loop.
*/
export const LEARNING_COMMONS_PAGE_BOUNDS = {
  frameworkPages: 2,
  frameworks: 4,
  standardPagesPerFramework: 10,
  standardPagesTotal: 12,
  componentPages: 5,
  prerequisitePages: 5,
  crosswalkPages: 2,
} as const;

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
 header and is never logged. Redirects are errors so the key cannot follow a
 provider redirect to another host.
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
    query: Readonly<Record<string, string | undefined>>,
    signal: AbortSignal | undefined
  ): Promise<ProviderResponse> => {
    const url = new URL(`${origin}${path}`);
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(name, value);
      }
    }
    const response = await fetchImpl(url, {
      headers: { "x-api-key": options.apiKey },
      redirect: "error",
      ...(signal === undefined ? {} : { signal }),
    });
    return { status: response.status, body: await readJsonBody(response) };
  };

  return {
    findFrameworks: (input, context) => {
      return request(
        REST_PATHS.frameworks,
        {
          jurisdiction: input.jurisdiction,
          academicSubject: input.academicSubject,
          limit: String(LEARNING_COMMONS_REST_LIMITS.frameworks),
          cursor: input.cursor,
        },
        context.signal
      );
    },
    findStandardsPage: (input, context) => {
      return request(
        REST_PATHS.standards,
        {
          standardsFrameworkCaseIdentifierUUID:
            input.frameworkCaseIdentifierUUID,
          limit: String(LEARNING_COMMONS_REST_LIMITS.standards),
          cursor: input.cursor,
        },
        context.signal
      );
    },
    findComponentsPage: (input, context) => {
      return request(
        REST_PATHS.components(input.standardCaseIdentifierUUID),
        {
          limit: String(LEARNING_COMMONS_REST_LIMITS.subresource),
          cursor: input.cursor,
        },
        context.signal
      );
    },
    findPrerequisitesPage: (input, context) => {
      return request(
        REST_PATHS.prerequisites(input.standardCaseIdentifierUUID),
        {
          limit: String(LEARNING_COMMONS_REST_LIMITS.subresource),
          cursor: input.cursor,
        },
        context.signal
      );
    },
    findCrosswalks: (input, context) => {
      return request(
        REST_PATHS.crosswalks(input.standardCaseIdentifierUUID),
        {
          jurisdiction: input.jurisdiction,
          limit: String(LEARNING_COMMONS_REST_LIMITS.subresource),
          cursor: input.cursor,
        },
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

/**
 * A provider failure keeps only the HTTP status, never the raw response body.
 * A payload can carry a standard's text, a token echo, or unrelated tenant data;
 * the error goes to logs and recovery.
 */
const providerUnavailable = (status?: number): StandardGroundingError => {
  return new StandardGroundingError(
    status === undefined
      ? "The Learning Commons provider is unavailable. Retry the retrieval."
      : `The Learning Commons provider is unavailable (HTTP ${status}). Retry the retrieval.`,
    "provider-unavailable",
    { retryable: true, recovery: "retry" }
  );
};

const assertNotAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) {
    throw resolutionTimeout();
  }
};

const isServerFailure = (response: ProviderResponse): boolean => {
  return response.status === 0 || response.status >= 500;
};

const isClientFailure = (response: ProviderResponse): boolean => {
  return response.status >= 400 && response.status < 500;
};

/**
 A 4xx says the path or credential is wrong, not that the standard has no
 skills or prerequisites. It stays distinguishable from a genuine empty 200.
*/
const unsupportedEnvelope = (message: string): StandardGroundingGap => {
  return { code: "unsupported-envelope", message };
};

/**
 Provider shapes, verified live 2026-11-04. Every collection is `data[]` with a
 `pagination` object; extra provider keys are accepted but never retained.
*/
const paginationSchema = z
  .object({
    hasMore: z.boolean(),
    nextCursor: z.string().min(1).nullable().optional(),
  })
  .loose();

const frameworkItemSchema = z
  .object({
    caseIdentifierUUID: z.string().min(1),
    name: z.string().optional(),
    jurisdiction: z.string().optional(),
    academicSubject: z.string().optional(),
    isCurrent: z.boolean().optional(),
  })
  .loose();

const standardItemSchema = z
  .object({
    academicSubject: z.string().optional(),
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
    // Framework pages include grouping rows (Domain, Grade Level) with a null
    // statement code. They are real rows, not a malformed envelope, and never
    // match an exact code.
    statementCode: z.string().min(1).nullable(),
    status: z.string().optional(),
  })
  .loose();

const componentItemSchema = z
  .object({
    description: z.string().min(1),
    identifier: z.string().min(1),
  })
  .loose();

const prerequisiteItemSchema = z
  .object({
    caseIdentifierUUID: z.string().optional(),
    jurisdiction: z.string().optional(),
    statementCode: z.string().min(1),
  })
  .loose();

const crosswalkItemSchema = z
  .object({
    caseIdentifierUUID: z.string().min(1),
    jurisdiction: z.string().optional(),
    jaccard: z.number().min(0).max(1).optional(),
    statementCode: z.string().min(1),
  })
  .loose();

interface PageEnvelope<T> {
  readonly data: readonly T[];
  readonly pagination?: {
    readonly hasMore: boolean;
    readonly nextCursor?: string | null;
  };
}

const pageEnvelope = <T>(
  item: z.ZodType<T>,
  max: number
): z.ZodType<PageEnvelope<T>> => {
  return z
    .object({
      data: z.array(item).max(max),
      pagination: paginationSchema.optional(),
    })
    .loose();
};

const frameworksEnvelopeSchema = pageEnvelope(
  frameworkItemSchema,
  LEARNING_COMMONS_REST_LIMITS.frameworks
);
const standardsEnvelopeSchema = pageEnvelope(
  standardItemSchema,
  LEARNING_COMMONS_REST_LIMITS.standards
);
const componentsEnvelopeSchema = pageEnvelope(
  componentItemSchema,
  LEARNING_COMMONS_REST_LIMITS.subresource
);
const prerequisitesEnvelopeSchema = pageEnvelope(
  prerequisiteItemSchema,
  LEARNING_COMMONS_REST_LIMITS.subresource
);
const crosswalksEnvelopeSchema = pageEnvelope(
  crosswalkItemSchema,
  LEARNING_COMMONS_REST_LIMITS.subresource
);

type StandardItem = z.infer<typeof standardItemSchema>;
type ComponentItem = z.infer<typeof componentItemSchema>;
type PrerequisiteItem = z.infer<typeof prerequisiteItemSchema>;
type CrosswalkItem = z.infer<typeof crosswalkItemSchema>;

interface ParsedPage<T> {
  readonly items: readonly T[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
}

const parsePage = <T>(
  schema: z.ZodType<PageEnvelope<T>>,
  body: unknown
): ParsedPage<T> | null => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return null;
  }
  return {
    items: parsed.data.data,
    hasMore: parsed.data.pagination?.hasMore ?? false,
    nextCursor: parsed.data.pagination?.nextCursor ?? null,
  };
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
  const envelope = registry.envelopes.find((candidate) => {
    return candidate.jurisdiction === input.jurisdiction;
  });
  const grade = gradeFromStatementCode(input.statementCode);
  return {
    id: `${input.jurisdiction}-${input.statementCode}`,
    kind: "boundary",
    jurisdiction: input.jurisdiction,
    statementCode: input.statementCode,
    // Never borrow another envelope's subject. An unsupported jurisdiction has
    // no registered facts, so the record says so.
    subject: envelope?.subject ?? "Unknown",
    grade: Number.isNaN(grade) ? 0 : grade,
    frameworkId: "unregistered",
    prerequisiteResolution: "direct",
    provenance: LEARNING_COMMONS_PROVENANCE,
  };
};

interface ClientFailure {
  readonly kind: "client-failure";
  readonly status: number;
}

interface MalformedResponse {
  readonly kind: "malformed";
}

type CollectionFailure = ClientFailure | MalformedResponse;

interface Collected<T> {
  readonly kind: "complete" | "capped";
  readonly items: readonly T[];
}

type CollectionOutcome<T> = Collected<T> | CollectionFailure;

const collectPages = async <T>(
  schema: z.ZodType<PageEnvelope<T>>,
  maxPages: number,
  fetchPage: (cursor: string | undefined) => Promise<ProviderResponse>,
  signal: AbortSignal | undefined
): Promise<CollectionOutcome<T>> => {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    assertNotAborted(signal);
    let response: ProviderResponse;
    try {
      // eslint-disable-next-line no-await-in-loop -- pagination is sequential; the next cursor comes from this page.
      response = await fetchPage(cursor);
    } catch {
      throw providerUnavailable();
    }
    if (isServerFailure(response)) {
      throw providerUnavailable(response.status);
    }
    if (isClientFailure(response)) {
      return { kind: "client-failure", status: response.status };
    }
    const parsed = parsePage(schema, response.body);
    if (!parsed) {
      return { kind: "malformed" };
    }
    for (const item of parsed.items) {
      items.push(item);
    }
    if (!parsed.hasMore) {
      return { kind: "complete", items };
    }
    if (parsed.nextCursor === null || seenCursors.has(parsed.nextCursor)) {
      return { kind: "malformed" };
    }
    seenCursors.add(parsed.nextCursor);
    cursor = parsed.nextCursor;
  }
  return { kind: "capped", items };
};

interface ScanFound {
  readonly kind: "found";
  readonly standard: StandardItem;
}

interface ScanMissed {
  readonly kind: "not-found" | "capped" | "malformed";
}

interface ScanAmbiguous {
  readonly kind: "ambiguous";
}

interface ScanClientFailure {
  readonly kind: "client-failure";
  readonly status: number;
}

type ScanOutcome = ScanFound | ScanMissed | ScanAmbiguous | ScanClientFailure;

interface ScanBudget {
  remainingPages: number;
}

const scanFramework = async (
  transport: LearningCommonsTransport,
  frameworkCaseIdentifierUUID: string,
  statementCode: string,
  context: { readonly signal?: AbortSignal },
  budget: ScanBudget
): Promise<ScanOutcome> => {
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  for (
    let page = 0;
    page < LEARNING_COMMONS_PAGE_BOUNDS.standardPagesPerFramework &&
    budget.remainingPages > 0;
    page += 1
  ) {
    assertNotAborted(context.signal);
    let response: ProviderResponse;
    try {
      // eslint-disable-next-line no-await-in-loop -- pagination is sequential; the next cursor comes from this page.
      response = await transport.findStandardsPage(
        {
          frameworkCaseIdentifierUUID,
          ...(cursor === undefined ? {} : { cursor }),
        },
        context
      );
    } catch {
      throw providerUnavailable();
    }
    budget.remainingPages -= 1;
    if (isServerFailure(response)) {
      throw providerUnavailable(response.status);
    }
    if (isClientFailure(response)) {
      return { kind: "client-failure", status: response.status };
    }
    const parsed = parsePage(standardsEnvelopeSchema, response.body);
    if (!parsed) {
      return { kind: "malformed" };
    }
    const matches = parsed.items.filter((standard) => {
      return standard.statementCode === statementCode;
    });
    if (matches.length > 1) {
      return { kind: "ambiguous" };
    }
    const [match] = matches;
    if (match) {
      return { kind: "found", standard: match };
    }
    if (!parsed.hasMore) {
      return { kind: "not-found" };
    }
    if (parsed.nextCursor === null || seenCursors.has(parsed.nextCursor)) {
      return { kind: "malformed" };
    }
    seenCursors.add(parsed.nextCursor);
    cursor = parsed.nextCursor;
  }
  return { kind: "capped" };
};

const toComponents = (
  items: readonly ComponentItem[]
): readonly GroundedComponent[] => {
  return items.map((component) => {
    return {
      id: boundText(component.identifier, GROUNDING_TEXT_LIMITS.statementCode),
      text: boundText(component.description, GROUNDING_TEXT_LIMITS.component),
    };
  });
};

const toDirectPrerequisites = (
  items: readonly PrerequisiteItem[]
): readonly GroundedPrerequisite[] => {
  return items.map((row) => {
    return {
      statementCode: boundText(
        row.statementCode,
        GROUNDING_TEXT_LIMITS.statementCode
      ),
      jurisdiction: row.jurisdiction ?? "Multi-State",
      matchType: "direct",
      alignmentScore: 1,
    };
  });
};

const toCrosswalkPrerequisites = (
  items: readonly PrerequisiteItem[],
  jaccard: number
): readonly GroundedPrerequisite[] => {
  return items.map((row) => {
    return {
      statementCode: boundText(
        row.statementCode,
        GROUNDING_TEXT_LIMITS.statementCode
      ),
      jurisdiction: row.jurisdiction ?? "Multi-State",
      matchType: jaccard === 1 ? "crosswalk" : "crosswalk-inexact",
      alignmentScore: jaccard,
    };
  });
};

const bestCrosswalk = (
  items: readonly CrosswalkItem[]
): CrosswalkItem | null => {
  let best: CrosswalkItem | null = null;
  for (const item of items) {
    const score = item.jaccard ?? 0;
    const bestScore = best?.jaccard ?? 0;
    if (best === null || score > bestScore) {
      best = item;
    }
  }
  return best;
};

const failureGap = (
  stage: "standard scan" | "components" | "prerequisites" | "crosswalk",
  failure: CollectionFailure
): StandardGroundingGap => {
  if (failure.kind === "client-failure") {
    return unsupportedEnvelope(
      `The provider rejected the ${stage} request with HTTP ${failure.status}; no content is claimed.`
    );
  }
  return unsupportedEnvelope(
    `The provider ${stage} response did not match the verified envelope; no content is claimed.`
  );
};

/**
 Resolve the current framework, then scan it for the exact statement code. The
 first current framework that carries the code wins; a repeated code inside one
 framework is ambiguous. Every loop is page-bounded, and a cap never becomes a
 claim of absence.
*/
type FrameworkMatchOutcome =
  | { readonly kind: "match"; readonly standard: StandardItem }
  | { readonly kind: "gap"; readonly gaps: readonly StandardGroundingGap[] };

const resolveFrameworkMatch = async (
  transport: LearningCommonsTransport,
  entry: StandardRegistryEntry,
  statementCode: string,
  context: { readonly signal?: AbortSignal }
): Promise<FrameworkMatchOutcome> => {
  const frameworksOutcome = await collectPages(
    frameworksEnvelopeSchema,
    LEARNING_COMMONS_PAGE_BOUNDS.frameworkPages,
    (cursor) => {
      return transport.findFrameworks(
        {
          jurisdiction: entry.jurisdiction,
          academicSubject: entry.subject,
          ...(cursor === undefined ? {} : { cursor }),
        },
        context
      );
    },
    context.signal
  );
  if (
    frameworksOutcome.kind === "client-failure" ||
    frameworksOutcome.kind === "malformed"
  ) {
    return {
      kind: "gap",
      gaps: [failureGap("standard scan", frameworksOutcome)],
    };
  }
  const frameworks = frameworksOutcome.items.filter((framework) => {
    return framework.isCurrent !== false;
  });
  if (frameworks.length === 0) {
    return {
      kind: "gap",
      gaps: [
        {
          code: "standard-absent",
          message:
            "The provider returned no current framework for this jurisdiction and subject.",
        },
      ],
    };
  }

  const budget: ScanBudget = {
    remainingPages: LEARNING_COMMONS_PAGE_BOUNDS.standardPagesTotal,
  };
  let incomplete =
    frameworksOutcome.kind === "capped" ||
    frameworks.length > LEARNING_COMMONS_PAGE_BOUNDS.frameworks;
  for (const framework of frameworks.slice(
    0,
    LEARNING_COMMONS_PAGE_BOUNDS.frameworks
  )) {
    if (budget.remainingPages === 0) {
      incomplete = true;
      break;
    }
    // eslint-disable-next-line no-await-in-loop -- pages and frameworks are ordered; each cursor comes from the previous page.
    const outcome = await scanFramework(
      transport,
      framework.caseIdentifierUUID,
      statementCode,
      context,
      budget
    );
    if (outcome.kind === "client-failure") {
      return {
        kind: "gap",
        gaps: [
          unsupportedEnvelope(
            `The provider rejected the standard scan with HTTP ${outcome.status}; the code is not claimed absent.`
          ),
        ],
      };
    }
    if (outcome.kind === "malformed") {
      return {
        kind: "gap",
        gaps: [failureGap("standard scan", { kind: "malformed" })],
      };
    }
    if (outcome.kind === "ambiguous") {
      return {
        kind: "gap",
        gaps: [
          {
            code: "framework-ambiguous",
            message:
              "The provider returned the same statement code more than once in one framework; the adapter does not guess.",
          },
        ],
      };
    }
    if (outcome.kind === "capped") {
      incomplete = true;
      continue;
    }
    if (outcome.kind === "found") {
      return { kind: "match", standard: outcome.standard };
    }
  }

  if (incomplete) {
    return {
      kind: "gap",
      gaps: [
        unsupportedEnvelope(
          "The provider pagination exceeded the adapter's page bound before the code was found, so absence is not claimed."
        ),
      ],
    };
  }
  return {
    kind: "gap",
    gaps: [
      {
        code: "standard-absent",
        message:
          "The provider returned no standard for this code in the supported framework.",
      },
    ],
  };
};

/**
 Standard → components → prerequisites, in one bounded pipeline. A zero-row
 answer is an explicit gap at every stage; the adapter never turns an empty
 provider answer into a confident one. A state standard with no direct
 prerequisite uses its best CCSS crosswalk, and the resolution says so.
*/
export const createLearningCommonsAdapter = (
  options: LearningCommonsAdapterOptions
): LearningCommonsAdapter => {
  const registry = options.registry ?? PILOT_STANDARD_REGISTRY;
  const now = options.now ?? currentIso;

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
      const matchOutcome = await resolveFrameworkMatch(
        options.transport,
        entry,
        input.statementCode,
        context
      );
      if (matchOutcome.kind === "gap") {
        return unresolved(
          entry,
          matchOutcome.gaps,
          retrievedAt,
          registry.version
        );
      }
      const { standard } = matchOutcome;

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

      const componentsOutcome = await collectPages(
        componentsEnvelopeSchema,
        LEARNING_COMMONS_PAGE_BOUNDS.componentPages,
        (cursor) => {
          return options.transport.findComponentsPage(
            {
              standardCaseIdentifierUUID: standard.caseIdentifierUUID,
              ...(cursor === undefined ? {} : { cursor }),
            },
            context
          );
        },
        context.signal
      );
      let components: readonly GroundedComponent[] = [];
      if (
        componentsOutcome.kind === "client-failure" ||
        componentsOutcome.kind === "malformed"
      ) {
        gaps.push(failureGap("components", componentsOutcome));
      } else {
        components = toComponents(componentsOutcome.items);
        if (componentsOutcome.kind === "capped") {
          gaps.push(
            unsupportedEnvelope(
              "The provider component pagination exceeded the adapter's page bound; the component list is partial."
            )
          );
        } else if (components.length === 0) {
          gaps.push({
            code: "skills-missing",
            message:
              "The provider returned no learning components. Empty is reported, not read as none.",
          });
        }
      }

      // eslint-disable-next-line no-use-before-define -- the function is declared below and only runs after module initialization.
      const prerequisiteOutcome = await resolvePrerequisites(
        options.transport,
        entry,
        standard.caseIdentifierUUID,
        context,
        gaps
      );

      const { license, attribution } = entry.provenance;
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

interface PrerequisiteOutcome {
  readonly prerequisites: readonly GroundedPrerequisite[];
  readonly resolution: PrerequisiteResolution;
}

const unavailablePrerequisites = (): PrerequisiteOutcome => {
  return { prerequisites: [], resolution: "unavailable" };
};

const resolvePrerequisites = async (
  transport: LearningCommonsTransport,
  entry: StandardRegistryEntry,
  standardCaseIdentifierUUID: string,
  context: { readonly signal?: AbortSignal },
  gaps: StandardGroundingGap[]
): Promise<PrerequisiteOutcome> => {
  const directOutcome = await collectPages(
    prerequisitesEnvelopeSchema,
    LEARNING_COMMONS_PAGE_BOUNDS.prerequisitePages,
    (cursor) => {
      return transport.findPrerequisitesPage(
        {
          standardCaseIdentifierUUID,
          ...(cursor === undefined ? {} : { cursor }),
        },
        context
      );
    },
    context.signal
  );
  if (
    directOutcome.kind === "client-failure" ||
    directOutcome.kind === "malformed"
  ) {
    gaps.push(failureGap("prerequisites", directOutcome));
    return unavailablePrerequisites();
  }

  if (directOutcome.items.length > 0) {
    if (directOutcome.kind === "capped") {
      gaps.push(
        unsupportedEnvelope(
          "The provider prerequisite pagination exceeded the adapter's page bound; the prerequisite list is partial."
        )
      );
    }
    return {
      prerequisites: toDirectPrerequisites(directOutcome.items),
      resolution: "direct",
    };
  }

  if (entry.prerequisiteResolution !== "crosswalk") {
    gaps.push({
      code: "prerequisites-unavailable",
      message:
        "The provider returned no prerequisite rows. Empty is reported, not read as none.",
    });
    return unavailablePrerequisites();
  }

  const crosswalkOutcome = await collectPages(
    crosswalksEnvelopeSchema,
    LEARNING_COMMONS_PAGE_BOUNDS.crosswalkPages,
    (cursor) => {
      return transport.findCrosswalks(
        {
          standardCaseIdentifierUUID,
          jurisdiction: "Multi-State",
          ...(cursor === undefined ? {} : { cursor }),
        },
        context
      );
    },
    context.signal
  );
  if (
    crosswalkOutcome.kind === "client-failure" ||
    crosswalkOutcome.kind === "malformed"
  ) {
    gaps.push(failureGap("crosswalk", crosswalkOutcome), {
      code: "prerequisites-unavailable",
      message:
        "The crosswalk could not be read, so the prerequisite path is unavailable.",
    });
    return unavailablePrerequisites();
  }

  const crosswalk = bestCrosswalk(crosswalkOutcome.items);
  if (!crosswalk) {
    gaps.push(
      {
        code: "crosswalk-inexact",
        message:
          "The crosswalk returned no row, so no prerequisite is claimed.",
      },
      {
        code: "prerequisites-unavailable",
        message:
          "The crosswalk could not supply a prerequisite, so the path is unavailable.",
      }
    );
    return unavailablePrerequisites();
  }

  const crosswalkedOutcome = await collectPages(
    prerequisitesEnvelopeSchema,
    LEARNING_COMMONS_PAGE_BOUNDS.prerequisitePages,
    (cursor) => {
      return transport.findPrerequisitesPage(
        {
          standardCaseIdentifierUUID: crosswalk.caseIdentifierUUID,
          ...(cursor === undefined ? {} : { cursor }),
        },
        context
      );
    },
    context.signal
  );
  if (
    crosswalkedOutcome.kind === "client-failure" ||
    crosswalkedOutcome.kind === "malformed"
  ) {
    gaps.push(failureGap("prerequisites", crosswalkedOutcome), {
      code: "prerequisites-unavailable",
      message:
        "The crosswalked standard's prerequisites could not be read, so the path is unavailable.",
    });
    return unavailablePrerequisites();
  }

  if (crosswalkedOutcome.items.length === 0) {
    gaps.push(
      {
        code: "crosswalk-inexact",
        message:
          "The best crosswalk standard returned no prerequisite rows, so no prerequisite is claimed.",
      },
      {
        code: "prerequisites-unavailable",
        message:
          "The crosswalk could not supply a prerequisite, so the path is unavailable.",
      }
    );
    return unavailablePrerequisites();
  }

  const jaccard = crosswalk.jaccard ?? 0;
  if (jaccard < 1) {
    gaps.push({
      code: "crosswalk-inexact",
      message:
        "The best crosswalk is inexact; its rows are used as crosswalk prerequisites and marked inexact.",
    });
  }
  return {
    prerequisites: toCrosswalkPrerequisites(crosswalkedOutcome.items, jaccard),
    resolution: "crosswalk",
  };
};
