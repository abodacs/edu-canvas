import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import {
  builtInStandardsPacks,
  multistepWordProblemsPack,
} from "@/server/curriculum/built-in-packs";
import { createGenerationRequestHash } from "../generation/types";
import {
  parseActorId,
  parseMembershipId,
  parseTenantId,
} from "../identity/identifiers";
import {
  isRunDatabaseTests,
  requireDatabaseUrl,
  withTenantSql,
} from "./database-test-support";
import { createPostgresIdentityPersistence } from "./identity-postgres";
import { createPostgresPersistence } from "./postgres";
import { seededStandardRows } from "./seed-catalog";
import type { LessonGenerationRecord } from "../generation/types";

const runId = randomUUID();

interface StandardRow {
  id: string;
  code: string;
  name: string;
  subject: string;
  grade_band: string;
}

const createGeneratingRecord = (
  tenantId: string,
  teacherId: string,
  suffix: string
): LessonGenerationRecord => {
  const attemptNumber = 1;
  const requestId = `draft_issue_225_${suffix}_${runId}`;
  const createdAt = "2026-07-18T00:00:00.000Z";
  const input = {
    prompt: `Multistep word problems ${suffix}`,
    grade: 4,
    standardId: multistepWordProblemsPack.standardId,
    language: "en" as const,
    difficulty: "on-level" as const,
  };

  return {
    requestId,
    tenantId,
    teacherId,
    input,
    state: "generating",
    attempt: attemptNumber,
    diagnostics: [],
    attempts: [
      {
        attemptNumber,
        idempotencyKey: `issue-225-${suffix}-${runId}`,
        requestHash: createGenerationRequestHash(input),
        state: "generating",
        correctionAttempted: false,
        diagnostics: [],
        createdAt,
      },
    ],
    createdAt,
    updatedAt: createdAt,
  };
};

describe.skipIf(!isRunDatabaseTests)(
  "fresh tenant standards provisioning",
  () => {
    const tenantId = parseTenantId(`tenant_issue_225_${runId}`);
    const actorId = parseActorId(`actor_issue_225_${runId}`);
    const membershipId = parseMembershipId(`membership_issue_225_${runId}`);
    const tenantName = "Issue 225 fresh tenant school";

    const grantTeacherMembership = () => {
      const persistence =
        createPostgresIdentityPersistence(requireDatabaseUrl());
      return persistence.grantMembership({
        membershipId,
        actorId,
        tenantId,
        tenantName,
        role: "teacher",
      });
    };

    const readStandardRows = (): Promise<StandardRow[]> => {
      return withTenantSql(tenantId, (transaction) => {
        return transaction<StandardRow[]>`
          select id, code, name, subject, grade_band
          from standards
          where tenant_id = ${tenantId}
          order by id
        `;
      });
    };

    afterAll(async () => {
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
          delete from memberships where tenant_id = ${tenantId}
        `;
        await transaction`
          delete from actors where id = ${actorId}
        `;
        await transaction`
          delete from tenants where id = ${tenantId}
        `;
      });
    });

    it("provisions one standards row per built-in pack for a fresh tenant", async () => {
      const identityPersistence =
        createPostgresIdentityPersistence(requireDatabaseUrl());
      await identityPersistence.createActor({
        actorId,
        displayName: "Issue 225 fresh tenant teacher",
      });

      await expect(grantTeacherMembership()).resolves.toMatchObject({
        membershipId,
        tenantId,
        role: "teacher",
        status: "active",
      });

      const rows = await readStandardRows();
      expect(rows).toHaveLength(builtInStandardsPacks.length);
      expect(rows.map((row) => ({ id: row.id, code: row.code }))).toStrictEqual(
        seededStandardRows
          .map((row) => ({ id: row.id, code: row.code }))
          .toSorted((left, right) => left.id.localeCompare(right.id))
      );
    });

    it("claims a 4.OA.A.3 generation for the freshly provisioned tenant", async () => {
      const persistence = createPostgresPersistence(requireDatabaseUrl());
      const record = createGeneratingRecord(tenantId, actorId, "fresh");

      await expect(persistence.claimGeneration(record)).resolves.toStrictEqual({
        claimed: true,
        record,
      });
      await expect(
        persistence.readGeneration(tenantId, record.requestId)
      ).resolves.toMatchObject({
        input: { standardId: multistepWordProblemsPack.standardId },
        state: "generating",
      });
    });

    it("does not duplicate or overwrite standards rows when the grant replays", async () => {
      await grantTeacherMembership();

      const provisioned = await readStandardRows();
      const [customized] = provisioned;
      expect(customized).toBeDefined();
      if (!customized) {
        throw new Error("Expected at least one provisioned standards row.");
      }

      const customizedName = `${customized.name} (tenant local)`;
      await withTenantSql(tenantId, async (transaction) => {
        await transaction`
          update standards
          set name = ${customizedName}
          where tenant_id = ${tenantId} and id = ${customized.id}
        `;
      });

      await grantTeacherMembership();

      const replayed = await readStandardRows();
      expect(replayed).toHaveLength(provisioned.length);
      expect(replayed.map((row) => row.id)).toStrictEqual(
        provisioned.map((row) => row.id)
      );
      expect(replayed.find((row) => row.id === customized.id)?.name).toBe(
        customizedName
      );
    });
  }
);
