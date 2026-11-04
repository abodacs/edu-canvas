import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresStandardGroundingPersistence } from "./standard-grounding-postgres";
import {
  isRunDatabaseTests,
  requireDatabaseUrl,
  withTenantSql,
} from "./database-test-support";

import type { StandardGroundingRecord } from "../grounding/standards/types";
import type { StandardGroundingPersistence } from "./standard-grounding-port";

const runId = randomUUID();
const timestamp = "2026-11-04T12:00:00.000Z";

interface TenantFixture {
  tenantId: string;
}

const fixtures: { primary?: TenantFixture; other?: TenantFixture } = {};

const createTenantFixture = async (suffix: string): Promise<TenantFixture> => {
  const tenantId = `tenant_issue_218_${suffix}_${runId}`;
  await withTenantSql(tenantId, async (transaction) => {
    await transaction`
      insert into tenants (id, slug, name, synthetic_data_only)
      values (${tenantId}, ${tenantId}, ${"Issue 218 grounding fixture"}, true)
    `;
  });
  return { tenantId };
};

const deleteTenantFixture = async (fixture: TenantFixture): Promise<void> => {
  await withTenantSql(fixture.tenantId, async (transaction) => {
    await transaction`
      alter table standard_groundings
      disable trigger standard_groundings_are_immutable
    `;
    await transaction`
      delete from standard_groundings where tenant_id = ${fixture.tenantId}
    `;
    await transaction`
      alter table standard_groundings
      enable trigger standard_groundings_are_immutable
    `;
    await transaction`delete from tenants where id = ${fixture.tenantId}`;
  });
};

const buildRecord = (
  fixture: TenantFixture,
  overrides: Partial<StandardGroundingRecord> = {}
): StandardGroundingRecord => {
  return {
    id: `grounding_issue_218_${runId}`,
    tenantId: fixture.tenantId,
    requestKey: `request_issue_218_${runId}`,
    inputHash: "a".repeat(64),
    registryVersion: "pilot-registry-v1",
    frameworkId: "ccss-math",
    jurisdiction: "Multi-State",
    statementCode: "4.NF.A.1",
    subject: "Mathematics",
    grade: 4,
    standardId: "6b9c09e2-d7cc-11e8-824f-0242ac160002",
    description: "Explain why a fraction a/b is equivalent to a fraction.",
    descriptionHash: "b".repeat(64),
    components: [{ id: "component-1", text: "Generate equivalent fractions." }],
    prerequisites: [
      {
        statementCode: "3.NF.A.3",
        jurisdiction: "Multi-State",
        matchType: "exact",
        alignmentScore: 1,
      },
    ],
    prerequisiteResolution: "direct",
    gaps: [],
    provenance: {
      license: "CC BY 4.0",
      attribution: "Learning Commons Knowledge Graph",
      sourceLink: "https://www.learningcommons.org/",
      retrievedAt: timestamp,
    },
    contentHash: "c".repeat(64),
    retrievalAttempt: 1,
    retrievedAt: timestamp,
    predecessorGroundingId: null,
    createdAt: timestamp,
    ...overrides,
  };
};

describe.skipIf(!isRunDatabaseTests)(
  "standard grounding persistence (issue 218)",
  () => {
    let persistence: StandardGroundingPersistence;

    beforeAll(async () => {
      persistence =
        createPostgresStandardGroundingPersistence(requireDatabaseUrl());
      fixtures.primary = await createTenantFixture("primary");
      fixtures.other = await createTenantFixture("other");
    });

    afterAll(async () => {
      if (fixtures.primary) {
        await deleteTenantFixture(fixtures.primary);
      }
      if (fixtures.other) {
        await deleteTenantFixture(fixtures.other);
      }
    });

    it("round-trips an immutable grounding across a new connection", async () => {
      const fixture = fixtures.primary;
      if (!fixture) {
        throw new Error("Fixture missing.");
      }
      const record = buildRecord(fixture);
      await persistence.insert(record);

      const reopened =
        createPostgresStandardGroundingPersistence(requireDatabaseUrl());
      await expect(
        reopened.read(fixture.tenantId, record.id)
      ).resolves.toStrictEqual(record);
    });

    it("keeps tenant scope on direct reads and history", async () => {
      const { primary, other } = fixtures;
      if (!primary || !other) {
        throw new Error("Fixture missing.");
      }

      await expect(
        persistence.read(other.tenantId, `grounding_issue_218_${runId}`)
      ).resolves.toBeUndefined();
      await expect(
        persistence.history(other.tenantId, {
          jurisdiction: "Multi-State",
          statementCode: "4.NF.A.1",
        })
      ).resolves.toStrictEqual([]);
    });

    it("links an appended re-retrieval and orders history newest first", async () => {
      const fixture = fixtures.primary;
      if (!fixture) {
        throw new Error("Fixture missing.");
      }
      const first = buildRecord(fixture);
      const second = buildRecord(fixture, {
        id: `grounding_issue_218_second_${runId}`,
        requestKey: `request_issue_218_second_${runId}`,
        contentHash: "d".repeat(64),
        predecessorGroundingId: first.id,
        createdAt: "2026-11-04T12:00:01.000Z",
        retrievedAt: "2026-11-04T12:00:01.000Z",
      });
      await persistence.insert(second);

      const stored = await persistence.read(fixture.tenantId, second.id);
      expect(stored?.predecessorGroundingId).toBe(first.id);

      const history = await persistence.history(fixture.tenantId, {
        jurisdiction: "Multi-State",
        statementCode: "4.NF.A.1",
      });
      const [latest] = history;
      expect(latest?.id).toBe(second.id);
      expect(history.map((record) => record.id)).toContain(first.id);
    });

    it("rejects a duplicate id or request key as a unique violation", async () => {
      const fixture = fixtures.primary;
      if (!fixture) {
        throw new Error("Fixture missing.");
      }
      const record = buildRecord(fixture, {
        id: `grounding_issue_218_duplicate_${runId}`,
        requestKey: `request_issue_218_duplicate_${runId}`,
      });
      await persistence.insert(record);

      await expect(persistence.insert(record)).rejects.toMatchObject({
        name: "StandardGroundingUniqueViolationError",
      });
      await expect(
        persistence.insert(
          buildRecord(fixture, {
            id: `grounding_issue_218_duplicate_key_${runId}`,
          })
        )
      ).rejects.toMatchObject({
        name: "StandardGroundingUniqueViolationError",
      });
    });

    it("refuses update and delete so superseded rows stay readable", async () => {
      const fixture = fixtures.primary;
      if (!fixture) {
        throw new Error("Fixture missing.");
      }
      const record = buildRecord(fixture, {
        id: `grounding_issue_218_immutable_${runId}`,
        requestKey: `request_issue_218_immutable_${runId}`,
      });
      await persistence.insert(record);

      await expect(
        withTenantSql(fixture.tenantId, async (transaction) => {
          await transaction`
            update standard_groundings
            set statement_code = ${"4.NF.A.2"}
            where tenant_id = ${fixture.tenantId} and id = ${record.id}
          `;
        })
      ).rejects.toThrow(/Immutable foundation rows cannot be changed/u);

      await expect(
        withTenantSql(fixture.tenantId, async (transaction) => {
          await transaction`
            delete from standard_groundings
            where tenant_id = ${fixture.tenantId} and id = ${record.id}
          `;
        })
      ).rejects.toThrow(/Immutable foundation rows cannot be changed/u);
    });
  }
);
