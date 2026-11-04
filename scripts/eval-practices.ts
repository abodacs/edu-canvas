/**
Delegation practice pack runner (#135, parent method #138).

Commands:
  pnpm eval:practices --pack delegation                   full run, writes results/v0.json + v0-rollup.md
  pnpm eval:practices --pack delegation --deterministic   layers A + B-det only; part of `pnpm check`
  pnpm eval:practices --pack delegation --out <dir>       write results somewhere else

Layer A cases run in-process against the real seams. Layer B-det cases run against the real PostgreSQL persistence with the deterministic fixture provider, so they prove orchestration only and are reported separately from any live-model result. B-browser and B-live cases execute through scripts/eval-browser.mjs, which writes browser-results.json next to the results; the full run merges it. Blocked cases are recorded with their flip condition, never silently skipped and never turned into N/A.
*/

import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import postgres from "postgres";

import { fractionEquivalencePack } from "@/server/curriculum/built-in-packs";
import {
  GenerationRequestError,
  GENERATION_STANDARD_UNSUPPORTED_MESSAGE,
} from "@/server/generation/generation-request-error";
import { reviewLearningQuality } from "@/server/generation/learning-quality-validator";
import { createDeterministicLessonDraftProvider } from "@/server/generation/provider";
import {
  createGenerationService,
  normalizeGenerationInput,
} from "@/server/generation/service";
import { validateProviderDraft } from "@/server/generation/validation";
import { createDefaultContentSafety } from "@/server/moderation/content-safety";
import { createSeededGenerationLimitStore } from "@/server/persistence/limits-seeded";
import { createPostgresPersistence } from "@/server/persistence/postgres";
import { syntheticSeed } from "@/server/seed-data";
import { lessonGenerationInputSchema } from "@/shared/generation-contract";

import type { SemanticValidationInput } from "@/server/generation/semantic-validation-contract";
import type {
  GenerationPersistence,
  ProviderLessonDraft,
} from "@/server/generation/types";
import type { TeacherActor } from "@/server/identity/types";
import type { LessonGenerationInput } from "@/shared/generation-contract";

const GIT_BINARY = "/usr/bin/git";
const PACK = "delegation";
const PACK_DIRECTORY = path.join(
  "docs/product/teacher-practice-assessment",
  PACK
);
const CASES_DIRECTORY = path.join(PACK_DIRECTORY, "cases");
const RESULTS_DIRECTORY = path.join(PACK_DIRECTORY, "results");
const BROWSER_RESULTS_FILE = "browser-results.json";
const RESULTS_FILE = "v0.json";
const ROLLUP_FILE = "v0-rollup.md";
const PACK_VERSION = "v0";
const USAGE_EXIT_CODE = 2;
const DB_PROBE_TIMEOUT_MS = 4000;
const EVAL_ACTOR_ID = "actor_eval_delegation_t1";
const BASE_PROMPT =
  "Explain equivalent fractions with one whole cut into equal parts.";
const CURATED_STANDARD_MESSAGE = GENERATION_STANDARD_UNSUPPORTED_MESSAGE;
const STATE_READY_FOR_REVIEW = "ready-for-review";
const STATE_FAILED_RETRYABLE = "failed-retryable";
const DATABASE_URL_MISSING = "No DATABASE_URL is set.";
const INVALID_STANDARD_GRADE_5 = "standard_ccss_5_nf_b_03";
const UNSUITABLE_READING_STANDARD = "standard_ccss_4_ri_01";
const FAMILY_NOTE_PROMPT =
  "Send a note to Aisha's family about her fractions progress and her student id 4471.";
const GAP_OWNER = "needs issue — owner Abdullah";

const practices = {
  DG1: {
    name: "Clarify the goal",
    capability: "partial",
    gapOwner: GAP_OWNER,
  },
  DG2: {
    name: "Consult on the approach",
    capability: "missing",
    gapOwner: GAP_OWNER,
  },
  DG3: {
    name: "Recognize unsuitable tasks",
    capability: "missing",
    gapOwner: GAP_OWNER,
  },
  DG4: {
    name: "Consider strengths and limits",
    capability: "partial",
    gapOwner: GAP_OWNER,
  },
  DG5: {
    name: "Stay involved",
    capability: "partial",
    gapOwner: GAP_OWNER,
  },
  DG6: {
    name: "Choose a suitable tool or approach",
    capability: "partial",
    gapOwner: "#113 / #114",
  },
  DG7: {
    name: "Reassign work as it evolves",
    capability: "missing",
    gapOwner: GAP_OWNER,
  },
} as const;

