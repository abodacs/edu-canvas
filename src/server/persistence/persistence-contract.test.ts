import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEquivalentFractionsDraft } from "../generation/provider";
import { buildValidatedLearningPath } from "../generation/learning-path";
import { createDemoCurriculumContext } from "../generation/semantic-validation";
import { getDemoSeedCounts } from "../seed-data";
import { createGenerationRequestHash } from "../generation/types";
import { createDrizzlePersistence } from "./drizzle";
import { createPostgresPersistence } from "./postgres";
import {
  isRunDatabaseTests,
  requireDatabaseUrl,
  withTenantSql,
} from "./database-test-support";
import type {
  GenerationAttemptRecord,
  LessonGenerationRecord,
} from "../generation/types";
import type { FoundationPersistence } from "../persistence";

const runId = randomUUID();

const requireLearningPath = <T extends { learningPath?: unknown }>(
  draft: T
): NonNullable<T["learningPath"]> => {
  if (!draft.learningPath) {
    throw new Error("Expected the generated draft to include a learning path.");
  }
  return draft.learningPath as NonNullable<T["learningPath"]>;
};

interface TenantFixture {
  tenantId: string;
  teacherId: string;
  otherTeacherId: string;
  standardId: string;
}

const adapters = [
  {
    name: "postgres",
    create: () => createPostgresPersistence(requireDatabaseUrl()),
  },
  {
    name: "drizzle",
    create: () => createDrizzlePersistence(requireDatabaseUrl()),
  },
] as const;

const expectTenantLocalClaims = async (
  persistence: FoundationPersistence,
  winningClaim: LessonGenerationRecord,
  otherTenant: LessonGenerationRecord,
  idempotencyKey: string
) => {
  await expect(
    persistence.findGenerationByIdempotencyKey(
      winningClaim.tenantId,
      winningClaim.teacherId,
      idempotencyKey
    )
  ).resolves.toMatchObject({
    requestId: winningClaim.requestId,
  });
  await expect(persistence.claimGeneration(otherTenant)).resolves.toStrictEqual(
    {
      claimed: true,
      record: otherTenant,
    }
  );
  await expect(
    persistence.findGenerationByIdempotencyKey(
      otherTenant.tenantId,
      otherTenant.teacherId,
      idempotencyKey
    )
  ).resolves.toMatchObject({ requestId: otherTenant.requestId });
};

const expectExpiredClaim = async (
  persistence: FoundationPersistence,
  claimed: LessonGenerationRecord,
  expired: LessonGenerationRecord | undefined
) => {
  expect(expired).toMatchObject({
    requestId: claimed.requestId,
    state: "failed-retryable",
    attempt: 1,
  });
  expect(expired?.attempts).toHaveLength(1);
  expect(expired?.attempts[0]).toMatchObject({
    state: "failed-retryable",
    diagnostics: [
      expect.objectContaining({ code: "GENERATION_CLAIM_EXPIRED" }),
    ],
  });
  await expect(
    persistence.expireGenerationClaim(
      claimed.tenantId,
      claimed.requestId,
      claimed.updatedAt,
      "2026-07-18T00:22:00.000Z"
    )
  ).resolves.toBeUndefined();
};

const expectModeratedLookup = async (
  persistence: FoundationPersistence,
  record: LessonGenerationRecord,
  requestHash: string
): Promise<void> => {
  await expect(
    persistence.findModeratedGeneration(
      record.tenantId,
      record.teacherId,
      requestHash
    )
  ).resolves.toMatchObject({
    requestId: record.requestId,
    state: "blocked-by-moderation",
  });

  const [differentHashRecord, otherTeacherRecord] = await Promise.all([
    persistence.findModeratedGeneration(
      record.tenantId,
      record.teacherId,
      "different-request-hash"
    ),
    persistence.findModeratedGeneration(
      record.tenantId,
      "identity_other_teacher",
      requestHash
    ),
  ]);

  expect(differentHashRecord).toBeUndefined();
  expect(otherTeacherRecord).toBeUndefined();

  const stored = await persistence.readGeneration(
    record.tenantId,
    record.requestId
  );

  expect(stored?.attempts[0]?.requestHash).toBe(requestHash);
};

