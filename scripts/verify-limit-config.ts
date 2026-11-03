import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generationLimitPolicy } from "@/server/limits/config";

/**
The deployment-shape gate (#104).

`fly.toml`, the release runbook, AgDR-0007, and the typed limit policy are
four statements of one model: a single Machine plus the agreed quota numbers.
Any of them drifting silently would let the deployed limit model become fiction, so this check reads all four and rejects a disagreement.

Limits: it reads the named files, not the live Fly organization. The observed Machine count is a deploy record, not something a repository check can see.
*/

const { join } = path;
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const issues: string[] = [];

const readProjectFile = (relativePath: string): Promise<string> =>
  readFile(join(projectRoot, relativePath), "utf-8");

const policy = generationLimitPolicy;

const flyToml = await readProjectFile("fly.toml");
const runbook = await readProjectFile("docs/release-fly-supabase.md");
const decision = await readProjectFile(
  "docs/agdr/AgDR-0007-demo-access-and-deployment.md"
);
const architecture = await readProjectFile("ARCHITECTURE.md");

const machineCount = /min_machines_running\s*=\s*(?<count>\d+)/u.exec(flyToml)
  ?.groups?.count;
if (machineCount !== "1") {
  issues.push(
    `fly.toml sets min_machines_running = ${machineCount ?? "missing"}; the milestone limit model runs exactly one Machine.`
  );
}

if (!runbook.includes("fly scale count 1")) {
  issues.push(
    "docs/release-fly-supabase.md must state `fly scale count 1`; the runbook is the scaling instruction of record."
  );
}
if (runbook.includes("fly scale count 2")) {
  issues.push(
    "docs/release-fly-supabase.md still instructs `fly scale count 2`."
  );
}
if (!runbook.includes("min_machines_running = 1")) {
  issues.push(
    "docs/release-fly-supabase.md must point at `min_machines_running = 1` instead of restating another count."
  );
}

const decisionClaims = [
  `at most ${policy.teacherGenerationAttemptsPerHour} generation attempts per teacher per hour`,
  `${policy.tenantGenerationAttemptsPerDay} per tenant per day`,
  `all generation stops at ${policy.tenantProviderCallsPerDay} provider calls per tenant per day`,
  `at most ${policy.sessionAuthoringRequestsPerMinute} authoring requests per session per minute`,
  "at most one active generation per teacher",
  "exactly one continuously running application Machine",
];
for (const claim of decisionClaims) {
  if (!decision.includes(claim)) {
    issues.push(
      `docs/agdr/AgDR-0007-demo-access-and-deployment.md no longer states "${claim}".`
    );
  }
}

if (architecture.includes("min_machines_running = 2")) {
  issues.push(
    "ARCHITECTURE.md still reports `min_machines_running = 2`; update the drift row with the landed shape."
  );
}

if (policy.activeGenerationsPerTeacher !== 1) {
  issues.push(
    `The active-generation policy is ${policy.activeGenerationsPerTeacher}; one teacher, one active generation.`
  );
}

for (const [field, value] of Object.entries(policy)) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    issues.push(`Limit policy ${field} must be a positive integer.`);
  }
}

if (issues.length > 0) {
  console.error("FAIL limit configuration");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `PASS limit configuration: one Machine, ${policy.teacherGenerationAttemptsPerHour}/teacher/hour, ${policy.tenantGenerationAttemptsPerDay}/tenant/day, ${policy.tenantProviderCallsPerDay} provider calls/tenant/day, ${policy.sessionAuthoringRequestsPerMinute}/session/minute.`
  );
}
