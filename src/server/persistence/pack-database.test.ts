/* eslint-disable no-await-in-loop -- cleanup deletes in foreign-key order. */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  isRunDatabaseTests,
  requireDatabaseUrl,
  withRawDatabase,
  withTenantSql,
} from "./database-test-support";
import { PackUniqueViolationError } from "./pack-port";
import { createPostgresPackPersistence } from "./pack-postgres";
import type { PackVersionRecord } from "./pack-port";

const runId = randomUUID();

const tenantId = `tenant_pack_${runId}`;
const otherTenantId = `tenant_pack_other_${runId}`;
const teacherId = `actor_pack_teacher_${runId}`;
const otherTeacherId = `actor_pack_teacher_other_${runId}`;
const membershipId = `membership_pack_${runId}`;
const learnerId = `identity_pack_learner_${runId}`;
const standardId = `standard_pack_${runId}`;
const requestId = `request_pack_${runId}`;
const versionId = `version_pack_${runId}`;

const hash = (character: string): string => character.repeat(64);

const packs = () => createPostgresPackPersistence(requireDatabaseUrl());

const versionRecord: PackVersionRecord = {
  id: versionId,
  tenantId,
  schemaVersion: "pack-version-v1",
  requestId,
  teacherActorId: teacherId,
  revision: 1,
  state: "ready-for-review",
  parentVersionId: null,
  sourceArtifactHash: hash("a"),
  artifactHash: hash("b"),
  gateVerdict: "pass",
  gateSnapshot: null,
  validationResult: { ok: true },
  validationResultHash: hash("c"),
  ruleVersions: { validatorVersion: "lesson-validator-v2" },
  provenance: { provider: "test" },
  publicContent: { variants: [] },
  privateAnswers: { variants: [] },
  contentHash: hash("d"),
  privateAnswerDigest: hash("e"),
  createdAt: "2026-10-31T12:00:00.000Z",
};

const seedFixtures = async (): Promise<void> => {
  await withRawDatabase(async (sql) => {
    await sql`
      insert into actors (id, display_name)
      values (${teacherId}, 'Pack Teacher'), (${otherTeacherId}, 'Other Teacher')
    `;
    await sql`
      insert into tenants (id, slug, name, synthetic_data_only)
      values
        (${tenantId}, ${tenantId}, 'Pack Tenant', true),
        (${otherTenantId}, ${otherTenantId}, 'Other Tenant', true)
    `;
    await sql`
      insert into memberships (id, actor_id, tenant_id, role, status, revision)
      values (${membershipId}, ${teacherId}, ${tenantId}, 'teacher', 'active', 1)
    `;
    await sql`
      insert into identities (
        id, tenant_id, role, display_name, demo_handle, is_active
      )
      values (${learnerId}, ${tenantId}, 'student', 'Pack Learner', ${`pack-${runId}`}, true)
    `;
    await sql`
      insert into standards (id, tenant_id, code, name, subject, grade_band)
      values (${standardId}, ${tenantId}, '4.NF.A.1', 'Equivalent fractions', 'mathematics', '3-5')
    `;
    await sql`
      insert into lesson_draft_requests (
        id, tenant_id, teacher_id, prompt, grade, standard_id, language,
        difficulty, state, attempt, diagnostics, draft, created_at, updated_at
      )
      values (
        ${requestId}, ${tenantId}, ${teacherId}, 'equivalent fractions', 4,
        ${standardId}, 'en', 'on-level', 'ready-for-review', 1, '[]'::jsonb,
        null, ${versionRecord.createdAt}, ${versionRecord.createdAt}
      )
    `;
  });
};

