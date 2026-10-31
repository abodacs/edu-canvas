import { createDeterministicLessonDraftProvider } from "@/server/generation/provider";
import { createGenerationService } from "@/server/generation/service";
import { parseTenantId } from "@/server/identity/identifiers";
import { syntheticTeacherActor } from "@/server/identity/test-actors";
import { createSeededPersistence } from "@/server/persistence/seeded";
import { demoSeed } from "@/server/seed-data";
import type { SecurityHeaderClass } from "@/server/security-headers";

const teacherActor = syntheticTeacherActor({
  tenantId: parseTenantId(demoSeed.tenant.id),
});

const baseUrl = process.env.SMOKE_URL ?? "http://127.0.0.1:3000";
const requestTimeoutMs = 3000;

interface Probe {
  readonly path: string;
  readonly responseClass: SecurityHeaderClass;
  readonly expect: "ok" | "rejected";
}

// #130: every probe must carry its response class headers. The preview probe is
// rejected without a session, so it asserts the headers the stream path
// classifies to, not that the stream itself stays open. Streaming is covered by
// the browser check recorded on the pull request.
const probes: readonly Probe[] = [
  { path: "/", responseClass: "document", expect: "ok" },
  { path: "/login", responseClass: "document", expect: "ok" },
  { path: "/sign-up", responseClass: "document", expect: "ok" },
  { path: "/api/health", responseClass: "api", expect: "ok" },
  { path: "/api/readiness", responseClass: "api", expect: "ok" },
  {
    path: "/api/a2ui/preview?requestId=smoke",
    responseClass: "stream",
    expect: "rejected",
  },
];

const noncePattern = /'nonce-(?<nonce>[^']+)'/u;

const securityHeaderProblems = (
  response: Response,
  responseClass: SecurityHeaderClass,
  body: string
): string[] => {
  const problems: string[] = [];
  for (const name of [
    "content-security-policy",
    "referrer-policy",
    "x-content-type-options",
  ]) {
    if (!response.headers.has(name)) {
      problems.push(`missing ${name}`);
    }
  }
  if (response.headers.get("x-content-type-options") !== "nosniff") {
    problems.push("x-content-type-options is not nosniff");
  }
  if (response.headers.get("referrer-policy") !== "no-referrer") {
    problems.push("referrer-policy is not no-referrer");
  }

  const policy = response.headers.get("content-security-policy") ?? "";
  if (!policy.includes("frame-ancestors 'none'")) {
    problems.push("policy has no frame-ancestors 'none'");
  }
  if (responseClass !== "document") {
    return problems;
  }

  if (!policy.includes("default-src 'self'")) {
    problems.push("document policy has no default-src 'self'");
  }
  if (policy.includes("'unsafe-inline'")) {
    problems.push("document policy allows inline content");
  }
  if (!response.headers.has("permissions-policy")) {
    problems.push("missing permissions-policy");
  }
  const nonce = noncePattern.exec(policy)?.groups?.nonce;
  if (!nonce) {
    problems.push("document policy has no nonce");
  } else if (!(
    body.includes(`nonce="${nonce}"`) && body.includes(`content="${nonce}"`)
  )) {
    problems.push("bootstrap does not carry the policy nonce");
  }
  return problems;
};

const probeOnce = async (probe: Probe) => {
  const response = await fetch(new URL(probe.path, baseUrl), {
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const body = probe.responseClass === "document" ? await response.text() : "";
  const statusAccepted =
    probe.expect === "ok" ? response.ok : response.status >= 400;
  const problems = [
    ...(statusAccepted ? [] : [`unexpected status ${response.status}`]),
    ...securityHeaderProblems(response, probe.responseClass, body),
  ];
  return {
    path: probe.path,
    status: String(response.status),
    ok: problems.length === 0,
    problems,
  };
};

const results = await Promise.all(
  probes.map(async (probe) => {
    try {
      return await probeOnce(probe);
    } catch (error) {
      return {
        path: probe.path,
        status: "ERROR",
        ok: false,
        problems: [Error.isError(error) ? error.name : "UnknownError"],
      };
    }
  })
);

for (const result of results) {
  console.log(
    `${result.ok ? "PASS" : "FAIL"} ${result.status} ${result.path}${
      result.problems.length > 0 ? ` (${result.problems.join("; ")})` : ""
    }`
  );
}

if (results.some((result) => !result.ok)) {
  process.exitCode = 1;
}

const requestInput = {
  prompt: "equivalent fractions for grade 4",
  grade: 4,
  standardId: demoSeed.standard.id,
  language: "en" as const,
  difficulty: "on-level" as const,
  idempotencyKey: "smoke-generation-request",
};
const generationService = createGenerationService({
  persistence: createSeededPersistence(),
  provider: createDeterministicLessonDraftProvider(),
  requestIdFactory: () => "draft_req_smoke_generation",
});
const generation = await generationService.generate({
  actor: teacherActor,
  input: requestInput,
});
const isGenerationPassed =
  generation.record.state === "ready-for-review" &&
  generation.record.draft?.variants.length === 4;
console.log(
  `${isGenerationPassed ? "PASS" : "FAIL"} teacher generation returns four reviewable variants`
);

const recoveryService = createGenerationService({
  persistence: createSeededPersistence(),
  provider: createDeterministicLessonDraftProvider("timeout"),
  requestIdFactory: () => "draft_req_smoke_failure",
});
const recovery = await recoveryService.generate({
  actor: teacherActor,
  input: { ...requestInput, idempotencyKey: "smoke-generation-failure" },
});
const recoveryPassed =
  recovery.record.state === "failed-retryable" &&
  recovery.publicResult.retry.available;
console.log(
  `${recoveryPassed ? "PASS" : "FAIL"} forced provider failure exposes a retry state`
);

if (!isGenerationPassed || !recoveryPassed) {
  process.exitCode = 1;
}