const expectRetryLifecycle = async (
  persistence: FoundationPersistence,
  claimed: LessonGenerationRecord,
  retry: LessonGenerationRecord,
  completed: LessonGenerationRecord
) => {
  await expect(persistence.claimGeneration(retry)).resolves.toStrictEqual({
    claimed: true,
    record: retry,
  });
  await expect(
    persistence.saveGeneration(claimed, {
      attempt: claimed.attempt,
      updatedAt: claimed.updatedAt,
      leaseValidAfter: "2026-07-18T00:16:00.000Z",
    })
  ).resolves.toBeFalsy();
  await expect(
    persistence.saveGeneration(completed, {
      attempt: retry.attempt,
      updatedAt: retry.updatedAt,
      leaseValidAfter: "2026-07-18T00:19:00.000Z",
    })
  ).resolves.toBeTruthy();
};

const createTenantFixture = async (suffix: string): Promise<TenantFixture> => {
  const tenantId = `tenant_issue_42_${suffix}_${runId}`;
  const teacherId = `actor_issue_42_${suffix}_${runId}`;
  const otherTeacherId = `actor_issue_42_${suffix}_other_${runId}`;
  const standardId = `standard_issue_42_${suffix}_${runId}`;
  await withTenantSql(tenantId, async (transaction) => {
    await transaction`
      insert into tenants (id, slug, name, synthetic_data_only)
      values (${tenantId}, ${tenantId}, ${"Issue 42 contract fixture"}, true)
    `;
    await transaction`
      insert into actors (id, display_name)
      values
        (${teacherId}, ${"Issue 42 fixture teacher"}),
        (${otherTeacherId}, ${"Issue 42 other fixture teacher"})
    `;
    await transaction`
      insert into standards (
        id,
        tenant_id,
        code,
        name,
        subject,
        grade_band
      )
      values (
        ${standardId},
        ${tenantId},
        ${`ISSUE42-${suffix}`},
        ${"Issue 42 contract standard"},
        ${"Mathematics"},
        ${"Grade 4"}
      )
    `;
  });

  return { tenantId, teacherId, otherTeacherId, standardId };
};

const deleteTenantFixture = async (fixture: TenantFixture): Promise<void> => {
  await withTenantSql(fixture.tenantId, async (transaction) => {
    await transaction`
      delete from lesson_generation_attempts
      where tenant_id = ${fixture.tenantId}
    `;
    await transaction`
      delete from lesson_draft_requests
      where tenant_id = ${fixture.tenantId}
    `;
    await transaction`
      delete from standards
      where tenant_id = ${fixture.tenantId}
    `;
    await transaction`
      delete from actors
      where id in (${fixture.teacherId}, ${fixture.otherTeacherId})
    `;
    await transaction`
      delete from tenants
      where id = ${fixture.tenantId}
    `;
  });
};

const createGeneratingRecord = (
  fixture: TenantFixture,
  suffix: string,
  updatedAt: string,
  idempotencyKey = `issue-42-${suffix}-${runId}`,
  teacherId = fixture.teacherId
): LessonGenerationRecord => {
  const attemptNumber = 1;
  const requestId = `draft_issue_42_${suffix}_${runId}`;
  const createdAt = "2026-07-18T00:00:00.000Z";
  const input = {
    prompt: `Equivalent fractions ${suffix}`,
    grade: 4,
    standardId: fixture.standardId,
    language: "en" as const,
    difficulty: "on-level" as const,
  };

  return {
    requestId,
    tenantId: fixture.tenantId,
    teacherId,
    input,
    state: "generating",
    attempt: attemptNumber,
    diagnostics: [],
    attempts: [
      {
        attemptNumber,
        idempotencyKey,
        requestHash: createGenerationRequestHash(input),
        state: "generating",
        correctionAttempted: false,
        diagnostics: [],
        createdAt,
      },
    ],
    createdAt,
    updatedAt,
  };
};
const tenants = {} as {
  primary: TenantFixture;
  secondary: TenantFixture;
};

