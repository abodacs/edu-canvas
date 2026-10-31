/**
 * Records and checks authenticated Learning Commons evidence for #142.
 *
 * Commands:
 *   record --out <dir>   Call the MCP server, write evidence.json and tool-schemas.json
 *   check [dir]          Offline: verify committed evidence invariants
 *   compare <a> <b>      Offline: prove two independent runs produced the same facts
 *   render [dir]         Offline: regenerate measurements.md from evidence.json
 *   free-text record     Resolve teacher sentences on MCP keywords and REST search
 *   free-text check      Offline: verify free-text evidence invariants
 *   free-text render     Offline: regenerate free-text.md
 *
 * The server is read-only and this client is stateless: every stage sends one
 * JSON-RPC request. The runner records what it can observe (visible calls,
 * latencies, gateway rate-limit headers, response hashes) and marks internal
 * fan-out as unobservable instead of guessing.
 *
 * Never writes credentials, objectives, or teacher/student data.
 */

import { execFileSync } from "node:child_process";
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
const EVIDENCE_FILE = "evidence.json";
const SCHEMAS_FILE = "tool-schemas.json";
const MEASUREMENTS_FILE = "measurements.md";
// Absolute path keeps the spawn independent of PATH.
const GIT_BINARY = "/usr/bin/git";
const ROW_HEADER = "Row";
const VISIBLE_CALLS_HEADER = "Visible calls";
const PROVENANCE_FIELD_PATTERN =
  /^(?:license|licence|attribution|url|uri|sourceUrl|sourceLink|modified|modifiedAt|modificationDate|isCurrent|current|framework|frameworkIdentifier|frameworkId|version|source|retrieved|retrievedAt)$/iu;
const EXCLUDED_HASH_KEYS = new Set(["session_id"]);
const STANDARD_SUBJECT = "Mathematics";

const MODES = ["cold", "warm", "repeat"] as const;