const cleanFixtures = async (): Promise<void> => {
  await withRawDatabase(async (sql) => {
    await sql.begin(async (transaction) => {
      for (const table of [
        "pack_versions",
        "pack_approvals",
        "pack_publications",
        "pack_assignments",
        "pack_receipts",
      ]) {
        await transaction.unsafe(`alter table ${table} disable trigger user`);
      }
      for (const tenant of [tenantId, otherTenantId]) {
        await transaction`select set_config('app.tenant_id', ${tenant}, true)`;
        await transaction`delete from pack_receipts where tenant_id = ${tenant}`;
        await transaction`delete from pack_assignments where tenant_id = ${tenant}`;
        await transaction`delete from pack_publications where tenant_id = ${tenant}`;
        await transaction`delete from pack_approvals where tenant_id = ${tenant}`;
        await transaction`delete from pack_versions where tenant_id = ${tenant}`;
        await transaction`delete from lesson_draft_requests where tenant_id = ${tenant}`;
        await transaction`delete from standards where tenant_id = ${tenant}`;
        await transaction`delete from identities where tenant_id = ${tenant}`;
        await transaction`delete from memberships where tenant_id = ${tenant}`;
      }
      await transaction`delete from tenants where id in (${tenantId}, ${otherTenantId})`;
      await transaction`delete from actors where id in (${teacherId}, ${otherTeacherId})`;
      for (const table of [
        "pack_versions",
        "pack_approvals",
        "pack_publications",
        "pack_assignments",
        "pack_receipts",
      ]) {
        await transaction.unsafe(`alter table ${table} enable trigger user`);
      }
    });
  });
};