describe.skipIf(!isRunDatabaseTests)("PostgreSQL persistence parity", () => {
  beforeAll(async () => {
    tenants.primary = await createTenantFixture("primary");
    tenants.secondary = await createTenantFixture("secondary");
  });

  afterAll(async () => {
    const fixtures = [tenants.primary, tenants.secondary];
    for (const fixture of fixtures) {
      if (fixture) {
        // Fixtures are removed one at a time against the same database.
        // eslint-disable-next-line no-await-in-loop
        await deleteTenantFixture(fixture);
      }
    }
  });

  describe.each(adapters)("$name adapter", (adapter) => {
    it("reads the same seeded foundation counts", async () => {
      const persistence = adapter.create();

      await expect(persistence.readDemoCounts()).resolves.toStrictEqual(
        getDemoSeedCounts()
      );
    });

    it("keeps idempotency claims tenant-local and returns the winner", async () => {
      const persistence = adapter.create();
      const idempotencyKey = `issue-42-shared-key-${adapter.name}-${runId}`;
      const first = createGeneratingRecord(
        tenants.primary,
        `${adapter.name}-winner`,
        "2026-07-18T00:10:00.000Z",
        idempotencyKey
      );
      const duplicate = createGeneratingRecord(
        tenants.primary,
        `${adapter.name}-duplicate`,
        "2026-07-18T00:10:00.000Z",
        idempotencyKey
      );
      const otherTenant = createGeneratingRecord(
        tenants.secondary,
        `${adapter.name}-other-tenant`,
        "2026-07-18T00:10:00.000Z",
        idempotencyKey
      );

      const [firstClaim, duplicateClaim] = await Promise.all([
        persistence.claimGeneration(first),
        persistence.claimGeneration(duplicate),
      ]);
      const claims = [firstClaim, duplicateClaim];

      expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
      expect(claims.filter((claim) => !claim.claimed)).toHaveLength(1);

      const winningClaim = claims.find((claim) => claim.claimed);
      const losingClaim = claims.find((claim) => !claim.claimed);
      if (!winningClaim || !losingClaim) {
        throw new Error("Expected exactly one concurrent claim winner.");
      }

      expect(losingClaim.record.requestId).toBe(winningClaim.record.requestId);

      await expectTenantLocalClaims(
        persistence,
        winningClaim.record,
        otherTenant,
        idempotencyKey
      );
    });

    it("keeps idempotency keys scoped to the teacher inside one tenant", async () => {
      const persistence = adapter.create();
      const idempotencyKey = `issue-42-teacher-scope-${adapter.name}-${runId}`;
      const first = createGeneratingRecord(
        tenants.primary,
        `${adapter.name}-teacher-a`,
        "2026-07-18T00:10:00.000Z",
        idempotencyKey
      );
      const second = createGeneratingRecord(
        tenants.primary,
        `${adapter.name}-teacher-b`,
        "2026-07-18T00:10:00.000Z",
        idempotencyKey,
        tenants.primary.otherTeacherId
      );

      await expect(persistence.claimGeneration(first)).resolves.toMatchObject({
        claimed: true,
      });
      await expect(persistence.claimGeneration(second)).resolves.toMatchObject({
        claimed: true,
      });
      await expect(
        persistence.findGenerationByIdempotencyKey(
          first.tenantId,
          first.teacherId,
          idempotencyKey
        )
      ).resolves.toMatchObject({ requestId: first.requestId });
      await expect(
        persistence.findGenerationByIdempotencyKey(
          second.tenantId,
          second.teacherId,
          idempotencyKey
        )
      ).resolves.toMatchObject({ requestId: second.requestId });
    });

    it("expires claims atomically and rejects stale worker writes", async () => {
      const persistence = adapter.create();
      const claimed = createGeneratingRecord(
        tenants.primary,
        `${adapter.name}-lease`,
        "2026-07-18T00:20:00.000Z"
      );

      await expect(persistence.claimGeneration(claimed)).resolves.toStrictEqual(
        {
          claimed: true,
          record: claimed,
        }
      );

      const expired = await persistence.expireGenerationClaim(
        claimed.tenantId,
        claimed.requestId,
        claimed.updatedAt,
        "2026-07-18T00:21:00.000Z"
      );

      await expectExpiredClaim(persistence, claimed, expired);

      if (!expired) {
        throw new Error("Expected the active claim to expire.");
      }
      const [expiredAttempt] = expired.attempts;
      const retryAttempt: GenerationAttemptRecord = {
        ...expiredAttempt,
        attemptNumber: 2,
        idempotencyKey: `${expiredAttempt.idempotencyKey}-retry`,
        state: "generating",
        diagnostics: [],
        createdAt: "2026-07-18T00:23:00.000Z",
      };
      const retry: LessonGenerationRecord = {
        ...claimed,
        attempt: 2,
        state: "generating",
        diagnostics: [],
        updatedAt: "2026-07-18T00:23:00.000Z",
        attempts: [expiredAttempt, retryAttempt],
      };

      const provenance = {
        provider: "deterministic-fixture",
        model: "issue-42-contract-v1",
        promptTemplateVersion: "lesson-prompt-v1",
        validatorVersion: "lesson-validator-v2",
      } as const;
      const generatedDraft = createEquivalentFractionsDraft(retry.input);
      const learningPath = buildValidatedLearningPath({
        proposal: requireLearningPath(generatedDraft),
        context: createDemoCurriculumContext(retry.input),
        draftId: retry.requestId,
        provenance,
        validatorVersion: "semantic-validation-runner-v1",
      });
      const completed: LessonGenerationRecord = {
        ...retry,
        state: "ready-for-review",
        updatedAt: "2026-07-18T00:24:00.000Z",
        provenance,
        draft: {
          ...generatedDraft,
          learningPath,
          requestId: retry.requestId,
          input: retry.input,
          provenance,
          createdAt: retry.createdAt,
        },
        diagnostics: [
          {
            severity: "warning",
            code: "PARITY_TEST",
            message: "The shared adapter contract preserved the retry.",
          },
        ],
        attempts: [
          expiredAttempt,
          {
            ...retryAttempt,
            state: "ready-for-review",
            diagnostics: [],
          },
        ],
      };

      await expectRetryLifecycle(persistence, claimed, retry, completed);

      const stored = await persistence.readGeneration(
        retry.tenantId,
        retry.requestId
      );

      expect(
        stored?.attempts.map((attempt) => attempt.attemptNumber)
      ).toStrictEqual([1, 2]);
      expect(stored).toMatchObject({
        state: "ready-for-review",
        diagnostics: completed.diagnostics,
        provenance: completed.provenance,
        draft: completed.draft,
        updatedAt: completed.updatedAt,
      });
      expect(stored?.attempts[0]?.requestHash).toBe(
        createGenerationRequestHash(retry.input)
      );
    });

    it("rejects a write past the lease and accepts one inside it", async () => {
      const persistence = adapter.create();
      const record = createGeneratingRecord(
        tenants.primary,
        `${adapter.name}-lease-write`,
        "2026-07-18T00:00:00.000Z"
      );

      await expect(persistence.claimGeneration(record)).resolves.toMatchObject({
        claimed: true,
      });

      await expect(
        persistence.saveGeneration(
          { ...record, state: "ready-for-review" },
          {
            attempt: record.attempt,
            updatedAt: record.updatedAt,
            leaseValidAfter: record.updatedAt,
          }
        )
      ).resolves.toBeFalsy();

      const blocked: LessonGenerationRecord = {
        ...record,
        state: "blocked-by-moderation",
        diagnostics: [
          {
            severity: "error",
            code: "MODERATION_BLOCKED",
            message: "The request was blocked by safety review.",
          },
        ],
      };

      await expect(
        persistence.saveGeneration(blocked, {
          attempt: record.attempt,
          updatedAt: record.updatedAt,
          leaseValidAfter: "2026-07-17T23:00:00.000Z",
        })
      ).resolves.toBeTruthy();
    });

    it("finds a moderated request by its persisted request hash", async () => {
      const persistence = adapter.create();
      const record = createGeneratingRecord(
        tenants.primary,
        `${adapter.name}-hash`,
        "2026-07-18T00:00:00.000Z"
      );
      const requestHash = record.attempts[0]?.requestHash;
      if (!requestHash) {
        throw new Error(
          "Expected the fixture attempt to carry a request hash."
        );
      }

      await expect(persistence.claimGeneration(record)).resolves.toMatchObject({
        claimed: true,
      });

      await persistence.saveGeneration(
        {
          ...record,
          state: "blocked-by-moderation",
          diagnostics: [
            {
              severity: "error",
              code: "MODERATION_BLOCKED",
              message: "The request was blocked by safety review.",
            },
          ],
        },
        {
          attempt: record.attempt,
          updatedAt: record.updatedAt,
          leaseValidAfter: "2026-07-17T23:00:00.000Z",
        }
      );

      await expectModeratedLookup(persistence, record, requestHash);
    });
  });
});