type Mode = (typeof MODES)[number];

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
  { id: "negative-valid-absent-code", code: "4.NF.A.99" },
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
    clientName: string;
    clientVersion: string;
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
    initializedNotificationStatus: number;
    clientName: string;
    clientVersion: string;
  };
  toolCatalog: {
    count: number;
    names: string[];
    descriptionHash: string;
    schemas: {
      name: string;
      inputSchemaHash: string;
      outputSchemaHash: string;
    }[];
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

const INITIALIZED_NOTIFICATION = "notifications/initialized";

const sendNotification = async (
  apiKey: string,
  parameters: unknown
): Promise<number> => {
  const response = await fetch(ORIGIN, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: INITIALIZED_NOTIFICATION,
      params: parameters,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: "error",
  });
  await response.text();
  return response.status;
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
    excerpt: JSON.stringify(stable).slice(0, MAX_TEXT_EXCERPT),
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

interface StageWithSession extends StageEvidence {
  payload: Record<string, unknown>;
  sessionAfter: string | null;
}

interface AttemptState {
  session: string | null;
  stages: StageWithSession[];
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

  const sessionIds = state.stages
    .map((stage) => stage.sessionAfter)
    .filter((value): value is string => value !== null);
  const sessionStable =
    sessionIds.length > 0 && sessionIds.every((id) => id === sessionIds[0]);
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
      sessionStableAcrossStages: sessionStable,
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

const readRevision = (): string => {
  if (process.env.GIT_REVISION) {
    return process.env.GIT_REVISION;
  }
  try {
    return execFileSync(GIT_BINARY, ["rev-parse", "HEAD"], {
      encoding: "utf-8",
    }).trim();
  } catch {
    return "unknown";
  }
};

const record = async (outputDirectory: string): Promise<Evidence> => {
  const apiKey = readApiKey();
  const rpc = createClient(apiKey);
  const init = await rpc("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
  });
  if (init.error) {
    throw new Error(`initialize failed: ${init.error.message ?? "unknown"}`);
  }
  const initializedNotificationStatus = await sendNotification(apiKey, {});
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
    revision: readRevision(),
    environment: {
      node: process.version,
      platform: process.platform,
      origin: ORIGIN,
      credentialEnv: KEY_ENV,
      credentialPresent: true,
      clientName: CLIENT_NAME,
      clientVersion: CLIENT_VERSION,
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
      initializedNotificationStatus,
      clientName: CLIENT_NAME,
      clientVersion: CLIENT_VERSION,
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
      schemas: tools.map((tool) => {
        return {
          name: tool.name,
          inputSchemaHash: sha256(canonicalize(tool.inputSchema)),
          outputSchemaHash: sha256(canonicalize(tool.outputSchema)),
        };
      }),
      provenanceAudit: auditProvenance(tools),
    },
    runs,
    negatives,
    elaBoundary,
  };

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    join(outputDirectory, EVIDENCE_FILE),
    `${JSON.stringify(evidence, null, JSON_INDENT)}\n`
  );
  await writeFile(
    join(outputDirectory, SCHEMAS_FILE),
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

const expectedRowKeys = (): string[] => {
  return SUPPORTED_ROWS.map(
    (row) => `${row.jurisdiction}/${row.code}`
  ).toSorted((a, b) => a.localeCompare(b));
};

const checkMatrix = (evidence: Evidence, failures: string[]): void => {
  const expected = SUPPORTED_ROWS.length * MODES.length;
  if (evidence.runs.length !== expected) {
    failures.push(
      `expected ${expected} runs (${SUPPORTED_ROWS.length} rows x ${MODES.length} modes), saw ${evidence.runs.length}`
    );
  }
  const keys = [...new Set(expectedRowKeys())].toSorted((a, b) =>
    a.localeCompare(b)
  );
  const seen = [
    ...new Set(
      evidence.runs.map((run) => `${run.row.jurisdiction}/${run.row.code}`)
    ),
  ].toSorted((a, b) => a.localeCompare(b));
  if (JSON.stringify(seen) !== JSON.stringify(keys)) {
    failures.push(
      `row set drifted: expected ${keys.join(", ")}, saw ${seen.join(", ")}`
    );
  }
  for (const key of keys) {
    const modes = evidence.runs
      .filter((run) => `${run.row.jurisdiction}/${run.row.code}` === key)
      .map((run) => run.mode)
      .toSorted((a, b) => a.localeCompare(b));
    const wanted = [...MODES].toSorted((a, b) => a.localeCompare(b));
    if (JSON.stringify(modes) !== JSON.stringify(wanted)) {
      failures.push(
        `${key}: expected modes ${wanted.join(", ")}, saw ${modes.join(", ")}`
      );
    }
  }
};

const checkRuns = (evidence: Evidence, failures: string[]): void => {
  checkMatrix(evidence, failures);
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

const contractFingerprint = (evidence: Evidence): string => {
  return JSON.stringify({
    schemaVersion: evidence.schemaVersion,
    origin: evidence.environment.origin,
    protocol: evidence.protocol.negotiated,
    serverName: evidence.protocol.serverName,
    serverVersion: evidence.protocol.serverVersion,
    tools: evidence.toolCatalog.names,
    schemas: evidence.toolCatalog.schemas,
  });
};

const compareEvidence = (left: Evidence, right: Evidence): string[] => {
  const failures: string[] = [];
  if (contractFingerprint(left) !== contractFingerprint(right)) {
    failures.push("contract fingerprint differs between runs");
  }
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

const hasEvidenceMetadata = (value: Record<string, unknown>): boolean => {
  return (
    typeof value.schemaVersion === "number" &&
    isRecord(value.environment) &&
    isRecord(value.protocol)
  );
};

const hasEvidenceArtifacts = (value: Record<string, unknown>): boolean => {
  return (
    isRecord(value.toolCatalog) &&
    isRecord(value.elaBoundary) &&
    Array.isArray(value.runs) &&
    Array.isArray(value.negatives)
  );
};

const parseEvidence = (value: unknown): Evidence | null => {
  return isRecord(value) &&
    hasEvidenceMetadata(value) &&
    hasEvidenceArtifacts(value)
    ? (value as unknown as Evidence)
    : null;
};

const readEvidenceFile = async (filePath: string): Promise<Evidence> => {
  const parsed = parseEvidence(tryParseJson(await readFile(filePath, "utf-8")));
  if (!parsed) {
    throw new Error(`${filePath}: malformed evidence`);
  }
  return parsed;
};

const readEvidence = (directory: string): Promise<Evidence> =>
  readEvidenceFile(join(directory, EVIDENCE_FILE));

// 4 and 6. Verify the schema artifact and the rendered report, not just evidence.json.
const checkToolSchemas = async (
  directory: string,
  evidence: Evidence,
  failures: string[]
): Promise<void> => {
  const parsed = tryParseJson(
    await readFile(join(directory, SCHEMAS_FILE), "utf-8")
  );
  if (!isRecord(parsed) || !Array.isArray(parsed.tools)) {
    failures.push("tool-schemas.json is missing or malformed");
    return;
  }
  const tools = readRecords(parsed.tools);
  if (tools.length !== evidence.toolCatalog.count) {
    failures.push(
      `tool-schemas.json has ${tools.length} tools, evidence has ${evidence.toolCatalog.count}`
    );
  }
  if (readString(parsed.protocol) !== evidence.protocol.negotiated) {
    failures.push("tool-schemas.json protocol drifted from evidence");
  }
  if (readString(parsed.serverVersion) !== evidence.protocol.serverVersion) {
    failures.push("tool-schemas.json server version drifted from evidence");
  }
  const names = tools
    .map((tool) => readString(tool.name))
    .filter((name): name is string => name !== null);
  if (JSON.stringify(names) !== JSON.stringify(evidence.toolCatalog.names)) {
    failures.push("tool-schemas.json tool names drifted from evidence");
  }
  for (const tool of tools) {
    const name = readString(tool.name) ?? "unknown";
    const inputSchemaHash = sha256(canonicalize(tool.inputSchema));
    const outputSchemaHash = sha256(canonicalize(tool.outputSchema));
    if (inputSchemaHash !== readString(tool.inputSchemaHash)) {
      failures.push(`${name}: input schema hash does not match its schema`);
    }
    if (outputSchemaHash !== readString(tool.outputSchemaHash)) {
      failures.push(`${name}: output schema hash does not match its schema`);
    }
    const recorded = evidence.toolCatalog.schemas.find(
      (schema) => schema.name === name
    );
    if (!recorded) {
      failures.push(`${name}: missing from the evidence schema catalog`);
    } else if (
      recorded.inputSchemaHash !== inputSchemaHash ||
      recorded.outputSchemaHash !== outputSchemaHash
    ) {
      failures.push(
        `${name}: evidence schema hash disagrees with tool-schemas.json`
      );
    }
  }
};

const checkRendered = async (
  directory: string,
  evidence: Evidence,
  failures: string[]
): Promise<void> => {
  const committed = await readFile(join(directory, MEASUREMENTS_FILE), "utf-8");
  if (committed !== renderMarkdown(evidence)) {
    failures.push("measurements.md is stale; run the render command");
  }
};

const runCheck = async (directory: string): Promise<string[]> => {
  const evidence = await readEvidence(directory);
  const failures = checkEvidence(evidence);
  await checkToolSchemas(directory, evidence, failures);
  await checkRendered(directory, evidence, failures);
  return failures;
};

/**
 * Free-text stage: a teacher sentence resolves to candidate standards.
 *
 * The same corpus runs against the MCP `keywords` mode and the REST
 * `/academic-standards/search` semantic mode. The MCP tool takes a word array
 * and matches ANY word by stem; REST takes the sentence, ranks by vector
 * similarity, and returns provenance. Both receive the same jurisdiction and
 * subject, because the product passes those as explicit inputs.
 */

const FREE_TEXT_CORPUS_FILE = "free-text-corpus.json";
const FREE_TEXT_EVIDENCE_FILE = "free-text-evidence.json";
const FREE_TEXT_REPORT_FILE = "free-text.md";
const FREE_TEXT_SCHEMA_VERSION = 1;
const FREE_TEXT_TOOL = "find_standard_statement";
const REST_ORIGIN = "https://api.learningcommons.org/knowledge-graph/v0";
const REST_SEARCH_PATH = "/academic-standards/search";
const REST_API_KEY_HEADER = "x-api-key";
const KEYWORD_TOKEN_MAX = 32;
const KEYWORD_MIN_LENGTH = 3;
const TOP_K = 5;
const PERCENT = 100;
const MCP_OBSERVED_CAP = 25;
const MEDIAN_DIVISOR = 2;
const HTTP_OK = 200;
const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "any",
  "are",
  "but",
  "can",
  "cant",
  "could",
  "does",
  "doing",
  "for",
  "from",
  "get",
  "had",
  "has",
  "have",
  "help",
  "her",
  "him",
  "his",
  "how",
  "into",
  "its",
  "just",
  "kids",
  "like",
  "make",
  "more",
  "most",
  "much",
  "must",
  "not",
  "now",
  "our",
  "out",
  "own",
  "same",
  "see",
  "she",
  "should",
  "show",
  "some",
  "students",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "too",
  "under",
  "use",
  "using",
  "very",
  "want",
  "was",
  "way",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

interface FreeTextCorpusRow {
  id: string;
  text: string;
  kind: "documented" | "variant" | "adversarial";
  provenance: string;
  jurisdiction: string;
  subject: string;
  grade: string | null;
  expectedCode: string | null;
  expectedNote: string | null;
}

interface FreeTextCorpus {
  schemaVersion: number;
  capturedAt: string;
  description: string;
  limits: string[];
  rows: FreeTextCorpusRow[];
}

interface TransportResult {
  ok: boolean;
  httpStatus: number;
  latencyMs: number;
  codes: string[];
  scores: number[];
  total: number;
  expectedRank: number | null;
  familyRank: number | null;
  hasProvenance: boolean;
  capped: boolean;
  error: string | null;
}

interface FreeTextRowEvidence {
  id: string;
  text: string;
  kind: FreeTextCorpusRow["kind"];
  jurisdiction: string;
  subject: string;
  grade: string | null;
  expectedCode: string | null;
  expectedNote: string | null;
  keywords: string[];
  mcp: TransportResult;
  rest: TransportResult;
}

interface FreeTextEvidence {
  schemaVersion: number;
  kind: "lc-free-text-eval";
  capturedAt: string;
  revision: string;
  corpusHash: string;
  environment: {
    node: string;
    platform: string;
    mcpOrigin: string;
    restOrigin: string;
    credentialEnv: string;
    credentialPresent: boolean;
    topK: number;
  };
  protocol: {
    requested: string;
    negotiated: string | null;
    serverName: string | null;
    serverVersion: string | null;
  };
  rows: FreeTextRowEvidence[];
}

const CORPUS_KINDS = new Set(["documented", "variant", "adversarial"]);

const isNullableString = (value: unknown): boolean =>
  value === null || typeof value === "string";

const isFreeTextCorpusRow = (
  value: Record<string, unknown>
): value is Record<string, unknown> & FreeTextCorpusRow => {
  const checks = [
    typeof value.id === "string",
    typeof value.text === "string",
    typeof value.kind === "string",
    CORPUS_KINDS.has(String(value.kind)),
    typeof value.provenance === "string",
    typeof value.jurisdiction === "string",
    typeof value.subject === "string",
    isNullableString(value.grade),
    isNullableString(value.expectedCode),
    isNullableString(value.expectedNote),
  ];
  return checks.every(Boolean);
};

const parseFreeTextCorpus = (value: unknown): FreeTextCorpus | null => {
  if (!isRecord(value) || !Array.isArray(value.rows)) {
    return null;
  }
  const rows = value.rows.filter(isRecord).filter(isFreeTextCorpusRow);
  if (rows.length !== value.rows.length || rows.length === 0) {
    return null;
  }
  return {
    schemaVersion: readNumber(value.schemaVersion) ?? 0,
    capturedAt: readString(value.capturedAt) ?? "",
    description: readString(value.description) ?? "",
    limits: readArray(value.limits).filter(
      (item): item is string => typeof item === "string"
    ),
    rows,
  };
};

const readFreeTextCorpus = async (
  directory: string
): Promise<FreeTextCorpus> => {
  const parsed = parseFreeTextCorpus(
    JSON.parse(await readFile(join(directory, FREE_TEXT_CORPUS_FILE), "utf-8"))
  );
  if (!parsed) {
    throw new Error(`${FREE_TEXT_CORPUS_FILE} is not a valid corpus.`);
  }
  return parsed;
};

const corpusHash = (corpus: FreeTextCorpus): string =>
  sha256(canonicalize(corpus.rows));

const tokenizeTeacherText = (text: string): string[] => {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((raw) => raw.length >= KEYWORD_MIN_LENGTH && !STOPWORDS.has(raw));
  return [...new Set(tokens)].slice(0, KEYWORD_TOKEN_MAX);
};

const rankOf = (codes: string[], expected: string | null): number | null => {
  if (expected === null) {
    return null;
  }
  const index = codes.indexOf(expected);
  return index === -1 ? null : index + 1;
};

// A teacher accepts a sub-standard: 3.MD.C.7.a teaches 3.MD.C.7.
const familyRankOf = (
  codes: string[],
  expected: string | null
): number | null => {
  if (expected === null) {
    return null;
  }
  const index = codes.findIndex(
    (code) => code === expected || code.startsWith(`${expected}.`)
  );
  return index === -1 ? null : index + 1;
};

const median = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / MEDIAN_DIVISOR);
  return sorted.length % MEDIAN_DIVISOR === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / MEDIAN_DIVISOR)
    : sorted[middle];
};