describe.skipIf(!isRunDatabaseTests)("pack records in PostgreSQL", () => {
  beforeAll(async () => {
    await seedFixtures();
    await packs().insertVersion(versionRecord);
  });

  afterAll(async () => {
    await cleanFixtures();
  });

  it("round-trips an immutable version", async () => {
    const stored = await packs().readVersion(tenantId, versionId);

    expect(stored).toStrictEqual(versionRecord);
  });

  it("rejects a duplicate revision", async () => {
    await expect(
      packs().insertVersion({ ...versionRecord, id: `version_dup_${runId}` })
    ).rejects.toBeInstanceOf(PackUniqueViolationError);
  });

  it("rejects an update or delete on a stored version", async () => {
    await expect(
      withTenantSql(tenantId, async (transaction) => {
        await transaction`
          update pack_versions set state = 'blocked-by-validation'
          where id = ${versionId}
        `;
      })
    ).rejects.toThrow(/Immutable foundation rows cannot be changed/u);

    await expect(
      withTenantSql(tenantId, async (transaction) => {
        await transaction`delete from pack_versions where id = ${versionId}`;
      })
    ).rejects.toThrow(/Immutable foundation rows cannot be changed/u);
  });

  it("forces RLS on every pack table and scopes adapter reads by tenant", async () => {
    // The local docker role is a superuser, so a live bypass check cannot
    // prove the policy. The catalog check proves FORCE is deployed; the
    // cross-tenant adapter read proves the query scoping.
    const tables = await withRawDatabase(async (sql) => {
      const rows = await sql<{ relname: string }[]>`
        select relname
        from pg_class
        where relname in (
          'pack_versions', 'pack_approvals', 'pack_publications',
          'pack_assignments', 'pack_receipts'
        )
          and relforcerowsecurity
        order by relname
      `;
      return rows.map((row) => row.relname);
    });

    expect(tables).toStrictEqual([
      "pack_approvals",
      "pack_assignments",
      "pack_publications",
      "pack_receipts",
      "pack_versions",
    ]);

    const scoped = await withTenantSql(tenantId, async (transaction) => {
      const rows = await transaction<{ count: number }[]>`
        select count(*)::int as count from pack_versions where id = ${versionId}
      `;
      return rows[0]?.count;
    });

    expect(scoped).toBe(1);
    await expect(
      packs().readVersion(otherTenantId, versionId)
    ).resolves.toBeUndefined();
  });

  it("stores approvals, a publication, an assignment, and receipts once", async () => {
    const approvalId = `approval_${runId}`;
    await packs().insertApproval({
      id: approvalId,
      tenantId,
      schemaVersion: "pack-approval-v1",
      versionId,
      targetKind: "variant",
      targetId: "variant_1",
      approvingActorId: teacherId,
      artifactHash: hash("b"),
      validationResultHash: hash("c"),
      acknowledgedFindingCodes: ["HINT_TONE_SOFT"],
      createdAt: versionRecord.createdAt,
    });

    await expect(
      packs().insertApproval({
        id: `approval_dup_${runId}`,
        tenantId,
        schemaVersion: "pack-approval-v1",
        versionId,
        targetKind: "variant",
        targetId: "variant_1",
        approvingActorId: teacherId,
        artifactHash: hash("b"),
        validationResultHash: hash("c"),
        acknowledgedFindingCodes: [],
        createdAt: versionRecord.createdAt,
      })
    ).rejects.toBeInstanceOf(PackUniqueViolationError);
    await expect(
      packs().readApproval(tenantId, versionId, "variant", "variant_1")
    ).resolves.toMatchObject({
      id: approvalId,
      acknowledgedFindingCodes: ["HINT_TONE_SOFT"],
    });

    const publicationId = `publication_${runId}`;
    await packs().insertPublication({
      id: publicationId,
      tenantId,
      schemaVersion: "pack-publication-v1",
      versionId,
      approvingActorId: teacherId,
      artifactHash: hash("b"),
      validationResultHash: hash("c"),
      contentHash: hash("d"),
      privateAnswerDigest: hash("e"),
      ruleVersions: { validatorVersion: "lesson-validator-v2" },
      approvedAt: versionRecord.createdAt,
      createdAt: versionRecord.createdAt,
    });

    await expect(
      packs().insertPublication({
        id: `publication_dup_${runId}`,
        tenantId,
        schemaVersion: "pack-publication-v1",
        versionId,
        approvingActorId: teacherId,
        artifactHash: hash("b"),
        validationResultHash: hash("c"),
        contentHash: hash("d"),
        privateAnswerDigest: hash("e"),
        ruleVersions: {},
        approvedAt: versionRecord.createdAt,
        createdAt: versionRecord.createdAt,
      })
    ).rejects.toBeInstanceOf(PackUniqueViolationError);

    const assignmentId = `assignment_${runId}`;
    await packs().insertAssignment({
      id: assignmentId,
      tenantId,
      schemaVersion: "pack-assignment-v1",
      publicationId,
      learnerId,
      assigningActorId: teacherId,
      createdAt: versionRecord.createdAt,
    });

    await expect(
      packs().insertAssignment({
        id: `assignment_dup_${runId}`,
        tenantId,
        schemaVersion: "pack-assignment-v1",
        publicationId,
        learnerId,
        assigningActorId: teacherId,
        createdAt: versionRecord.createdAt,
      })
    ).rejects.toBeInstanceOf(PackUniqueViolationError);

    await packs().insertReceipt({
      id: `receipt_${runId}`,
      tenantId,
      schemaVersion: "pack-receipt-v1",
      actorId: teacherId,
      membershipId,
      authorizationRevision: 1,
      action: "publish",
      operationKey: "publish-key-0001",
      inputHash: hash("f"),
      resultKind: "pack-publication",
      resultIds: [publicationId, assignmentId],
      createdAt: versionRecord.createdAt,
    });

    await expect(
      packs().insertReceipt({
        id: `receipt_dup_${runId}`,
        tenantId,
        schemaVersion: "pack-receipt-v1",
        actorId: teacherId,
        membershipId,
        authorizationRevision: 1,
        action: "publish",
        operationKey: "publish-key-0001",
        inputHash: hash("f"),
        resultKind: "pack-publication",
        resultIds: [publicationId, assignmentId],
        createdAt: versionRecord.createdAt,
      })
    ).rejects.toBeInstanceOf(PackUniqueViolationError);
  });

  it("lists and resolves the tenant's active learners", async () => {
    await expect(packs().listLearners(tenantId)).resolves.toContainEqual({
      id: learnerId,
      displayName: "Pack Learner",
    });
    await expect(
      packs().readLearner(tenantId, learnerId)
    ).resolves.toStrictEqual({
      id: learnerId,
      displayName: "Pack Learner",
    });
    await expect(
      packs().readLearner(otherTenantId, learnerId)
    ).resolves.toBeUndefined();
  });

  it("reports the schema is present", async () => {
    await expect(packs().check()).resolves.toBeTruthy();
  });
});
