import { randomUUID } from "node:crypto";

import { beforeEach, afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEquivalentFractionsDraft } from "../generation/provider";
import { createGenerationRequestHash } from "../generation/types";
import { syntheticSeed } from "../seed-data";
import {
  gateArtifact,
  snapshotArtifactGateResult,
} from "@/server/safety/artifact-gate";
import {
  isRunDatabaseTests,
  requireDatabaseUrl,
  withTenantSql,
} from "./database-test-support";
import { createPostgresPersistence } from "./postgres";
import type {
  GenerationAttemptRecord,
  LessonGenerationRecord,
} from "../generation/types";
import type { FoundationPersistence } from "../persistence";
import type { AdvisoryReview } from "@/shared/generation-contract";

/**
#223: the advisory review is additive. This suite proves the real PostgreSQL
port stores it without touching the draft, state, diagnostics, gate, or
`updated_at`, and that rows written before the column still hydrate.
*/

const runId = randomUUID();
const tenantId = `tenant_issue_223_${runId}`;
const teacherId = `actor_issue_223_${runId}`;
const standardId = `standard_issue_223_${runId}`;

const createdAt = "2026-11-04T00:00:00.000Z";
const claimedAt = "2026-11-04T00:01:00.000Z";
const readyAt = "2026-11-04T00:02:00.000Z";

const input = {
  prompt: "Equivalent fractions matching practice",
  grade: 4,
  standardId,
  language: "en" as const,
  difficulty: "on-level" as const,
};

const { variants } = createEquivalentFractionsDraft({
  prompt: input.prompt,
  grade: input.grade,
  standardId: syntheticSeed.standard.id,
  language: input.language,
  difficulty: input.difficulty,
});

const learningPath = {
  direction: "forward" as const,
  steps: [
    {
      nodeId: "graph_node_equal_parts",
      label: "Understand equal parts",
      role: "prerequisite" as const,
      screenPurposeId: "screen_purpose_equal_parts",
      screenPurpose: "Show equal parts.",
    },
    {
      nodeId: "graph_node_equivalent_fractions",
      label: "Recognize equivalent fractions",
      role: "target" as const,
      screenPurposeId: "screen_purpose_equivalent_fractions",
      screenPurpose: "Match equivalent names.",
    },
  ],
  rationale: "Build on equal parts before matching equivalent names.",
  nextScreenRationale: "The target screen closes the prerequisite walk.",
  versionPins: {
    draftId: "draft_req_issue_223",
    graphVersion: syntheticSeed.activityVersion.graphVersion,
    catalogVersion: "matching-v1",
    modelVersion: "equivalent-fractions-fixture-v1",
    validatorVersion: "semantic-validation-runner-v1",
  },
};

const gate = snapshotArtifactGateResult(
  gateArtifact({
    kind: "lesson",
    draft: { variants },
    learningPath,
  })
);

const attempt = (
  state: LessonGenerationRecord["state"],
  idempotencyKey: string
): GenerationAttemptRecord => {
  return {
    attemptNumber: 1,
    idempotencyKey,
    requestHash: createGenerationRequestHash(input),
    state,
    correctionAttempted: false,
    diagnostics: [],
    createdAt,
  };
};

const generatingRecord = (requestId: string): LessonGenerationRecord => {
  return {
    requestId,
    tenantId,
    teacherId,
    input,
    state: "generating",
    attempt: 1,
    diagnostics: [],
    attempts: [attempt("generating", `issue-223-${requestId}`)],
    createdAt,
    updatedAt: claimedAt,
  };
};

const readyRecord = (requestId: string): LessonGenerationRecord => {
  return {
    requestId,
    tenantId,
    teacherId,
    input,
    state: "ready-for-review",
    attempt: 1,
    diagnostics: [
      {
        severity: "warning",
        code: "ANSWER_RELATIONSHIP_UNVERIFIED",
        message: "Review this relationship before continuing.",
        field: "relationships",
      },
    ],
    provenance: {
      provider: "deterministic-fixture",
      model: "equivalent-fractions-fixture-v1",
      promptTemplateVersion: "lesson-prompt-v1",
      validatorVersion: "lesson-validator-v2",
    },
    draft: {
      variants,
      learningPath,
      requestId,
      input,
      provenance: {
        provider: "deterministic-fixture",
        model: "equivalent-fractions-fixture-v1",
        promptTemplateVersion: "lesson-prompt-v1",
        validatorVersion: "lesson-validator-v2",
      },
      createdAt,
    },
    gate,
    attempts: [attempt("ready-for-review", `issue-223-${requestId}`)],
    createdAt,
    updatedAt: readyAt,
  };
};

const advisoryReview: AdvisoryReview = {
  schemaVersion: "advisory-review-v1",
  agent: {
    provider: "meta",
    model: "muse-spark-1.2-contributor",
    validatorVersion: "advisory-reviewer-v1",
  },
  reviewedAt: "2026-11-04T00:03:00.000Z",
  latencyMs: 4321,
  findings: [
    {
      code: "AGENT_RECOMMENDATION",
      field: "title",
      reason: "The challenge title repeats the practice title.",
      variantId: "variant-challenge",
    },
  ],
};