const emptyTransport = (error: string): TransportResult => {
  return {
    ok: false,
    httpStatus: 0,
    latencyMs: 0,
    codes: [],
    scores: [],
    total: 0,
    expectedRank: null,
    familyRank: null,
    hasProvenance: false,
    capped: false,
    error,
  };
};

interface RestSnapshot {
  body: unknown;
  status: number;
  latencyMs: number;
}

const fetchRestSearch = async (
  apiKey: string,
  row: FreeTextCorpusRow
): Promise<RestSnapshot | null> => {
  const url = new URL(`${REST_ORIGIN}${REST_SEARCH_PATH}`);
  url.searchParams.set("query", row.text);
  url.searchParams.set("jurisdiction", row.jurisdiction);
  url.searchParams.set("academicSubject", row.subject);
  url.searchParams.set("limit", String(TOP_K));
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      headers: { [REST_API_KEY_HEADER]: apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });
    const body = (await response.json()) as unknown;
    return {
      body,
      status: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch {
    return null;
  }
};

const callRestSearch = async (
  apiKey: string,
  row: FreeTextCorpusRow
): Promise<TransportResult> => {
  const snapshot = await fetchRestSearch(apiKey, row);
  if (snapshot === null) {
    return emptyTransport("REST search request failed.");
  }
  const { body, status, latencyMs } = snapshot;
  if (status !== HTTP_OK || !Array.isArray(body)) {
    return {
      ...emptyTransport(`REST search failed with ${status}.`),
      httpStatus: status,
      latencyMs,
    };
  }
  const items = body.filter(isRecord);
  const codes = items
    .map((item) => readString(item.statementCode))
    .filter((code): code is string => code !== null);
  return {
    ok: true,
    httpStatus: status,
    latencyMs,
    codes,
    scores: items.map((item) => readNumber(item.score) ?? 0),
    total: items.length,
    expectedRank: rankOf(codes, row.expectedCode),
    familyRank: familyRankOf(codes, row.expectedCode),
    hasProvenance: items.some((item) => {
      return (
        readString(item.license) !== null &&
        readString(item.attributionStatement) !== null
      );
    }),
    capped: items.length >= TOP_K,
    error: null,
  };
};

