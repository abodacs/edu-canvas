/**
 * Records and checks authenticated Learning Commons MCP evidence for #142.
 *
 * Commands:
 *   record --out <dir>   Call the MCP server, write evidence.json and tool-schemas.json
 *   check [dir]          Offline: verify committed evidence invariants
 *   compare <a> <b>      Offline: prove two independent runs produced the same facts
 *   render [dir]         Offline: regenerate measurements.md from evidence.json
 *
 * The server is read-only and this client is stateless: every stage sends one
 * JSON-RPC request. The runner records what it can observe (visible calls,
 * latencies, gateway rate-limit headers, response hashes) and marks internal
 * fan-out as unobservable instead of guessing.
 *
 * Never writes credentials, objectives, or teacher/student data.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const { join } = path;

const ORIGIN = "https://kg.mcp.learningcommons.org/mcp";
const PROTOCOL_VERSION = "2025-03-26";
const CLIENT_NAME = "edu-canvas-lc-mcp-eval";
const CLIENT_VERSION = "1.0.0";
const EVIDENCE_SCHEMA_VERSION = 1;
const REQUEST_TIMEOUT_MS = 30_000;
const VISIBLE_CALL_CAP = 3;
const HASH_ALGO = "sha256";
const HASH_PREFIX_LENGTH = 16;
const SHAPE_DEPTH_LIMIT = 6;
const JSON_INDENT = 2;
const MAX_SHAPE_ENTRIES = 400;
const MAX_TEXT_EXCERPT = 240;
const SSE_DATA_PREFIX = "data: ";
const KEY_ENV = "LEARNING_COMMONS_API_KEY";
const MIN_KEY_LENGTH = 20;
const USAGE_EXIT_CODE = 2;
const RATE_LIMIT_HEADER = "x-ratelimit-remaining-minute";
const UPSTREAM_LATENCY_HEADER = "x-kong-upstream-latency";
const DEFAULT_OUTPUT_DIRECTORY = "docs/research/142-mcp-eval";
const ROW_HEADER = "Row";
const VISIBLE_CALLS_HEADER = "Visible calls";
const PROVENANCE_FIELD_PATTERN =
  /^(?:license|licence|attribution|url|uri|sourceUrl|sourceLink|modified|modifiedAt|modificationDate|isCurrent|current|framework|frameworkIdentifier|frameworkId|version|source|retrieved|retrievedAt)$/iu;
const EXCLUDED_HASH_KEYS = new Set(["session_id"]);
const STANDARD_SUBJECT = "Mathematics";

const MULTI_STATE = "Multi-State";
const CALIFORNIA = "California";

// The eight registry-supported rows from the #113 acceptance matrix.
const SUPPORTED_ROWS: readonly RowRequest[] = [
  { jurisdiction: MULTI_STATE, code: "4.NF.A.1" },
  { jurisdiction: MULTI_STATE, code: "4.NF.A.2" },
  { jurisdiction: MULTI_STATE, code: "3.NF.A.3" },
  { jurisdiction: MULTI_STATE, code: "4.OA.A.3" },
  { jurisdiction: CALIFORNIA, code: "4.NF.A.1" },
  { jurisdiction: CALIFORNIA, code: "4.NF.A.2" },
  { jurisdiction: CALIFORNIA, code: "3.NF.A.3" },
  { jurisdiction: CALIFORNIA, code: "4.OA.A.3" },
];

// Negative probes: one unsupported jurisdiction and one unsupported code.
const NEGATIVE_PROBES: readonly NegativeProbe[] = [
  {
    id: "negative-unsupported-jurisdiction",
    jurisdiction: "Atlantis",
    code: "4.NF.A.1",
  },
  { id: "negative-unsupported-code", code: "9.ZZ.Z.9" },
];

// Boundary probe: an ELA standard has no CCSS-M progression.
const ELA_BOUNDARY_PROBE = {
  id: "boundary-ela-progression",
  code: "RI.5.2",
  jurisdiction: "Multi-State",
  subject: "English Language Arts",
} as const;

interface RowRequest {
  jurisdiction: string;
  code: string;
}

interface NegativeProbe extends Partial<RowRequest> {
  id: string;
}

type Mode = "cold" | "warm" | "repeat";

interface GatewayInfo {
  httpStatus: number;
  elapsedMs: number;
  gatewayRemaining: string | null;
  gatewayUpstreamLatencyMs: string | null;
}

interface McpToolResult {
  content?: { type?: string; text?: string }[];
  isError?: boolean;
  structuredContent?: unknown;
}

interface RpcResponse extends GatewayInfo {
  result?: McpToolResult;
  error?: { message?: string };
}

interface ToolSchema {
  name: string;
  title: string | null;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
}

interface StageEvidence {
  tool: string;
  args: Record<string, string>;
  httpStatus: number;
  isError: boolean;
  elapsedMs: number;
  gatewayRemaining: string | null;
  gatewayUpstreamLatencyMs: string | null;
  responseBytes: number;
  hasStructuredContent: boolean;
  semanticHash: string;
  excerpt: string;
  shape: string[];
}

interface StandardFacts {
  standardCount: number;
  statementCodes: (string | null)[];
  jurisdictions: (string | null)[];
  subjects: (string | null)[];
  withSubStandards: number;
  keyNames: string[];
  hasFrameworkIdentifier: boolean;
  hasModifiedDate: boolean;
  hasCurrencyFlag: boolean;
  hasSourceLink: boolean;
}

interface ComponentFacts {
  componentCount: number;
  allHaveIdentifier: boolean;
  allHaveDescription: boolean;
  keyNames: string[];
  hasAttribution: boolean;
}

interface ProgressionFacts {
  prerequisiteCount: number;
  jurisdictions: string[];
  matchTypes: string[];
  statementCodes: (string | null)[];
  minAlignmentScore: number | null;
  maxAlignmentScore: number | null;
  hasJaccard: boolean;
  hasImmediateFlag: boolean;
  keyNames: string[];
  errorMessage: string | null;
}

interface RunEvidence {
  id: string;
  row: RowRequest;
  mode: Mode;
  ok: boolean;
  failure?: string;
  resolvedStandard?: {
    statementCode: string | null;
    caseIdentifierUUID: string | null;
    jurisdiction: string | null;
  };
  visibleCalls: number;
  elapsedMs: number;
  sessionHash?: string | null;
  sessionStableAcrossStages?: boolean;
  chainHash?: string;
  standardFacts?: StandardFacts;
  componentFacts?: ComponentFacts;
  progression?: ProgressionFacts;
  stages: StageEvidence[];
}

interface NegativeEvidence {
  id: string;
  probe: Record<string, string>;
  visibleCalls: number;
  isError: boolean;
  standardCount: number;
  semanticHash: string;
  excerpt: string;
}

interface ElaBoundaryEvidence {
  id: string;
  visibleCalls: number;
  standardCount: number;
  resolvedCode?: string | null;
  progressionIsError: boolean | null;
  progressionRows?: number;
  message: string | null;
  semanticHash?: string;
  excerpt?: string;
}

interface ProvenanceAudit {
  tool: string;
  outputPropertyCount: number;
  provenanceProperties: string[];
  mentionsCommonCorePivot: boolean;
  mentionsEquivalentStateStandards: boolean;
}

interface Evidence {
  schemaVersion: number;
  kind: string;
  capturedAt: string;
  revision: string;
  environment: {
    node: string;
    platform: string;
    origin: string;
    credentialEnv: string;
    credentialPresent: boolean;
  };
  protocol: {
    requested: string;
    negotiated: string | null;
    capabilities: unknown;
    capabilitiesHash: string;
    serverName: string | null;
    serverVersion: string | null;
    instructions: string | null;
    instructionsHash: string;
  };
  toolCatalog: {
    count: number;
    names: string[];
    descriptionHash: string;
    provenanceAudit: ProvenanceAudit[];
  };
  runs: RunEvidence[];
  negatives: NegativeEvidence[];
  elaBoundary: ElaBoundaryEvidence;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const readArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const readRecords = (value: unknown): Record<string, unknown>[] =>
  readArray(value).filter(isRecord);

const readNumber = (value: unknown): number | null =>
  typeof value === "number" ? value : null;

const readApiKey = (): string => {
  const key = process.env[KEY_ENV];
  if (typeof key !== "string" || key.length < MIN_KEY_LENGTH) {
    throw new Error(`Missing or short ${KEY_ENV}; set it in the environment.`);
  }
  return key;
};

const canonicalize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .filter((key) => !EXCLUDED_HASH_KEYS.has(key))
      .toSorted((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

const sha256 = (text: string): string =>
  createHash(HASH_ALGO).update(text).digest("hex");

const shortHash = (text: string): string =>
  sha256(text).slice(0, HASH_PREFIX_LENGTH);

const shapeOf = (
  value: unknown,
  at = "",
  into: string[] = [],
  depth = 0
): string[] => {
  if (into.length >= MAX_SHAPE_ENTRIES || depth > SHAPE_DEPTH_LIMIT) {
    return into;
  }
  const type = Array.isArray(value) ? "array" : typeof value;
  into.push(`${at || "$"}:${type}`);
  if (Array.isArray(value)) {
    if (value.length > 0) {
      shapeOf(value[0], `${at}[]`, into, depth + 1);
    }
    return into;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).toSorted((a, b) => a.localeCompare(b));
    for (const key of keys) {
      shapeOf(value[key], at ? `${at}.${key}` : key, into, depth + 1);
      if (into.length >= MAX_SHAPE_ENTRIES) {
        break;
      }
    }
  }
  return into;
};

const parseSseMessages = (text: string): unknown[] => {
  return text
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(SSE_DATA_PREFIX))
    .map((line) => line.slice(SSE_DATA_PREFIX.length))
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
};

const withoutSession = (
  payload: Record<string, unknown>
): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== "session_id")
  );
};

const createClient = (apiKey: string) => {
  let nextId = 1;
  return async (method: string, parameters: unknown): Promise<RpcResponse> => {
    const body = { jsonrpc: "2.0", id: nextId, method, params: parameters };
    nextId += 1;
    const startedAt = performance.now();
    const response = await fetch(ORIGIN, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });
    const text = await response.text();
    const elapsedMs = Math.round(performance.now() - startedAt);
    const message = parseSseMessages(text).at(-1);
    if (!isRecord(message)) {
      throw new Error(`No SSE message for ${method} (${response.status}).`);
    }
    const gateway: GatewayInfo = {
      httpStatus: response.status,
      elapsedMs,
      gatewayRemaining: response.headers.get(RATE_LIMIT_HEADER),
      gatewayUpstreamLatencyMs: response.headers.get(UPSTREAM_LATENCY_HEADER),
    };
    const rpcError = message.error;
    if (isRecord(rpcError)) {
      return {
        ...gateway,
        error: { message: readString(rpcError.message) ?? undefined },
      };
    }
    return { ...gateway, result: message.result as McpToolResult | undefined };
  };
};

const tryParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const parsePayload = (text: string): Record<string, unknown> => {
  const parsed = tryParseJson(text);
  if (parsed === null) {
    return { message: text };
  }
  return isRecord(parsed) ? parsed : { value: parsed };
};

const readToolPayload = (result: McpToolResult | undefined) => {
  const block = result?.content?.find((item) => item.type === "text");
  const text = block?.text ?? "";
  if (text.length === 0) {
    throw new Error("Tool result carried no text content.");
  }
  const payload = parsePayload(text);
  return {
    isError: result?.isError === true,
    payload,
    text,
    hasStructuredContent: result?.structuredContent !== undefined,
  };
};

const buildStage = ({
  tool,
  args,
  call,
}: {
  tool: string;
  args: Record<string, string>;
  call: RpcResponse;
}): StageEvidence & {
  payload: Record<string, unknown>;
  sessionAfter: string | null;
} => {
  const { isError, payload, text, hasStructuredContent } = readToolPayload(
    call.result
  );
  const stable = withoutSession(payload);
  return {
    tool,
    args,
    httpStatus: call.httpStatus,
    isError,
    elapsedMs: call.elapsedMs,
    gatewayRemaining: call.gatewayRemaining,
    gatewayUpstreamLatencyMs: call.gatewayUpstreamLatencyMs,
    responseBytes: Buffer.byteLength(text, "utf-8"),
    hasStructuredContent,
    semanticHash: sha256(canonicalize(stable)),
    excerpt: text.slice(0, MAX_TEXT_EXCERPT),
    shape: shapeOf(stable),
    payload,
    sessionAfter: readString(payload.session_id),
  };
};

const standardsFacts = (stage: {
  payload: Record<string, unknown>;
}): StandardFacts => {
  const standards = readRecords(stage.payload.standards);
  const sample = standards[0] ?? {};
  return {
    standardCount: standards.length,
    statementCodes: standards.map((item) => readString(item.statementCode)),
    jurisdictions: standards.map((item) => readString(item.jurisdiction)),
    subjects: standards.map((item) => readString(item.academicSubject)),
    withSubStandards: standards.filter(
      (item) => readArray(item.subStandards).length > 0
    ).length,
    keyNames: Object.keys(sample).toSorted((a, b) => a.localeCompare(b)),
    hasFrameworkIdentifier: standards.some(
      (item) => item.frameworkIdentifier !== undefined
    ),
    hasModifiedDate: standards.some(
      (item) => item.modificationDate !== undefined
    ),
    hasCurrencyFlag: standards.some((item) => item.isCurrent !== undefined),
    hasSourceLink: standards.some((item) => item.url !== undefined),
  };
};

const componentsFacts = (stage: {
  payload: Record<string, unknown>;
}): ComponentFacts => {
  const components = readRecords(stage.payload.learning_components);
  const sample = components[0] ?? {};
  return {
    componentCount: components.length,
    allHaveIdentifier: components.every(
      (item) => (readString(item.identifier) ?? "").length > 0
    ),
    allHaveDescription: components.every(
      (item) => (readString(item.description) ?? "").length > 0
    ),
    keyNames: Object.keys(sample).toSorted((a, b) => a.localeCompare(b)),
    hasAttribution: components.some(
      (item) => item.attribution !== undefined || item.license !== undefined
    ),
  };
};

const progressionFacts = (stage: {
  payload: Record<string, unknown>;
  isError: boolean;
}): ProgressionFacts => {
  const standards = readRecords(stage.payload.standards);
  const scores = standards
    .map((item) => readNumber(item.alignmentScore))
    .filter((score): score is number => score !== null);
  const sample = standards[0] ?? {};
  return {
    prerequisiteCount: standards.length,
    jurisdictions: [
      ...new Set(
        standards
          .map((item) => readString(item.jurisdiction))
          .filter((value): value is string => value !== null)
      ),
    ].toSorted((a, b) => a.localeCompare(b)),
    matchTypes: [
      ...new Set(
        standards
          .map((item) => readString(item.matchType))
          .filter((value): value is string => value !== null)
      ),
    ].toSorted((a, b) => a.localeCompare(b)),
    statementCodes: standards.map((item) => readString(item.statementCode)),
    minAlignmentScore: scores.length > 0 ? Math.min(...scores) : null,
    maxAlignmentScore: scores.length > 0 ? Math.max(...scores) : null,
    hasJaccard: standards.some((item) => item.jaccard !== undefined),
    hasImmediateFlag: standards.some((item) => item.immediate !== undefined),
    keyNames: Object.keys(sample).toSorted((a, b) => a.localeCompare(b)),
    errorMessage: stage.isError ? readString(stage.payload.message) : null,
  };
};

const chainHash = (stages: StageEvidence[]): string => {
  return sha256(
    canonicalize(
      stages.map((stage) => {
        return {
          tool: stage.tool,
          isError: stage.isError,
          semanticHash: stage.semanticHash,
        };
      })
    )
  );
};

const callTool = async (
  rpc: (method: string, parameters: unknown) => Promise<RpcResponse>,
  name: string,
  toolArguments: Record<string, string | undefined>
): Promise<RpcResponse> => {
  const call = await rpc("tools/call", {
    name,
    arguments: toolArguments,
  });
  if (call.error) {
    throw new Error(`${name} failed: ${call.error.message ?? "unknown error"}`);
  }
  return call;
};

interface RowOutcome {
  run: RunEvidence;
  sessionId: string | null;
}

interface RowInput {
  rpc: (method: string, parameters: unknown) => Promise<RpcResponse>;
  row: RowRequest;
  mode: Mode;
  sessionId: string | null;
}

interface AttemptState {
  session: string | null;
  stages: StageEvidence[];
  startedAt: number;
}

const stripStage = (stage: StageEvidence): StageEvidence => {
  return {
    tool: stage.tool,
    args: stage.args,
    httpStatus: stage.httpStatus,
    isError: stage.isError,
    elapsedMs: stage.elapsedMs,
    gatewayRemaining: stage.gatewayRemaining,
    gatewayUpstreamLatencyMs: stage.gatewayUpstreamLatencyMs,
    responseBytes: stage.responseBytes,
    hasStructuredContent: stage.hasStructuredContent,
    semanticHash: stage.semanticHash,
    excerpt: stage.excerpt,
    shape: stage.shape,
  };
};

const rowIdOf = (row: RowRequest): string =>
  `${row.jurisdiction.toLowerCase().replaceAll(" ", "-")}-${row.code}`;

const failureOutcome = (
  input: RowInput,
  state: AttemptState,
  error: unknown
): RowOutcome => {
  return {
    run: {
      id: rowIdOf(input.row),
      row: input.row,
      mode: input.mode,
      ok: false,
      failure: Error.isError(error) ? error.message : String(error),
      visibleCalls: state.stages.length,
      elapsedMs: Math.round(performance.now() - state.startedAt),
      stages: state.stages.map(stripStage),
    },
    sessionId: state.session,
  };
};

const attemptRow = async (
  input: RowInput,
  state: AttemptState
): Promise<RowOutcome> => {
  const { rpc, row, mode } = input;
  const standardStage = buildStage({
    tool: "find_standard_statement",
    args: { code: row.code, jurisdiction: row.jurisdiction },
    call: await callTool(rpc, "find_standard_statement", {
      code: row.code,
      jurisdiction: row.jurisdiction,
      academicSubject: STANDARD_SUBJECT,
      session_id: state.session ?? undefined,
    }),
  });
  state.stages.push(standardStage);
  state.session = standardStage.sessionAfter ?? state.session;

  const target = readRecords(standardStage.payload.standards).find((item) => {
    return (
      readString(item.statementCode) === row.code &&
      readString(item.jurisdiction) === row.jurisdiction
    );
  });
  const caseIdentifierUUID = readString(target?.caseIdentifierUUID);
  if (!target || !caseIdentifierUUID) {
    throw new Error(`No exact ${row.code} in ${row.jurisdiction}.`);
  }

  const componentStage = buildStage({
    tool: "find_learning_components_from_standard",
    args: { caseIdentifierUUID },
    call: await callTool(rpc, "find_learning_components_from_standard", {
      caseIdentifierUUID,
      session_id: state.session ?? undefined,
    }),
  });
  state.stages.push(componentStage);
  state.session = componentStage.sessionAfter ?? state.session;

  const progressionStage = buildStage({
    tool: "find_standards_progression_from_standard",
    args: { caseIdentifierUUID, direction: "backward" },
    call: await callTool(rpc, "find_standards_progression_from_standard", {
      caseIdentifierUUID,
      direction: "backward",
      session_id: state.session ?? undefined,
    }),
  });
  state.stages.push(progressionStage);
  state.session = progressionStage.sessionAfter ?? state.session;

  const stripped = state.stages.map(stripStage);
  return {
    run: {
      id: rowIdOf(row),
      row,
      mode,
      ok: true,
      resolvedStandard: {
        statementCode: readString(target.statementCode),
        caseIdentifierUUID,
        jurisdiction: readString(target.jurisdiction),
      },
      visibleCalls: state.stages.length,
      elapsedMs: Math.round(performance.now() - state.startedAt),
      sessionHash: state.session ? shortHash(state.session) : null,
      sessionStableAcrossStages: state.stages.length === VISIBLE_CALL_CAP,
      chainHash: chainHash(stripped),
      standardFacts: standardsFacts(standardStage),
      componentFacts: componentsFacts(componentStage),
      progression: progressionFacts(progressionStage),
      stages: stripped,
    },
    sessionId: state.session,
  };
};

const runRow = async (input: RowInput): Promise<RowOutcome> => {
  const state: AttemptState = {
    session: input.sessionId,
    stages: [],
    startedAt: performance.now(),
  };
  try {
    return await attemptRow(input, state);
  } catch (error) {
    return failureOutcome(input, state, error);
  }
};

const runNegative = async (
  rpc: (method: string, parameters: unknown) => Promise<RpcResponse>,
  probe: NegativeProbe
): Promise<NegativeEvidence> => {
  const stage = buildStage({
    tool: "find_standard_statement",
    args: Object.fromEntries(
      Object.entries(probe).filter(([key, value]) => key !== "id" && value)
    ),
    call: await callTool(rpc, "find_standard_statement", {
      code: probe.code,
      jurisdiction: probe.jurisdiction,
      academicSubject: STANDARD_SUBJECT,
    }),
  });
  return {
    id: probe.id,
    probe: stage.args,
    visibleCalls: 1,
    isError: stage.isError,
    standardCount: readRecords(stage.payload.standards).length,
    semanticHash: stage.semanticHash,
    excerpt: stage.excerpt,
  };
};

const runElaBoundary = async (
  rpc: (method: string, parameters: unknown) => Promise<RpcResponse>
): Promise<ElaBoundaryEvidence> => {
  const standardStage = buildStage({
    tool: "find_standard_statement",
    args: {
      code: ELA_BOUNDARY_PROBE.code,
      jurisdiction: ELA_BOUNDARY_PROBE.jurisdiction,
    },
    call: await callTool(rpc, "find_standard_statement", {
      code: ELA_BOUNDARY_PROBE.code,
      jurisdiction: ELA_BOUNDARY_PROBE.jurisdiction,
      academicSubject: ELA_BOUNDARY_PROBE.subject,
    }),
  });
  const standards = readRecords(standardStage.payload.standards);
  const [target] = standards;
  const caseIdentifierUUID = readString(target?.caseIdentifierUUID);
  if (!caseIdentifierUUID) {
    return {
      id: ELA_BOUNDARY_PROBE.id,
      visibleCalls: 1,
      standardCount: 0,
      progressionIsError: null,
      message: "No ELA standard resolved.",
    };
  }
  const progressionStage = buildStage({
    tool: "find_standards_progression_from_standard",
    args: { caseIdentifierUUID, direction: "backward" },
    call: await callTool(rpc, "find_standards_progression_from_standard", {
      caseIdentifierUUID,
      direction: "backward",
      session_id: standardStage.sessionAfter ?? undefined,
    }),
  });
  return {
    id: ELA_BOUNDARY_PROBE.id,
    visibleCalls: 2,
    standardCount: standards.length,
    resolvedCode: readString(target?.statementCode),
    progressionIsError: progressionStage.isError,
    progressionRows: readRecords(progressionStage.payload.standards).length,
    message: readString(progressionStage.payload.message),
    semanticHash: progressionStage.semanticHash,
    excerpt: progressionStage.excerpt,
  };
};

const collectOutputPropertyNames = (
  schema: unknown,
  into: Set<string>
): Set<string> => {
  if (!isRecord(schema)) {
    return into;
  }
  const properties = isRecord(schema.properties) ? schema.properties : {};
  for (const [key, value] of Object.entries(properties)) {
    into.add(key);
    collectOutputPropertyNames(value, into);
  }
  if (schema.items) {
    collectOutputPropertyNames(schema.items, into);
  }
  return into;
};

const auditProvenance = (tools: ToolSchema[]): ProvenanceAudit[] => {
  return tools.map((tool) => {
    const propertyNames = collectOutputPropertyNames(
      tool.outputSchema,
      new Set<string>()
    );
    return {
      tool: tool.name,
      outputPropertyCount: propertyNames.size,
      provenanceProperties: [...propertyNames]
        .filter((name) => PROVENANCE_FIELD_PATTERN.test(name))
        .toSorted((a, b) => a.localeCompare(b)),
      mentionsCommonCorePivot: /Common Core/u.test(tool.description),
      mentionsEquivalentStateStandards: /equivalent state standards/u.test(
        tool.description
      ),
    };
  });
};

const readToolSchema = (value: unknown): ToolSchema | null => {
  if (!isRecord(value)) {
    return null;
  }
  const name = readString(value.name);
  if (!name) {
    return null;
  }
  const annotations = isRecord(value.annotations) ? value.annotations : {};
  return {
    name,
    title: readString(annotations.title),
    description: readString(value.description) ?? "",
    inputSchema: value.inputSchema,
    outputSchema: value.outputSchema,
  };
};

const record = async (outputDirectory: string): Promise<Evidence> => {
  const rpc = createClient(readApiKey());
  const init = await rpc("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
  });
  if (init.error) {
    throw new Error(`initialize failed: ${init.error.message ?? "unknown"}`);
  }
  const initResult = isRecord(init.result) ? init.result : {};
  const serverInfo = isRecord(initResult.serverInfo)
    ? initResult.serverInfo
    : {};
  const catalog = await rpc("tools/list", {});
  if (catalog.error) {
    throw new Error(`tools/list failed: ${catalog.error.message ?? "unknown"}`);
  }
  const catalogResult = isRecord(catalog.result) ? catalog.result : {};
  const tools = readArray(catalogResult.tools)
    .map((tool) => readToolSchema(tool))
    .filter((tool): tool is ToolSchema => tool !== null);
  const instructions = readString(initResult.instructions);

  const runs: RunEvidence[] = [];
  for (const row of SUPPORTED_ROWS) {
    // Sequential rows keep latency and rate-limit measurements honest.
    // eslint-disable-next-line no-await-in-loop
    const cold = await runRow({ rpc, row, mode: "cold", sessionId: null });
    // eslint-disable-next-line no-await-in-loop
    const warm = await runRow({
      rpc,
      row,
      mode: "warm",
      sessionId: cold.sessionId,
    });
    // eslint-disable-next-line no-await-in-loop
    const repeat = await runRow({ rpc, row, mode: "repeat", sessionId: null });
    runs.push(cold.run, warm.run, repeat.run);
  }

  const negatives: NegativeEvidence[] = [];
  for (const probe of NEGATIVE_PROBES) {
    // eslint-disable-next-line no-await-in-loop
    negatives.push(await runNegative(rpc, probe));
  }
  const elaBoundary = await runElaBoundary(rpc);
  const now = new Date();
  const capturedAt = now.toISOString();

  const evidence: Evidence = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    kind: "lc-mcp-eval",
    capturedAt,
    revision: process.env.GIT_REVISION ?? "unknown",
    environment: {
      node: process.version,
      platform: process.platform,
      origin: ORIGIN,
      credentialEnv: KEY_ENV,
      credentialPresent: true,
    },
    protocol: {
      requested: PROTOCOL_VERSION,
      negotiated: readString(initResult.protocolVersion),
      capabilities: initResult.capabilities,
      capabilitiesHash: sha256(canonicalize(initResult.capabilities)),
      serverName: readString(serverInfo.name),
      serverVersion: readString(serverInfo.version),
      instructions,
      instructionsHash: sha256(instructions ?? ""),
    },
    toolCatalog: {
      count: tools.length,
      names: tools.map((tool) => tool.name),
      descriptionHash: sha256(
        canonicalize(
          tools.map((tool) => {
            return {
              name: tool.name,
              description: tool.description,
            };
          })
        )
      ),
      provenanceAudit: auditProvenance(tools),
    },
    runs,
    negatives,
    elaBoundary,
  };

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    join(outputDirectory, "evidence.json"),
    `${JSON.stringify(evidence, null, JSON_INDENT)}\n`
  );
  await writeFile(
    join(outputDirectory, "tool-schemas.json"),
    `${JSON.stringify(
      {
        schemaVersion: EVIDENCE_SCHEMA_VERSION,
        capturedAt: evidence.capturedAt,
        serverName: evidence.protocol.serverName,
        serverVersion: evidence.protocol.serverVersion,
        protocol: evidence.protocol.negotiated,
        tools: tools.map((tool) => {
          return {
            ...tool,
            inputSchemaHash: sha256(canonicalize(tool.inputSchema)),
            outputSchemaHash: sha256(canonicalize(tool.outputSchema)),
          };
        }),
      },
      null,
      JSON_INDENT
    )}\n`
  );
  return evidence;
};

const checkRowGroup = (
  key: string,
  runs: RunEvidence[],
  failures: string[]
): void => {
  const hashes = new Set(runs.map((run) => run.chainHash));
  if (hashes.size !== 1) {
    failures.push(
      `${key}: chain hash differs across modes: ${[...hashes].join(", ")}`
    );
  }
  const cold = runs.find((run) => run.mode === "cold");
  if (!cold) {
    failures.push(`${key}: missing cold run`);
    return;
  }
  const exactMatches =
    cold.standardFacts?.statementCodes.filter((code) => code === cold.row.code)
      .length ?? 0;
  if (exactMatches !== 1) {
    failures.push(
      `${key}: expected exactly one standard whose code equals the request, saw ${exactMatches}`
    );
  }
  if (!cold.standardFacts?.jurisdictions.includes(cold.row.jurisdiction)) {
    failures.push(
      `${key}: resolved standards must carry the requested jurisdiction`
    );
  }
  if ((cold.componentFacts?.componentCount ?? 0) === 0) {
    failures.push(`${key}: expected learning components`);
  }
  if ((cold.progression?.prerequisiteCount ?? 0) === 0) {
    failures.push(`${key}: expected backward progression rows`);
  }
  if (
    cold.row.jurisdiction === CALIFORNIA &&
    !cold.progression?.jurisdictions.includes(CALIFORNIA)
  ) {
    failures.push(`${key}: progression must return California rows`);
  }
  if (cold.progression?.hasJaccard !== false) {
    failures.push(`${key}: unexpected jaccard field`);
  }
};

const checkRuns = (evidence: Evidence, failures: string[]): void => {
  const byRow = new Map<string, RunEvidence[]>();
  for (const run of evidence.runs) {
    const key = `${run.row.jurisdiction}/${run.row.code}`;
    byRow.set(key, [...(byRow.get(key) ?? []), run]);
    if (!run.ok) {
      failures.push(`${key}: ${run.mode} failed: ${run.failure ?? "unknown"}`);
    }
    if (run.visibleCalls !== VISIBLE_CALL_CAP) {
      failures.push(
        `${key}: ${run.mode} expected ${VISIBLE_CALL_CAP} visible calls`
      );
    }
  }
  for (const [key, runs] of byRow) {
    checkRowGroup(key, runs, failures);
  }
};

const checkProbes = (evidence: Evidence, failures: string[]): void => {
  for (const negative of evidence.negatives) {
    if (negative.standardCount !== 0) {
      failures.push(`${negative.id}: expected zero matching standards`);
    }
  }
  if (evidence.elaBoundary.progressionIsError !== true) {
    failures.push("boundary-ela-progression: expected an error result");
  }
  if ((evidence.elaBoundary.progressionRows ?? 0) !== 0) {
    failures.push("boundary-ela-progression: expected zero progression rows");
  }
  for (const audit of evidence.toolCatalog.provenanceAudit) {
    if (audit.provenanceProperties.length > 0) {
      failures.push(
        `${audit.tool}: unexpected provenance fields ${audit.provenanceProperties.join(", ")}`
      );
    }
  }
};

const checkEvidence = (evidence: Evidence): string[] => {
  const failures: string[] = [];
  if (evidence.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    failures.push(`schemaVersion must be ${EVIDENCE_SCHEMA_VERSION}`);
  }
  if (evidence.toolCatalog.count !== evidence.toolCatalog.names.length) {
    failures.push("tool count must match names");
  }
  if (evidence.runs.length === 0) {
    failures.push("evidence must contain runs");
  }
  checkRuns(evidence, failures);
  checkProbes(evidence, failures);
  const serialized = JSON.stringify(evidence).toLowerCase();
  if (serialized.includes("authorization") || serialized.includes("bearer ")) {
    failures.push("evidence must not carry credentials");
  }
  return failures;
};

const compareEvidence = (left: Evidence, right: Evidence): string[] => {
  const failures: string[] = [];
  const index = (evidence: Evidence): Map<string, string | undefined> => {
    const map = new Map<string, string | undefined>();
    for (const run of evidence.runs) {
      map.set(
        `${run.row.jurisdiction}/${run.row.code}/${run.mode}`,
        run.chainHash
      );
    }
    return map;
  };
  const leftIndex = index(left);
  const rightIndex = index(right);
  for (const [key, hash] of leftIndex) {
    if (!rightIndex.has(key)) {
      failures.push(`${key}: missing from second run`);
    } else if (rightIndex.get(key) !== hash) {
      failures.push(`${key}: hash differs (${hash} vs ${rightIndex.get(key)})`);
    }
  }
  for (const key of rightIndex.keys()) {
    if (!leftIndex.has(key)) {
      failures.push(`${key}: missing from first run`);
    }
  }
  return failures;
};

const tableRow = (cells: string[]): string => `| ${cells.join(" | ")} |`;

const runLabel = (run: RunEvidence): string =>
  `${run.row.jurisdiction} \`${run.row.code}\``;

const renderMarkdown = (evidence: Evidence): string => {
  const rowKeys = [
    ...new Set(
      evidence.runs.map((run) => `${run.row.jurisdiction}/${run.row.code}`)
    ),
  ];
  const lines = [
    "# MCP measurements",
    "",
    "Generated by `scripts/lc-mcp-eval.ts render` from [evidence.json](evidence.json). Do not edit by hand.",
    "",
    `Captured ${evidence.capturedAt} at revision \`${evidence.revision}\`.`,
    "",
    "## Server and protocol",
    "",
    tableRow(["Field", "Value"]),
    tableRow(["---", "---"]),
    tableRow(["Origin", `\`${evidence.environment.origin}\``]),
    tableRow(["Protocol requested", `\`${evidence.protocol.requested}\``]),
    tableRow(["Protocol negotiated", `\`${evidence.protocol.negotiated}\``]),
    tableRow([
      "Server",
      `\`${evidence.protocol.serverName} ${evidence.protocol.serverVersion}\``,
    ]),
    tableRow(["Tools advertised", String(evidence.toolCatalog.count)]),
    tableRow([
      "Tool names",
      evidence.toolCatalog.names.map((name) => `\`${name}\``).join(", "),
    ]),
    tableRow([
      "Capabilities hash",
      `\`${evidence.protocol.capabilitiesHash.slice(0, HASH_PREFIX_LENGTH)}\``,
    ]),
    tableRow([
      "Instructions hash",
      `\`${evidence.protocol.instructionsHash.slice(0, HASH_PREFIX_LENGTH)}\``,
    ]),
    "",
    "## Visible calls per supported row",
    "",
    tableRow([
      ROW_HEADER,
      "Mode",
      VISIBLE_CALLS_HEADER,
      "Elapsed ms",
      "Chain hash",
      "Components",
      "Prerequisites",
      "Prerequisite jurisdictions",
    ]),
    tableRow(["---", "---", "---", "---", "---", "---", "---", "---"]),
    ...evidence.runs.map((run) => {
      return tableRow([
        runLabel(run),
        run.mode,
        String(run.visibleCalls),
        String(run.elapsedMs),
        `\`${(run.chainHash ?? "").slice(0, HASH_PREFIX_LENGTH)}\``,
        String(run.componentFacts?.componentCount ?? "n/a"),
        String(run.progression?.prerequisiteCount ?? "n/a"),
        (run.progression?.jurisdictions ?? []).join(", ") || "n/a",
      ]);
    }),
    "",
    "## Cold, warm and repeat timing",
    "",
    tableRow([
      ROW_HEADER,
      "Cold ms",
      "Warm ms",
      "Repeat ms",
      "Same chain hash",
    ]),
    tableRow(["---", "---", "---", "---", "---"]),
    ...rowKeys.map((key) => {
      const rowRuns = evidence.runs.filter(
        (run) => `${run.row.jurisdiction}/${run.row.code}` === key
      );
      const timing = (mode: Mode) =>
        String(rowRuns.find((run) => run.mode === mode)?.elapsedMs ?? "n/a");
      const hashes = new Set(rowRuns.map((run) => run.chainHash));
      return tableRow([
        key,
        timing("cold"),
        timing("warm"),
        timing("repeat"),
        hashes.size === 1 ? "yes" : "no",
      ]);
    }),
    "",
    "## Stage timings and gateway headers",
    "",
    tableRow([
      ROW_HEADER,
      "Tool",
      "HTTP",
      "Elapsed ms",
      "Bytes",
      "Upstream latency ms",
      "Rate limit remaining",
    ]),
    tableRow(["---", "---", "---", "---", "---", "---", "---"]),
    ...evidence.runs
      .filter((run) => run.mode === "cold")
      .flatMap((run) => {
        return run.stages.map((stage) => {
          return tableRow([
            runLabel(run),
            `\`${stage.tool}\``,
            String(stage.httpStatus),
            String(stage.elapsedMs),
            String(stage.responseBytes),
            stage.gatewayUpstreamLatencyMs ?? "unknown",
            stage.gatewayRemaining ?? "unknown",
          ]);
        });
      }),
    "",
    "## Prerequisite codes",
    "",
    tableRow([
      ROW_HEADER,
      "Backward codes",
      "Match types",
      "Min alignment score",
    ]),
    tableRow(["---", "---", "---", "---"]),
    ...evidence.runs
      .filter((run) => run.mode === "cold")
      .map((run) => {
        return tableRow([
          runLabel(run),
          run.progression?.statementCodes
            .filter((code): code is string => code !== null)
            .join(", ") || "none",
          (run.progression?.matchTypes ?? []).join(", ") || "none",
          String(run.progression?.minAlignmentScore ?? "n/a"),
        ]);
      }),
    "",
    "## Provenance audit",
    "",
    tableRow([
      "Tool",
      "Output properties",
      "Provenance fields",
      "Common Core pivot",
      "Equivalent state standards",
    ]),
    tableRow(["---", "---", "---", "---", "---"]),
    ...evidence.toolCatalog.provenanceAudit.map((audit) => {
      return tableRow([
        `\`${audit.tool}\``,
        String(audit.outputPropertyCount),
        audit.provenanceProperties.length === 0
          ? "none"
          : audit.provenanceProperties.join(", "),
        audit.mentionsCommonCorePivot ? "yes" : "no",
        audit.mentionsEquivalentStateStandards ? "yes" : "no",
      ]);
    }),
    "",
    "## Negative probes",
    "",
    tableRow(["Probe", VISIBLE_CALLS_HEADER, "Matching standards", "Error"]),
    tableRow(["---", "---", "---", "---"]),
    ...evidence.negatives.map((negative) => {
      return tableRow([
        `\`${negative.id}\``,
        String(negative.visibleCalls),
        String(negative.standardCount),
        String(negative.isError),
      ]);
    }),
    "",
    "## Boundary probe",
    "",
    tableRow([
      "Probe",
      VISIBLE_CALLS_HEADER,
      "Progression error",
      "Rows",
      "Message",
    ]),
    tableRow(["---", "---", "---", "---", "---"]),
    tableRow([
      `\`${evidence.elaBoundary.id}\``,
      String(evidence.elaBoundary.visibleCalls),
      String(evidence.elaBoundary.progressionIsError),
      String(evidence.elaBoundary.progressionRows ?? "n/a"),
      (
        evidence.elaBoundary.message ??
        evidence.elaBoundary.excerpt ??
        "n/a"
      ).slice(0, MAX_TEXT_EXCERPT),
    ]),
    "",
  ];
  return `${lines.join("\n")}\n`;
};

interface Arguments {
  command: string | undefined;
  output: string | null;
  positional: string[];
}

const parseArguments = (argv: string[]): Arguments => {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  let output: string | null = null;
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (item === "--out") {
      output = rest[index + 1] ?? null;
      index += 1;
    } else if (item.startsWith("--out=")) {
      output = item.slice("--out=".length);
    } else if (item) {
      positional.push(item);
    }
  }
  return { command, output, positional };
};

const readEvidence = async (directory: string): Promise<Evidence> => {
  const raw = await readFile(join(directory, "evidence.json"), "utf-8");
  return JSON.parse(raw) as Evidence;
};

const reportFailures = (heading: string, failures: string[]): number => {
  if (failures.length === 0) {
    return 0;
  }
  console.error(heading);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  return 1;
};

const main = async (): Promise<number> => {
  const { command, output, positional } = parseArguments(process.argv.slice(2));

  if (command === "record") {
    const outputDirectory = output ?? DEFAULT_OUTPUT_DIRECTORY;
    const evidence = await record(outputDirectory);
    const status = reportFailures(
      "Recorded evidence failed its own invariants:",
      checkEvidence(evidence)
    );
    if (status === 0) {
      console.log(
        `Recorded ${evidence.runs.length} runs to ${outputDirectory}.`
      );
    }
    return status;
  }
  const directory = positional[0] ?? DEFAULT_OUTPUT_DIRECTORY;
  if (command === "check") {
    const status = reportFailures(
      "FAIL lc-mcp-eval evidence",
      checkEvidence(await readEvidence(directory))
    );
    if (status === 0) {
      console.log("OK lc-mcp-eval evidence.");
    }
    return status;
  }
  if (command === "compare") {
    const [leftPath, rightPath] = positional;
    if (!leftPath || !rightPath) {
      console.error("compare needs two evidence.json paths.");
      return USAGE_EXIT_CODE;
    }
    const left = JSON.parse(await readFile(leftPath, "utf-8")) as Evidence;
    const right = JSON.parse(await readFile(rightPath, "utf-8")) as Evidence;
    const status = reportFailures(
      "FAIL determinism comparison",
      compareEvidence(left, right)
    );
    if (status === 0) {
      console.log(`OK determinism: ${left.runs.length} run hashes identical.`);
    }
    return status;
  }
  if (command === "render") {
    const evidence = await readEvidence(directory);
    await writeFile(
      join(directory, "measurements.md"),
      renderMarkdown(evidence)
    );
    console.log(`Rendered ${join(directory, "measurements.md")}.`);
    return 0;
  }
  console.error(
    "Usage: lc-mcp-eval.ts record --out <dir> | check [dir] | compare <a> <b> | render [dir]"
  );
  return USAGE_EXIT_CODE;
};

process.exitCode = await main();