type CaseLayer = "A" | "B-det" | "B-browser" | "B-live";
type DeferredKind = "not-run" | "blocked-feature" | "blocked-environment";
type CaseScore = 0 | 1 | 2;

const KIND_NOT_RUN = "not-run";
const KIND_BLOCKED_FEATURE = "blocked-feature";
const KIND_BLOCKED_ENVIRONMENT = "blocked-environment";

interface CaseFile {
  readonly id: string;
  readonly practice: string;
  readonly practiceName: string;
  readonly title: string;
  readonly layer: CaseLayer;
  readonly turnSequence: readonly string[];
  readonly expected: string;
  readonly observableFailure: string;
  readonly blockedFeature?: boolean;
  readonly flipCondition: string | null;
}

interface CaseResult {
  readonly id: string;
  readonly practice: string;
  readonly layer: CaseLayer;
  readonly status: "executed" | "deferred";
  readonly deferredKind?: DeferredKind;
  readonly score: CaseScore | null;
  readonly expected: string;
  readonly observed: string;
  readonly evidence: readonly string[];
  readonly flipCondition: string | null;
}

interface RunContext {
  readonly runToken: string;
  readonly isDeterministic: boolean;
  readonly hasDatabase: boolean;
  readonly browserEvidence: Map<string, CaseResult>;
}

const statusLabel = (entry: CaseResult): string => {
  if (entry.status === "executed") {
    return String(entry.score);
  }
  if (entry.deferredKind === KIND_NOT_RUN) {
    return KIND_NOT_RUN;
  }
  return entry.deferredKind === KIND_BLOCKED_FEATURE
    ? KIND_BLOCKED_FEATURE
    : KIND_BLOCKED_ENVIRONMENT;
};

const KNOWN_FLAGS = new Set(["--deterministic", "--out", "--pack"]);
const VALUED_FLAGS = ["--out", "--pack"];

const readArguments = (): {
  isDeterministic: boolean;
  outDirectory: string;
} => {
  const queue = process.argv.slice(2);
  const valueIndexes = new Set<number>();
  for (const flag of VALUED_FLAGS) {
    const at = queue.indexOf(flag);
    if (at !== -1) {
      valueIndexes.add(at + 1);
    }
  }
  const unknownArgument = queue.find(
    (argument, index) => !KNOWN_FLAGS.has(argument) && !valueIndexes.has(index)
  );
  if (unknownArgument !== undefined) {
    console.error(`Unknown argument: ${unknownArgument}`);
    process.exit(USAGE_EXIT_CODE);
  }
  const pack = queue[queue.indexOf("--pack") + 1] ?? null;
  if (pack !== PACK) {
    console.error(`This runner serves --pack ${PACK} only.`);
    process.exit(USAGE_EXIT_CODE);
  }
  const isDeterministic = queue.includes("--deterministic");
  const outArgument = queue.indexOf("--out");
  if (outArgument !== -1) {
    return {
      isDeterministic,
      outDirectory: queue[outArgument + 1] ?? RESULTS_DIRECTORY,
    };
  }
  if (isDeterministic) {
    return {
      isDeterministic,
      outDirectory: path.join(tmpdir(), "edu-canvas-eval-delegation"),
    };
  }
  return { isDeterministic, outDirectory: RESULTS_DIRECTORY };
};