interface FreeTextMcpSession {
  call: (row: FreeTextCorpusRow) => Promise<TransportResult>;
  protocol: FreeTextEvidence["protocol"];
}

const openFreeTextMcpSession = async (
  apiKey: string
): Promise<FreeTextMcpSession> => {
  const rpc = createClient(apiKey);
  const init = await rpc("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
  });
  if (init.error) {
    throw new Error(`initialize failed: ${init.error.message ?? "unknown"}`);
  }
  await sendNotification(apiKey, {});
  const initResult = isRecord(init.result) ? init.result : {};
  const serverInfo = isRecord(initResult.serverInfo)
    ? initResult.serverInfo
    : {};
  const protocol: FreeTextEvidence["protocol"] = {
    requested: PROTOCOL_VERSION,
    negotiated: readString(initResult.protocolVersion),
    serverName: readString(serverInfo.name),
    serverVersion: readString(serverInfo.version),
  };
  // The server echoes a session id after the first call; later calls may echo it.
  const state: { sessionId: string | null } = { sessionId: null };
  const call = async (row: FreeTextCorpusRow): Promise<TransportResult> => {
    const toolArguments: Record<string, unknown> = {
      keywords: tokenizeTeacherText(row.text),
      jurisdiction: row.jurisdiction,
      academicSubject: row.subject,
    };
    if (state.sessionId !== null) {
      toolArguments.session_id = state.sessionId;
    }
    const startedAt = performance.now();
    const response = await rpc("tools/call", {
      name: FREE_TEXT_TOOL,
      arguments: toolArguments,
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    if (response.error) {
      return {
        ...emptyTransport(response.error.message ?? "MCP tool error."),
        httpStatus: response.httpStatus,
        latencyMs,
      };
    }
    let parsed: ReturnType<typeof readToolPayload>;
    try {
      parsed = readToolPayload(response.result);
    } catch (error) {
      return {
        ...emptyTransport(Error.isError(error) ? error.message : String(error)),
        httpStatus: response.httpStatus,
        latencyMs,
      };
    }
    const standards = readRecords(parsed.payload.standards);
    const nextSessionId = readString(parsed.payload.session_id);
    if (nextSessionId !== null) {
      // Calls run one at a time, so this value cannot be stale.
      // eslint-disable-next-line require-atomic-updates
      state.sessionId = nextSessionId;
    }
    const codes = standards
      .map((item) => readString(item.statementCode))
      .filter((code): code is string => code !== null);
    return {
      ok: !parsed.isError,
      httpStatus: response.httpStatus,
      latencyMs,
      codes,
      scores: codes.map(() => 0),
      total: codes.length,
      expectedRank: rankOf(codes, row.expectedCode),
      familyRank: familyRankOf(codes, row.expectedCode),
      hasProvenance: false,
      capped: codes.length === MCP_OBSERVED_CAP,
      error: parsed.isError ? "Tool returned isError." : null,
    };
  };
  return { call, protocol };
};

const recordFreeText = async (directory: string): Promise<FreeTextEvidence> => {
  const apiKey = readApiKey();
  const corpus = await readFreeTextCorpus(directory);
  const session = await openFreeTextMcpSession(apiKey);
  const rows: FreeTextRowEvidence[] = [];
  for (const row of corpus.rows) {
    // Sequential calls keep latency and rate-limit measurements honest.
    // eslint-disable-next-line no-await-in-loop
    const mcp = await session.call(row);
    // eslint-disable-next-line no-await-in-loop
    const rest = await callRestSearch(apiKey, row);
    rows.push({
      id: row.id,
      text: row.text,
      kind: row.kind,
      jurisdiction: row.jurisdiction,
      subject: row.subject,
      grade: row.grade,
      expectedCode: row.expectedCode,
      expectedNote: row.expectedNote,
      keywords: tokenizeTeacherText(row.text),
      mcp,
      rest,
    });
  }
  const now = new Date();
  const evidence: FreeTextEvidence = {
    schemaVersion: FREE_TEXT_SCHEMA_VERSION,
    kind: "lc-free-text-eval",
    capturedAt: now.toISOString(),
    revision: readRevision(),
    corpusHash: corpusHash(corpus),
    environment: {
      node: process.version,
      platform: process.platform,
      mcpOrigin: ORIGIN,
      restOrigin: REST_ORIGIN,
      credentialEnv: KEY_ENV,
      credentialPresent: true,
      topK: TOP_K,
    },
    protocol: session.protocol,
    rows,
  };
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, FREE_TEXT_EVIDENCE_FILE),
    `${JSON.stringify(evidence, null, JSON_INDENT)}\n`
  );
  return evidence;
};