const snapshotOf = (record: LessonGenerationRecord) => {
  return {
    state: record.state,
    diagnostics: record.diagnostics,
    draft: record.draft,
    gate: record.gate,
    provenance: record.provenance,
    updatedAt: record.updatedAt,
  };
};

const createFixture = async (): Promise<void> => {
  await withTenantSql(tenantId, async (transaction) => {
    await transaction`
      insert into tenants (id, slug, name, synthetic_data_only)
      values (${tenantId}, ${tenantId}, ${"Issue 223 advisory fixture"}, true)
    `;
    await transaction`
      insert into actors (id, display_name)
      values (${teacherId}, ${"Issue 223 fixture teacher"})
    `;
    await transaction`
      insert into standards (id, tenant_id, code, name, subject, grade_band)
      values (
        ${standardId},
        ${tenantId},
        ${"ISSUE223"},
        ${"Issue 223 advisory standard"},
        ${"Mathematics"},
        ${"Grade 4"}
      )
    `;
  });
};

const deleteFixture = async (): Promise<void> => {
  await withTenantSql(tenantId, async (transaction) => {
    await transaction`
      delete from lesson_generation_attempts where tenant_id = ${tenantId}
    `;
    await transaction`
      delete from lesson_draft_requests where tenant_id = ${tenantId}
    `;
    await transaction`
      delete from standards where tenant_id = ${tenantId}
    `;
    await transaction`
      delete from actors where id = ${teacherId}
    `;
    await transaction`delete from tenants where id = ${tenantId}`;
  });
};

const persistReady = async (
  persistence: FoundationPersistence,
  requestId: string
): Promise<LessonGenerationRecord> => {
  await expect(
    persistence.claimGeneration(generatingRecord(requestId))
  ).resolves.toMatchObject({ claimed: true });

  const ready = readyRecord(requestId);
  await expect(
    persistence.saveGeneration(ready, {
      attempt: 1,
      updatedAt: claimedAt,
      leaseValidAfter: createdAt,
    })
  ).resolves.toBeTruthy();
  return ready;
};

describe.skipIf(!isRunDatabaseTests)("advisory review persistence", () => {
  let persistence: FoundationPersistence;

  beforeAll(async () => {
    await createFixture();
    persistence = createPostgresPersistence(requireDatabaseUrl());
  });

  beforeEach(() => {
    persistence = createPostgresPersistence(requireDatabaseUrl());
  });

  afterAll(async () => {
    await deleteFixture();
  });

  it("stores the review and leaves the draft, state, diagnostics, gate, and updated_at unchanged", async () => {
    const ready = await persistReady(persistence, `draft_issue_223_a_${runId}`);
    const before = snapshotOf(ready);

    await expect(
      persistence.writeAdvisoryReview(tenantId, ready.requestId, advisoryReview)
    ).resolves.toBeTruthy();

    const stored = await persistence.readGeneration(tenantId, ready.requestId);

    expect(stored?.advisoryReview).toStrictEqual(advisoryReview);
    expect(stored && snapshotOf(stored)).toStrictEqual(before);
  });

  it("refuses a record that is not ready-for-review", async () => {
    const requestId = `draft_issue_223_b_${runId}`;
    await expect(
      persistence.claimGeneration(generatingRecord(requestId))
    ).resolves.toMatchObject({ claimed: true });

    await expect(
      persistence.writeAdvisoryReview(tenantId, requestId, advisoryReview)
    ).resolves.toBeFalsy();

    const stored = await persistence.readGeneration(tenantId, requestId);
    expect(stored?.advisoryReview).toBeUndefined();
  });

  it("hydrates a row written before the advisory column as no review", async () => {
    const ready = await persistReady(persistence, `draft_issue_223_c_${runId}`);

    await withTenantSql(tenantId, async (transaction) => {
      await transaction`
        update lesson_draft_requests
        set advisory_review = null
        where tenant_id = ${tenantId} and id = ${ready.requestId}
      `;
    });

    const stored = await persistence.readGeneration(tenantId, ready.requestId);
    expect(stored?.advisoryReview).toBeUndefined();
    expect(stored?.state).toBe("ready-for-review");
  });

  it("scopes both the write and the read to the tenant", async () => {
    const ready = await persistReady(persistence, `draft_issue_223_d_${runId}`);

    await expect(
      persistence.writeAdvisoryReview(
        `tenant_issue_223_other_${runId}`,
        ready.requestId,
        advisoryReview
      )
    ).resolves.toBeFalsy();
    await expect(
      persistence.readGeneration(
        `tenant_issue_223_other_${runId}`,
        ready.requestId
      )
    ).resolves.toBeUndefined();
    const own = await persistence.readGeneration(tenantId, ready.requestId);
    expect(own?.advisoryReview).toBeUndefined();
  });
});