const readCases = async (): Promise<CaseFile[]> => {
  const names = await readdir(CASES_DIRECTORY);
  const files = names.filter((file) => file.endsWith(".json"));
  const cases = await Promise.all(
    files.map(async (file) => {
      const raw = await readFile(path.join(CASES_DIRECTORY, file), "utf-8");
      return JSON.parse(raw) as CaseFile;
    })
  );
  const ids = new Set<string>();
  for (const entry of cases) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate case id: ${entry.id}`);
    }
    ids.add(entry.id);
    if (entry.blockedFeature === true && !entry.flipCondition) {
      throw new Error(`Blocked case ${entry.id} needs a flipCondition`);
    }
  }
  return cases;
};

const gitRevision = (): string => {
  return execFileSync(GIT_BINARY, ["rev-parse", "HEAD"], {
    encoding: "utf-8",
  }).trim();
};

const executed = (
  caseFile: CaseFile,
  score: CaseScore,
  observed: string
): CaseResult => {
  return {
    id: caseFile.id,
    practice: caseFile.practice,
    layer: caseFile.layer,
    status: "executed",
    score,
    expected: caseFile.expected,
    observed,
    evidence: [`scripts/eval-practices.ts ${caseFile.id} assertion output`],
    flipCondition: null,
  };
};

const pass = (caseFile: CaseFile, observed: string): CaseResult =>
  executed(caseFile, 2, observed);

const boundaryPass = (caseFile: CaseFile, observed: string): CaseResult =>
  executed(caseFile, 1, observed);

const fail = (caseFile: CaseFile, observed: string): CaseResult => {
  const result = executed(caseFile, 0, observed);
  return { ...result, evidence: [] };
};

const failWithError = (caseFile: CaseFile, error: unknown): CaseResult => {
  const message = Error.isError(error) ? error.message : String(error);
  return fail(caseFile, message);
};

const deferred = (
  caseFile: CaseFile,
  kind: DeferredKind,
  observed: string
): CaseResult => {
  return {
    id: caseFile.id,
    practice: caseFile.practice,
    layer: caseFile.layer,
    status: "deferred",
    deferredKind: kind,
    score: null,
    expected: caseFile.expected,
    observed,
    evidence:
      kind === "blocked-feature"
        ? ["README.md practice rows (grep at 1a8c94e)"]
        : [],
    flipCondition: kind === "not-run" ? null : caseFile.flipCondition,
  };
};

const assertHolds: (isMet: boolean, message: string) => asserts isMet = (
  isMet,
  message
) => {
  if (!isMet) {
    throw new Error(message);
  }
};

// --- Layer A handlers (pure, in-process) ------------------------------------

const captureRejection = (act: () => void): unknown => {
  try {
    act();
  } catch (error) {
    return error;
  }
  return null;
};

const captureRejectionAsync = async (
  act: () => Promise<unknown>
): Promise<unknown> => {
  try {
    await act();
  } catch (error) {
    return error;
  }
  return null;
};

const expectGenerationRejection = (
  thrown: unknown,
  caseFile: CaseFile,
  code: string,
  status: 409 | 422
): GenerationRequestError => {
  assertHolds(
    thrown instanceof GenerationRequestError,
    `${caseFile.id}: expected a GenerationRequestError, got ${
      Error.isError(thrown) ? thrown.message : String(thrown)
    }`
  );
  const rejection = thrown as GenerationRequestError;
  assertHolds(
    rejection.code === code && rejection.status === status,
    `${caseFile.id}: unexpected rejection ${rejection.code} ${String(rejection.status)}, expected ${code} ${String(status)}.`
  );
  return rejection;
};

const runDg1Normal = (caseFile: CaseFile): CaseResult => {
  const parsed = lessonGenerationInputSchema.safeParse({
    prompt: BASE_PROMPT,
    grade: "4",
    language: "en",
  });
  if (parsed.success) {
    return fail(caseFile, "The contract accepted an input without standardId.");
  }
  const issuePaths = parsed.error.issues.map((issue) => issue.path.join("."));
  assertHolds(
    issuePaths.some((issuePath) => issuePath.includes("standardId")),
    `${caseFile.id}: standardId missing from zod issues: ${issuePaths.join(", ")}`
  );
  return pass(
    caseFile,
    `lessonGenerationInputSchema rejected the input; zod issues name ${issuePaths.join(", ")}. The delivery seam maps a parse failure to IdentityError INVALID_INPUT, status 422 (src/server/identity/errors.ts:26). No record is created and no provider call is possible.`
  );
};

const runDg1Challenge = (caseFile: CaseFile): CaseResult => {
  const input: LessonGenerationInput = {
    prompt: "Teach equivalent fractions with area models.",
    grade: "4",
    standardId: INVALID_STANDARD_GRADE_5,
    language: "en",
    difficulty: "on-level",
  };
  const rejection = expectGenerationRejection(
    captureRejection(() => {
      normalizeGenerationInput(input);
    }),
    caseFile,
    "GENERATION_INPUT_INVALID",
    422
  );
  assertHolds(
    rejection.message.includes(CURATED_STANDARD_MESSAGE) &&
      !rejection.message.includes("4.NF.A.1"),
    `${caseFile.id}: generic unsupported-standard message missing: ${rejection.message}`
  );
  const strictParse = lessonGenerationInputSchema.safeParse({
    ...input,
    successCriteria: "Learners explain equivalence in one sentence.",
  });
  assertHolds(
    !strictParse.success,
    `${caseFile.id}: the strict contract accepted a successCriteria field.`
  );
  return pass(
    caseFile,
    `service.ts normalization threw ${rejection.code} status ${String(rejection.status)} with the generic unsupported-standard message, which names no other lesson; the .strict() contract also rejected the extra successCriteria field, confirming goal criteria are not captured separately.`
  );
};

const runDg3Normal = (caseFile: CaseFile): CaseResult => {
  const rejection = expectGenerationRejection(
    captureRejection(() => {
      normalizeGenerationInput({
        prompt: "Plan a reading-information lesson on main idea.",
        grade: "4",
        standardId: UNSUITABLE_READING_STANDARD,
        language: "en",
        difficulty: "on-level",
      });
    }),
    caseFile,
    "GENERATION_INPUT_INVALID",
    422
  );
  return boundaryPass(
    caseFile,
    `Boundary half holds: the unsuitable task was rejected ${rejection.code} 422 before any draft. Capability half stays a GAP: no handback interaction exists at 1a8c94e (grep evidence in the pack README), so the score is capped at 1 and the practice result stays missing.`
  );
};

const runDg3Challenge = (caseFile: CaseFile): CaseResult => {
  const decision = createDefaultContentSafety().checkPrompt(FAMILY_NOTE_PROMPT);
  assertHolds(
    !decision.allowed,
    `${caseFile.id}: the family-note request was not blocked by the safety seam.`
  );
  assertHolds(
    decision.category === "personal-data" &&
      decision.code === "MODERATION_BLOCKED",
    `${caseFile.id}: unexpected block ${decision.category} ${String(decision.code)}.`
  );
  return boundaryPass(
    caseFile,
    `Boundary half holds: checkPrompt blocked the request with category ${decision.category} and code ${decision.code} before any provider call (a prompt block makes zero provider calls per the service conformance suite). Capability half (teacher-judgment handback with bounded help) stays a GAP, so the score is capped at 1.`
  );
};

const curriculumContext = (): SemanticValidationInput["context"] => {
  return {
    tenantId: syntheticSeed.tenant.id,
    standardId: syntheticSeed.standard.id,
    standardCode: syntheticSeed.standard.code,
    grade: 4,
    language: "en",
    packVersion: fractionEquivalencePack.packVersion,
    graphVersion: syntheticSeed.activityVersion.graphVersion,
    targetNodeId: "graph_node_equivalent_fractions",
    nodes: syntheticSeed.graphNodes,
    edges: syntheticSeed.graphEdges,
    answerRules: fractionEquivalencePack.answerRules,
    allowedScreenPatterns: fractionEquivalencePack.allowedScreenPatterns,
  };
};

const fixtureDraft = () => {
  const provider = createDeterministicLessonDraftProvider("valid");
  return provider.generate(
    {
      prompt: BASE_PROMPT,
      grade: 4,
      standardId: syntheticSeed.standard.id,
      language: "en",
      difficulty: "on-level",
    },
    { correctionAttempt: false, diagnostics: [] }
  );
};

const WEAK_INSTRUCTIONS =
  "First look at the two bars and count how many equal parts each one has, then name the fraction each shaded part shows, and finally explain in one sentence why the two names describe the same amount of the whole.";
const WEAK_UNSAFE_TITLE = "Fractions that kill the whole";

const fixtureReview = async (
  mutate?: (draft: ProviderLessonDraft) => void
): Promise<ReturnType<typeof reviewLearningQuality>> => {
  const providerResponse = await fixtureDraft();
  const validated = validateProviderDraft(providerResponse.draft, {
    expectedLanguage: "en",
  });
  assertHolds(
    validated.ok,
    "The deterministic fixture draft did not pass structural validation."
  );
  const { draft } = validated;
  if (mutate !== undefined) {
    mutate(draft);
  }
  return reviewLearningQuality({
    draft,
    context: curriculumContext(),
  });
};

const runDg4Normal = async (caseFile: CaseFile): Promise<CaseResult> => {
  const review = await fixtureReview();
  assertHolds(
    review.verdict === "pass",
    `${caseFile.id}: the strong draft was flagged: ${review.verdict} ${JSON.stringify(review.findings)}`
  );
  return pass(
    caseFile,
    `reviewLearningQuality (learning-quality-validator.ts:295) returned verdict ${review.verdict} with no warning or hard_block findings on the strong draft. The validator claims no verification of reading level or pedagogy, matching the partial capability.`
  );
};

const runDg4Challenge = async (caseFile: CaseFile): Promise<CaseResult> => {
  const review = await fixtureReview((draft) => {
    draft.variants[0].instructions = WEAK_INSTRUCTIONS;
    draft.variants[1].title = WEAK_UNSAFE_TITLE;
  });
  const codes = review.findings.map((entry) => entry.code);
  assertHolds(
    codes.includes("READING_LEVEL_TOO_COMPLEX"),
    `${caseFile.id}: reading-load warning missing: ${codes.join(", ")}`
  );
  assertHolds(
    codes.includes("UNSAFE_CLAIM"),
    `${caseFile.id}: unsafe-claim hard block missing: ${codes.join(", ")}`
  );
  const readingFinding = review.findings.find(
    (entry) => entry.code === "READING_LEVEL_TOO_COMPLEX"
  );
  assertHolds(
    readingFinding !== undefined &&
      readingFinding.field === "instructions" &&
      (readingFinding.recommendation?.length ?? 0) > 0,
    `${caseFile.id}: the reading-load finding lost its field or recommendation.`
  );
  return pass(
    caseFile,
    `reviewLearningQuality returned ${review.verdict} with READING_LEVEL_TOO_COMPLEX (warning, field instructions, recommendation present) and UNSAFE_CLAIM (hard block) — the app names what to double-check without claiming verification.`
  );
};

// --- Layer B-det handlers (real PostgreSQL, deterministic fixture provider) --

const evalActor = (): TeacherActor => {
  const actor = {
    actorId: EVAL_ACTOR_ID,
    displayName: "Delegation eval pack (T1)",
    tenantId: syntheticSeed.tenant.id,
    tenantName: syntheticSeed.tenant.name,
    membershipId: "membership_eval_delegation_t1",
    sessionId: "session_eval_delegation_t1",
    sessionGeneration: "0",
    role: "teacher",
    rosterClassIds: [],
    // The service reads only tenantId, actorId, and role; the identity brands
    // are satisfied the same way the service tests build synthetic actors.
  };
  return actor as unknown as TeacherActor;
};

const evalInput = (
  runToken: string,
  suffix: string,
  overrides: Partial<LessonGenerationInput> = {}
): LessonGenerationInput => {
  return {
    prompt: BASE_PROMPT,
    grade: "4",
    standardId: syntheticSeed.standard.id,
    language: "en",
    difficulty: "on-level",
    idempotencyKey: `eval-${runToken}-${suffix}`,
    ...overrides,
  };
};

const ensureEvalActor = async (sql: postgres.Sql): Promise<void> => {
  await sql`
    insert into actors (id, display_name)
    values (${EVAL_ACTOR_ID}, 'Delegation eval pack (T1)')
    on conflict (id) do nothing
  `;
};

const probeDatabaseOrThrow = async (databaseUrl: string): Promise<void> => {
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: DB_PROBE_TIMEOUT_MS / 1000,
    idle_timeout: 1,
    prepare: false,
  });
  try {
    await sql`select 1 as ok`;
  } finally {
    await sql.end({ timeout: 1 });
  }
};

const isDatabaseReachable = async (): Promise<boolean> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) {
    return false;
  }
  try {
    await probeDatabaseOrThrow(databaseUrl);
    return true;
  } catch {
    return false;
  }
};

const generateOnce = async (
  persistence: GenerationPersistence,
  scenario: "valid" | "timeout",
  runToken: string,
  suffix: string,
  overrides: Partial<LessonGenerationInput> = {}
) => {
  const service = createGenerationService({
    persistence,
    provider: createDeterministicLessonDraftProvider(scenario),
    limits: createSeededGenerationLimitStore(),
  });
  return await service.generate({
    actor: evalActor(),
    input: evalInput(runToken, suffix, overrides),
  });
};

const withEvalConnection = async (
  databaseUrl: string,
  work: () => Promise<CaseResult>
): Promise<CaseResult> => {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await ensureEvalActor(sql);
    return await work();
  } finally {
    await sql.end({ timeout: 1 });
  }
};

const executeDg6Normal = async (
  persistence: GenerationPersistence,
  caseFile: CaseFile,
  runToken: string
): Promise<CaseResult> => {
  const failed = await generateOnce(persistence, "timeout", runToken, "6n1");
  assertHolds(
    failed.record.state === STATE_FAILED_RETRYABLE,
    `${caseFile.id}: expected ${STATE_FAILED_RETRYABLE}, got ${failed.record.state}.`
  );
  assertHolds(
    failed.publicResult.retry.available,
    `${caseFile.id}: the failed draft offered no retry.`
  );
  const retried = await generateOnce(persistence, "valid", runToken, "6n2", {
    retryOfRequestId: failed.record.requestId,
  });
  assertHolds(
    retried.record.state === STATE_READY_FOR_REVIEW,
    `${caseFile.id}: expected ${STATE_READY_FOR_REVIEW} after retry, got ${retried.record.state} (${JSON.stringify(retried.record.diagnostics)}).`
  );
  assertHolds(
    retried.record.attempt === 2 && retried.record.attempts.length === 2,
    `${caseFile.id}: expected attempt 2 with 2 recorded attempts, got ${String(retried.record.attempt)} / ${String(retried.record.attempts.length)}.`
  );
  const retryDraft = retried.record.draft ?? null;
  assertHolds(
    retryDraft !== null &&
      retryDraft.variants.length === 4 &&
      !retried.publicResult.retry.available,
    `${caseFile.id}: the retry did not settle as a four-variant draft without a retry offer.`
  );
  return pass(
    caseFile,
    `Real PostgreSQL persistence plus the deterministic fixture provider: the first attempt settled ${failed.record.state} with retry available; the retry (retryOfRequestId set) advanced the same record to ${retried.record.state} at attempt ${String(retried.record.attempt)} with ${String(retried.record.attempts.length)} recorded attempts and a four-variant draft.`
  );
};

const executeDg6Challenge = async (
  persistence: GenerationPersistence,
  caseFile: CaseFile,
  runToken: string
): Promise<CaseResult> => {
  const driftBase = await generateOnce(persistence, "timeout", runToken, "6c1");
  assertHolds(
    driftBase.record.state === STATE_FAILED_RETRYABLE,
    `${caseFile.id}: expected ${STATE_FAILED_RETRYABLE} base, got ${driftBase.record.state}.`
  );
  const driftRejection = expectGenerationRejection(
    await captureRejectionAsync(() => {
      return generateOnce(persistence, "valid", runToken, "6c2", {
        retryOfRequestId: driftBase.record.requestId,
        prompt: "A different lesson request that drifts from the original.",
      });
    }),
    caseFile,
    "RETRY_METADATA_MISMATCH",
    409
  );
  const finished = await generateOnce(persistence, "valid", runToken, "6c3");
  assertHolds(
    finished.record.state === STATE_READY_FOR_REVIEW,
    `${caseFile.id}: expected ${STATE_READY_FOR_REVIEW} draft, got ${finished.record.state}.`
  );
  const staleRejection = expectGenerationRejection(
    await captureRejectionAsync(() => {
      return generateOnce(persistence, "valid", runToken, "6c4", {
        retryOfRequestId: finished.record.requestId,
      });
    }),
    caseFile,
    "DRAFT_NOT_RETRYABLE",
    409
  );
  const unchanged =
    (await persistence.readGeneration(
      syntheticSeed.tenant.id,
      finished.record.requestId
    )) ?? null;
  assertHolds(
    unchanged !== null &&
      unchanged.state === finished.record.state &&
      unchanged.attempt === finished.record.attempt,
    `${caseFile.id}: a refused retry mutated the record.`
  );
  return pass(
    caseFile,
    `Decision rules held: the drifted retry was refused ${driftRejection.code} 409 and the ${STATE_READY_FOR_REVIEW} retry was refused ${staleRejection.code} 409; the record stayed at state ${unchanged?.state} attempt ${String(unchanged?.attempt)}.`
  );
};

const runDg6 = async (
  caseFile: CaseFile,
  runToken: string,
  work: (
    persistence: GenerationPersistence,
    caseFile: CaseFile,
    runToken: string
  ) => Promise<CaseResult>
): Promise<CaseResult> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) {
    return deferred(caseFile, KIND_BLOCKED_ENVIRONMENT, DATABASE_URL_MISSING);
  }
  const persistence = createPostgresPersistence(databaseUrl);
  const runWork = (): Promise<CaseResult> =>
    work(persistence, caseFile, runToken);
  try {
    return await withEvalConnection(databaseUrl, runWork);
  } catch (error) {
    return failWithError(caseFile, error);
  }
};

const runDg6Normal = (
  caseFile: CaseFile,
  runToken: string
): Promise<CaseResult> => runDg6(caseFile, runToken, executeDg6Normal);

const runDg6Challenge = (
  caseFile: CaseFile,
  runToken: string
): Promise<CaseResult> => runDg6(caseFile, runToken, executeDg6Challenge);

// --- Dispatch ---------------------------------------------------------------

const layerAHandlers = {
  "dg-1-normal": runDg1Normal,
  "dg-1-challenge": runDg1Challenge,
  "dg-3-normal": runDg3Normal,
  "dg-3-challenge": runDg3Challenge,
  "dg-4-normal": runDg4Normal,
  "dg-4-challenge": runDg4Challenge,
} as const;

const layerBDetHandlers = {
  "dg-6-normal": runDg6Normal,
  "dg-6-challenge": runDg6Challenge,
} as const;

const readBrowserCasesOrThrow = async (): Promise<CaseResult[]> => {
  const raw = JSON.parse(
    await readFile(path.join(RESULTS_DIRECTORY, BROWSER_RESULTS_FILE), "utf-8")
  ) as { cases?: CaseResult[] };
  return Array.isArray(raw.cases) ? raw.cases : [];
};

const readBrowserEvidence = async (): Promise<Map<string, CaseResult>> => {
  let entries: CaseResult[] = [];
  try {
    entries = await readBrowserCasesOrThrow();
  } catch {
    // No browser evidence yet: the full run records blocked-environment.
  }
  const byId = new Map<string, CaseResult>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }
  return byId;
};

const runLayerACase = async (caseFile: CaseFile): Promise<CaseResult> => {
  const handler = layerAHandlers[caseFile.id as keyof typeof layerAHandlers];
  if (handler === undefined) {
    return fail(caseFile, "No layer A handler is implemented.");
  }
  try {
    return await handler(caseFile);
  } catch (error) {
    return failWithError(caseFile, error);
  }
};

const runLayerBDetCase = async (
  caseFile: CaseFile,
  context: RunContext
): Promise<CaseResult> => {
  if (!context.hasDatabase) {
    return deferred(
      caseFile,
      KIND_BLOCKED_ENVIRONMENT,
      process.env.DATABASE_URL === undefined
        ? DATABASE_URL_MISSING
        : "The DATABASE_URL target did not accept a connection."
    );
  }
  const handler =
    layerBDetHandlers[caseFile.id as keyof typeof layerBDetHandlers];
  if (handler === undefined) {
    return fail(caseFile, "No layer B-det handler is implemented.");
  }
  try {
    return await handler(caseFile, context.runToken);
  } catch (error) {
    return failWithError(caseFile, error);
  }
};

const runBrowserOrLiveCase = (
  caseFile: CaseFile,
  context: RunContext
): CaseResult => {
  if (context.isDeterministic) {
    return deferred(
      caseFile,
      KIND_NOT_RUN,
      "Deterministic subset: browser and live cases are excluded from pnpm check."
    );
  }
  if (caseFile.layer === "B-live" && process.env.EVAL_LIVE_MODEL !== "1") {
    return deferred(
      caseFile,
      KIND_BLOCKED_ENVIRONMENT,
      "EVAL_LIVE_MODEL is not set; live-model cases are gated and reported separately."
    );
  }
  const observed = context.browserEvidence.get(caseFile.id);
  return observed === undefined
    ? deferred(
        caseFile,
        KIND_BLOCKED_ENVIRONMENT,
        "No browser evidence was provided for this run; execute scripts/eval-browser.mjs against the running dev server."
      )
    : observed;
};

const runSingleCase = async (
  caseFile: CaseFile,
  context: RunContext
): Promise<CaseResult> => {
  if (caseFile.blockedFeature === true) {
    return deferred(
      caseFile,
      KIND_BLOCKED_FEATURE,
      "The required workflow does not exist at the pinned revision; absence evidence is the recorded grep in the pack README."
    );
  }
  if (caseFile.layer === "A") {
    return await runLayerACase(caseFile);
  }
  return caseFile.layer === "B-det"
    ? await runLayerBDetCase(caseFile, context)
    : runBrowserOrLiveCase(caseFile, context);
};

const executeCases = async (
  cases: readonly CaseFile[],
  context: RunContext
): Promise<CaseResult[]> => {
  const results: CaseResult[] = [];
  for (const caseFile of cases) {
    // Cases run sequentially by design: each result is observed before the
    // next case starts, matching the pack's one-run-one-report method.
    // eslint-disable-next-line no-await-in-loop
    results.push(await runSingleCase(caseFile, context));
  }
  return results;
};

// --- Assembly ---------------------------------------------------------------

const renderRollup = (
  results: readonly CaseResult[],
  revision: string,
  generatedAt: string,
  mode: string
): string => {
  const lines: string[] = [
    `# Delegation pack ${PACK_VERSION} rollup`,
    "",
    `Run: ${generatedAt} · application revision \`${revision}\` · mode \`${mode}\` · runner \`scripts/eval-practices.ts\`.`,
    "",
    "## Practices",
    "",
    "| ID | Practice | Capability @ pin | Observed cases | Result | Gap owner |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const [id, practice] of Object.entries(practices)) {
    const executedCases = results.filter(
      (entry) => entry.practice === id && entry.status === "executed"
    );
    const observedText =
      executedCases.length > 0
        ? executedCases
            .map((entry) => `${entry.id}=${statusLabel(entry)}`)
            .join(", ")
        : "no executed case";
    lines.push(
      `| ${id} | ${practice.name} | ${practice.capability} | ${observedText} | see cases | ${practice.gapOwner} |`
    );
  }
  lines.push(
    "",
    "Capability labels come from the re-pinned rows in the pack README; they are not eval scores. Observed case scores: 2 fully meets, 1 partly meets, 0 fails.",
    "",
    "## Cases",
    "",
    "| Case | Practice | Layer | Status / score | Observed |",
    "| --- | --- | --- | --- | --- |"
  );
  for (const entry of results) {
    const isBlocked =
      entry.deferredKind === KIND_BLOCKED_FEATURE ||
      entry.deferredKind === KIND_BLOCKED_ENVIRONMENT;
    const observed = isBlocked
      ? `${entry.observed} Flip: ${entry.flipCondition ?? "—"}`
      : entry.observed;
    lines.push(
      `| \`${entry.id}\` | ${entry.practice} | ${entry.layer} | ${statusLabel(entry)} | ${observed} |`
    );
  }
  lines.push("", "None of the statuses above is a pass by itself.");
  return `${lines.join("\n")}\n`;
};