const readFreeTextEvidence = async (
  directory: string
): Promise<FreeTextEvidence> => {
  const parsed = JSON.parse(
    await readFile(join(directory, FREE_TEXT_EVIDENCE_FILE), "utf-8")
  ) as unknown;
  if (
    !isRecord(parsed) ||
    !Array.isArray(parsed.rows) ||
    !isRecord(parsed.environment)
  ) {
    throw new Error(`${FREE_TEXT_EVIDENCE_FILE} is not valid evidence.`);
  }
  return parsed as unknown as FreeTextEvidence;
};

const scoredRows = (evidence: FreeTextEvidence): FreeTextRowEvidence[] =>
  evidence.rows.filter((row) => row.expectedCode !== null);

const countHits = (
  rows: FreeTextRowEvidence[],
  transport: "mcp" | "rest",
  field: "expectedRank" | "familyRank",
  at: number
): number => {
  return rows.filter((row) => {
    const rank = row[transport][field];
    return rank !== null && rank <= at;
  }).length;
};

const formatPercent = (part: number, whole: number): string =>
  whole === 0 ? "n/a" : `${Math.round((part / whole) * PERCENT)}%`;

const formatRank = (
  result: TransportResult,
  expected: string | null
): string => {
  if (expected === null) {
    return "gap";
  }
  if (result.expectedRank !== null) {
    return `${result.expectedRank}`;
  }
  return result.familyRank === null
    ? "miss"
    : `miss (${result.familyRank} child)`;
};

