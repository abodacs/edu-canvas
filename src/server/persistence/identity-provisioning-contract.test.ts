import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import {
  parseActorId,
  parseLearnerId,
  parseMembershipId,
  parseTenantId,
} from "../identity/identifiers";
import { createPostgresIdentityPersistence } from "./identity-postgres";
import {
  isRunDatabaseTests,
  requireDatabaseUrl,
  withTenantSql,
} from "./database-test-support";

const runId = randomUUID();

interface ProvisionedTenantRow {
  id: string;
  slug: string;
  name: string;
  synthetic_data_only: boolean;
}

interface ProvisionedIdentityRow {
  id: string;
  tenant_id: string;
  role: string;
  display_name: string;
  demo_handle: string;
  is_active: boolean;
}

const readTenantRow = (
  rowTenantId: string
): Promise<ProvisionedTenantRow | undefined> => {
  return withTenantSql(rowTenantId, async (transaction) => {
    const rows = await transaction<ProvisionedTenantRow[]>`
      select id, slug, name, synthetic_data_only
      from tenants
      where id = ${rowTenantId}
    `;
    return rows[0];
  });
};

describe.skipIf(!isRunDatabaseTests)(
  "identity persistence provisioning",
  () => {
    const tenantId = parseTenantId(`tenant_issue_115_${runId}`);
    const actorId = parseActorId(`actor_issue_115_${runId}`);
    const membershipId = parseMembershipId(`membership_issue_115_${runId}`);
    const tenantName = "Issue 115 regression school";
    const renamedTenantName = "Issue 115 regression school (renamed)";

    const realTenantId = parseTenantId(`tenant_issue_115_real_${runId}`);
    const realActorId = parseActorId(`actor_issue_115_real_${runId}`);
    const realMembershipId = parseMembershipId(
      `membership_issue_115_real_${runId}`
    );

    const learnerTenantId = parseTenantId(`tenant_issue_115_learner_${runId}`);
    const learnerActorId = parseActorId(`actor_issue_115_learner_${runId}`);
    const learnerMembershipId = parseMembershipId(
      `membership_issue_115_learner_${runId}`
    );
    const learnerId = parseLearnerId(`learner_issue_115_${runId}`);
    const learnerTenantName = "Issue 115 learner school";

    const countActorMemberships = (): Promise<number> => {
      return withTenantSql(tenantId, async (transaction) => {
        const rows = await transaction<{ count: string }[]>`
          select count(*) as count
          from memberships
          where actor_id = ${actorId} and tenant_id = ${tenantId}
        `;
        return Number(rows[0]?.count ?? 0);
      });
    };

    const readProvisionedLearnerIdentity = (): Promise<
      ProvisionedIdentityRow | undefined
    > => {
      return withTenantSql(learnerTenantId, async (transaction) => {
        const rows = await transaction<ProvisionedIdentityRow[]>`
          select id, tenant_id, role, display_name, demo_handle, is_active
          from identities
          where id = ${learnerId}
        `;
        return rows[0];
      });
    };

    const countLearnerIdentityRows = (): Promise<number> => {
      return withTenantSql(learnerTenantId, async (transaction) => {
        const rows = await transaction<{ count: string }[]>`
          select count(*) as count
          from identities
          where id = ${learnerId}
        `;
        return Number(rows[0]?.count ?? 0);
      });
    };

    const countLearnerMemberships = (): Promise<number> => {
      return withTenantSql(learnerTenantId, async (transaction) => {
        const rows = await transaction<{ count: string }[]>`
          select count(*) as count
          from memberships
          where actor_id = ${learnerActorId}
            and tenant_id = ${learnerTenantId}
        `;
        return Number(rows[0]?.count ?? 0);
      });
    };

    afterAll(async () => {
      await withTenantSql(tenantId, async (transaction) => {
        await transaction`
          delete from memberships where actor_id = ${actorId}
        `;
        await transaction`
          delete from actors where id = ${actorId}
        `;
        await transaction`
          delete from tenants where id = ${tenantId}
        `;
      });
      await withTenantSql(realTenantId, async (transaction) => {
        await transaction`
          delete from memberships where actor_id = ${realActorId}
        `;
        await transaction`
          delete from actors where id = ${realActorId}
        `;
        await transaction`
          delete from tenants where id = ${realTenantId}
        `;
      });
      await withTenantSql(learnerTenantId, async (transaction) => {
        await transaction`
          delete from memberships where actor_id = ${learnerActorId}
        `;
        await transaction`
          delete from identities where id = ${learnerId}
        `;
        await transaction`
          delete from actors where id = ${learnerActorId}
        `;
        await transaction`
          delete from tenants where id = ${learnerTenantId}
        `;
      });
    });

    it("creates the missing membership tenant before granting", async () => {
      const persistence =
        createPostgresIdentityPersistence(requireDatabaseUrl());

      await persistence.createActor({
        actorId,
        displayName: "Issue 115 regression teacher",
      });

      // No tenants row exists for tenantId: the fresh-database shape from
      // issue #115 where deterministic sign-in failed with a 503.
      await expect(
        persistence.grantMembership({
          membershipId,
          actorId,
          tenantId,
          tenantName,
          role: "teacher",
        })
      ).resolves.toMatchObject({
        membershipId,
        actorId,
        tenantId,
        role: "teacher",
        status: "active",
      });

      await expect(persistence.readTenantName(tenantId)).resolves.toBe(
        tenantName
      );

      await expect(readTenantRow(tenantId)).resolves.toMatchObject({
        id: tenantId,
        slug: tenantId,
        name: tenantName,
        synthetic_data_only: true,
      });
    });

    it("replays the same grant idempotently and keeps the existing tenant row", async () => {
      const persistence =
        createPostgresIdentityPersistence(requireDatabaseUrl());

      await expect(
        persistence.grantMembership({
          membershipId,
          actorId,
          tenantId,
          tenantName: renamedTenantName,
          role: "teacher",
        })
      ).resolves.toMatchObject({ membershipId, status: "active" });

      await expect(countActorMemberships()).resolves.toBe(1);
      // The grant must stay insert-if-missing: replaying a fixture boot may
      // not rename or rebrand a tenant row that already exists.
      await expect(persistence.readTenantName(tenantId)).resolves.toBe(
        tenantName
      );
    });

    it("leaves an existing non-synthetic tenant row untouched when granting", async () => {
      const persistence =
        createPostgresIdentityPersistence(requireDatabaseUrl());

      // A tenant that was provisioned outside the synthetic fixture must not
      // be renamed or marked synthetic by a membership grant.
      await withTenantSql(realTenantId, async (transaction) => {
        await transaction`
          insert into tenants (id, slug, name, synthetic_data_only)
          values (
            ${realTenantId},
            'real-district-school',
            ${"Really Real District School"},
            false
          )
        `;
      });

      await persistence.createActor({
        actorId: realActorId,
        displayName: "Issue 115 real district teacher",
      });

      await expect(
        persistence.grantMembership({
          membershipId: realMembershipId,
          actorId: realActorId,
          tenantId: realTenantId,
          tenantName: renamedTenantName,
          role: "teacher",
        })
      ).resolves.toMatchObject({
        membershipId: realMembershipId,
        status: "active",
      });

      await expect(readTenantRow(realTenantId)).resolves.toMatchObject({
        id: realTenantId,
        slug: "real-district-school",
        name: "Really Real District School",
        synthetic_data_only: false,
      });
    });

    it("creates the missing learner identity before granting", async () => {
      const persistence =
        createPostgresIdentityPersistence(requireDatabaseUrl());

      await persistence.createActor({
        actorId: learnerActorId,
        displayName: "Issue 115 regression learner",
      });

      // Neither a tenants row nor an identities row exists: the
      // fresh-database shape for learner memberships from issue #115.
      await expect(
        persistence.grantMembership({
          membershipId: learnerMembershipId,
          actorId: learnerActorId,
          tenantId: learnerTenantId,
          tenantName: learnerTenantName,
          role: "student",
          learner: {
            id: learnerId,
            displayName: "Lina Farouk",
            demoHandle: "lina.demo",
          },
        })
      ).resolves.toMatchObject({
        membershipId: learnerMembershipId,
        status: "active",
      });

      // The materialized identity carries the real roster fields, never a
      // raw machine id a teacher-facing surface would render.
      await expect(readProvisionedLearnerIdentity()).resolves.toMatchObject({
        id: learnerId,
        tenant_id: learnerTenantId,
        role: "student",
        display_name: "Lina Farouk",
        demo_handle: "lina.demo",
        is_active: true,
      });
    });

    it("replays the learner grant idempotently", async () => {
      const persistence =
        createPostgresIdentityPersistence(requireDatabaseUrl());

      await expect(
        persistence.grantMembership({
          membershipId: learnerMembershipId,
          actorId: learnerActorId,
          tenantId: learnerTenantId,
          tenantName: learnerTenantName,
          role: "student",
          learner: {
            id: learnerId,
            displayName: "Lina Farouk",
            demoHandle: "lina.demo",
          },
        })
      ).resolves.toMatchObject({
        membershipId: learnerMembershipId,
        status: "active",
      });

      await expect(countLearnerIdentityRows()).resolves.toBe(1);
      await expect(countLearnerMemberships()).resolves.toBe(1);
    });
  }
);