const main = async (): Promise<void> => {
  const { isDeterministic, outDirectory } = readArguments();
  const cases = await readCases();
  const context: RunContext = {
    runToken: Date.now().toString(36),
    isDeterministic,
    hasDatabase: await isDatabaseReachable(),
    browserEvidence: await readBrowserEvidence(),
  };
  const results = await executeCases(cases, context);
  const revision = gitRevision();
  const now = new Date();
  const generatedAt = now.toISOString();
  const mode = isDeterministic ? "deterministic" : "full";
  const document = {
    pack: PACK,
    version: PACK_VERSION,
    mode,
    generatedAt,
    applicationRevision: revision,
    pins: {
      caseVersion: PACK_VERSION,
      provider:
        "layer A: none (in-process); layer B-det: deterministic fixture provider (orchestration only); B-browser/B-live: see results evidence",
    },
    cases: results,
  };
  await mkdir(outDirectory, { recursive: true });
  await writeFile(
    path.join(outDirectory, RESULTS_FILE),
    `${JSON.stringify(document, null, 2)}\n`
  );
  await writeFile(
    path.join(outDirectory, ROLLUP_FILE),
    renderRollup(results, revision, generatedAt, mode)
  );
  let failed = 0;
  for (const entry of results) {
    console.log(`${entry.id}: ${statusLabel(entry)}`);
    if (entry.status === "executed" && entry.score === 0) {
      failed += 1;
    }
  }
  console.log(`results: ${path.join(outDirectory, RESULTS_FILE)}`);
  if (failed === 0) {
    return;
  }
  console.error(`${String(failed)} executed case(s) failed.`);
  process.exitCode = 1;
};

await main();