const renderFreeText = (evidence: FreeTextEvidence): string => {
  const { rows } = evidence;
  const scored = scoredRows(evidence);
  const restProvenance = rows.filter((row) => row.rest.hasProvenance).length;
  const header = [
    "# Free text to one standard: MCP keywords against REST semantic search",
    "",
    `Measured ${rows.length} teacher sentences on ${evidence.capturedAt}. ` +
      `${scored.length} carry an expected standard; ${rows.length - scored.length} are gap probes.`,
    "",
    "## Summary",
    "",
    "| Measure | MCP `keywords` | REST `/academic-standards/search` |",
    "| --- | --- | --- |",
    `| hit@1 (exact code) | ${countHits(scored, "mcp", "expectedRank", 1)}/${scored.length} | ${countHits(scored, "rest", "expectedRank", 1)}/${scored.length} |`,
    `| hit@${TOP_K} (exact code) | ${countHits(scored, "mcp", "expectedRank", TOP_K)}/${scored.length} | ${countHits(scored, "rest", "expectedRank", TOP_K)}/${scored.length} |`,
    `| hit@1 (code or child) | ${countHits(scored, "mcp", "familyRank", 1)}/${scored.length} | ${countHits(scored, "rest", "familyRank", 1)}/${scored.length} |`,
    `| hit@${TOP_K} (code or child) | ${countHits(scored, "mcp", "familyRank", TOP_K)}/${scored.length} | ${countHits(scored, "rest", "familyRank", TOP_K)}/${scored.length} |`,
    `| hit@1 rate (exact) | ${formatPercent(countHits(scored, "mcp", "expectedRank", 1), scored.length)} | ${formatPercent(countHits(scored, "rest", "expectedRank", 1), scored.length)} |`,
    `| Rows with zero results | ${rows.filter((row) => row.mcp.total === 0).length} | ${rows.filter((row) => row.rest.total === 0).length} |`,
    `| Rows at the observed ${MCP_OBSERVED_CAP}-row cap | ${rows.filter((row) => row.mcp.capped).length} | n/a (limit ${TOP_K}) |`,
    `| Median latency | ${median(rows.map((row) => row.mcp.latencyMs))} ms | ${median(rows.map((row) => row.rest.latencyMs))} ms |`,
    `| Rows with license and attribution | 0 | ${restProvenance} |`,
    "",
    "## Per row",
    "",
    "| Row | Text | Expected | MCP rank | REST rank | MCP rows | REST rows | REST score | MCP ms | REST ms |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const rowLines = rows.map((row) => {
    const mcpRank = formatRank(row.mcp, row.expectedCode);
    const restRank = formatRank(row.rest, row.expectedCode);
    const restTop = row.rest.scores[0] ?? 0;
    return `| ${row.id} | ${row.text.slice(0, MAX_TEXT_EXCERPT)} | ${row.expectedCode ?? "none"} | ${mcpRank} | ${restRank} | ${row.mcp.total} | ${row.rest.total} | ${restTop.toFixed(3)} | ${row.mcp.latencyMs} | ${row.rest.latencyMs} |`;
  });
  const childOnly = scored.filter(
    (row) => row.rest.expectedRank === null && row.rest.familyRank !== null
  ).length;
  const familyMisses = scored
    .filter((row) => row.rest.familyRank === null)
    .map((row) => row.id);
  const gapRows = rows.filter((row) => row.expectedCode === null);
  const gapScores = gapRows.map((row) => row.rest.scores[0] ?? 0);
  const gapReturned = gapRows.filter((row) => row.rest.total > 0).length;
  const gapRange =
    gapScores.length === 0
      ? "n/a"
      : `${Math.min(...gapScores).toFixed(3)} to ${Math.max(...gapScores).toFixed(3)}`;
  const failureClasses = [
    "",
    "## Failure classes",
    "",
    `- **Exact code missed, child returned:** ${childOnly} of ${scored.length}. The teacher still sees the right family if the picker groups children under the parent.`,
    `- **Expected family absent from the top ${TOP_K}:** ${familyMisses.length} of ${scored.length}. Rows: ${familyMisses.join(", ")}.`,
    `- **Gap probe still returned rows:** ${gapReturned} of ${gapRows.length}. Top scores range ${gapRange}. The response carries no threshold, so the product must decide where "no match" starts.`,
    "- **MCP ordering:** rows arrive in code order, not relevance order. The expected code is never in the top five, even when it is present in the full array.",
    "- **Text tokens that are not topics:** a state name inside the sentence lowered the REST rank (`adv-state-name`). Grade words are not a filter on either transport. Both need structured inputs, not text inference.",
    "",
    "## Selector",
    "",
    `- Show the top ${TOP_K} REST candidates and require teacher confirmation. Top-1 is right on ${countHits(scored, "rest", "expectedRank", 1)} of ${scored.length} rows exact, and ${countHits(scored, "rest", "familyRank", 1)} of ${scored.length} with children. That rate is too low for an automatic pick.`,
    "- The MCP keyword mode is not a candidate for stage one at any k.",
  ];
  const method = [
    "",
    "## Method",
    "",
    "- The corpus is `free-text-corpus.json`. Both transports receive the row's `jurisdiction` and `subject` and nothing else about the standard.",
    `- MCP receives \`keywords\`: the sentence lowercased, split on non-alphanumerics, stopwords removed, capped at ${KEYWORD_TOKEN_MAX} tokens. The tool matches ANY word by stem, so a longer array trades precision for recall.`,
    `- REST receives the full sentence as \`query\` with \`limit=${TOP_K}\`. Results are ranked by vector similarity and carry a \`score\`.`,
    "- `hit@1` and `hit@5` count rows where the expected code lands at that rank. A row with no expected code is a gap probe and is excluded from both.",
    "- `exact code` requires the expected code itself. `code or child` also accepts a sub-standard, such as `3.MD.C.7.a` for `3.MD.C.7`, because a teacher can teach the child.",
    "- The MCP server returned the same row count on every broad query, which suggests a server cap. The evidence marks a row as capped when it equals the observed maximum.",
    "",
    "## Limits",
    "",
    "- No field transcript exists in this repository. Three rows quote documented text; the rest are authored teacher-register variants.",
    "- Semantic ranking is a vendor model with unknown version. A second run may reorder near ties.",
    "- Jurisdiction is an explicit input. This run never infers a state from text.",
    "- The corpus covers one subject and grades 3 to 8. It does not prove recall for every topic.",
    "",
  ];
  return [...header, ...rowLines, ...failureClasses, ...method].join("\n");
};

const transportFailures = (
  row: FreeTextCorpusRow,
  recorded: FreeTextRowEvidence,
  transport: "mcp" | "rest"
): string[] => {
  const result = recorded[transport];
  const failures: string[] = [];
  if (result.expectedRank !== null && result.expectedRank > result.total) {
    failures.push(`${row.id} ${transport} rank exceeds row count`);
  }
  if (result.familyRank !== null && result.familyRank > result.total) {
    failures.push(`${row.id} ${transport} family rank exceeds row count`);
  }
  if (result.ok && result.error !== null) {
    failures.push(`${row.id} ${transport} is ok with an error`);
  }
  return failures;
};

const checkFreeTextRows = (
  corpus: FreeTextCorpus,
  evidence: FreeTextEvidence
): string[] => {
  const failures: string[] = [];
  for (const [index, row] of corpus.rows.entries()) {
    const recorded = evidence.rows[index];
    if (recorded && recorded.id === row.id) {
      failures.push(
        ...transportFailures(row, recorded, "mcp"),
        ...transportFailures(row, recorded, "rest")
      );
    } else {
      failures.push(`row ${index} id mismatch`);
    }
  }
  return failures;
};

const readFreeTextReport = async (
  directory: string
): Promise<string | null> => {
  try {
    return await readFile(join(directory, FREE_TEXT_REPORT_FILE), "utf-8");
  } catch {
    return null;
  }
};

const checkFreeTextRender = (
  evidence: FreeTextEvidence,
  rendered: string | null
): string[] => {
  if (rendered === null) {
    return [`${FREE_TEXT_REPORT_FILE} is missing`];
  }
  return rendered === renderFreeText(evidence)
    ? []
    : [`${FREE_TEXT_REPORT_FILE} is stale; run free-text render`];
};

const checkFreeText = async (directory: string): Promise<string[]> => {
  const corpus = await readFreeTextCorpus(directory);
  const evidence = await readFreeTextEvidence(directory);
  const failures = checkFreeTextRows(corpus, evidence);
  if (evidence.corpusHash !== corpusHash(corpus)) {
    failures.push("corpus hash drifted from the recorded evidence");
  }
  if (evidence.rows.length !== corpus.rows.length) {
    failures.push(
      `expected ${corpus.rows.length} rows, saw ${evidence.rows.length}`
    );
  }
  failures.push(
    ...checkFreeTextRender(evidence, await readFreeTextReport(directory))
  );
  if (JSON.stringify(evidence).includes("Bearer ")) {
    failures.push("evidence contains an authorization header");
  }
  return failures;
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

const runFreeTextCommand = async (
  output: string | null,
  positional: string[]
): Promise<number> => {
  const [action, ...rest] = positional;
  const directory = output ?? rest[0] ?? DEFAULT_OUTPUT_DIRECTORY;
  if (action === "record") {
    const evidence = await recordFreeText(directory);
    console.log(
      `Recorded ${evidence.rows.length} free-text rows to ${directory}.`
    );
    return reportFailures(
      "Recorded free-text evidence failed its own invariants:",
      await checkFreeText(directory)
    );
  }
  if (action === "check") {
    const status = reportFailures(
      "FAIL lc-free-text evidence",
      await checkFreeText(directory)
    );
    if (status === 0) {
      console.log("OK lc-free-text evidence.");
    }
    return status;
  }
  if (action === "render") {
    const evidence = await readFreeTextEvidence(directory);
    await writeFile(
      join(directory, FREE_TEXT_REPORT_FILE),
      renderFreeText(evidence)
    );
    console.log(`Rendered ${join(directory, FREE_TEXT_REPORT_FILE)}.`);
    return 0;
  }
  console.error("Usage: lc-mcp-eval.ts free-text record|check|render [dir]");
  return USAGE_EXIT_CODE;
};

const runCommand = async (): Promise<number> => {
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
  if (command === "free-text") {
    return runFreeTextCommand(output, positional);
  }
  const directory = positional[0] ?? DEFAULT_OUTPUT_DIRECTORY;
  if (command === "check") {
    const status = reportFailures(
      "FAIL lc-mcp-eval evidence",
      await runCheck(directory)
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
    const left = await readEvidenceFile(leftPath);
    const right = await readEvidenceFile(rightPath);
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
      join(directory, MEASUREMENTS_FILE),
      renderMarkdown(evidence)
    );
    console.log(`Rendered ${join(directory, MEASUREMENTS_FILE)}.`);
    return 0;
  }
  console.error(
    "Usage: lc-mcp-eval.ts record --out <dir> | check [dir] | compare <a> <b> | render [dir] | free-text record|check|render [dir]"
  );
  return USAGE_EXIT_CODE;
};

const main = async (): Promise<number> => {
  try {
    return await runCommand();
  } catch (error) {
    console.error(Error.isError(error) ? error.message : String(error));
    return 1;
  }
};

process.exitCode = await main();
