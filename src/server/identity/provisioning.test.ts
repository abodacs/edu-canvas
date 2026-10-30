import { describe, expect, it } from "vitest";

import {
  createSeededIdentityPersistence,
  createSeededIdentityStore,
} from "../persistence/identity-seeded";
import { parseActorId, parseMembershipId, parseTenantId } from "./identifiers";
import { createIdentityProvisioning } from "./provisioning";
import { ensureSyntheticIdentityFixture } from "./synthetic-fixture";
import type { IdentityError } from "./errors";

import type { IdentityProvisioning } from "./provisioning";
import type { IdentityPersistence } from "./persistence-port";

const principal = { principal: "operator", requestId: "req-1" };

const createProvisioning = async (): Promise<{
  provisioning: IdentityProvisioning;
  persistence: IdentityPersistence;
}> => {
  const persistence = createSeededIdentityPersistence({
    store: createSeededIdentityStore(),
  });
  await ensureSyntheticIdentityFixture(persistence);
  return {
    provisioning: createIdentityProvisioning({ persistence }),
    persistence,
  };
};

describe("trusted provisioning", () => {
  it("binds an identity idempotently and audits each operation", async () => {
    const { provisioning, persistence } = await createProvisioning();

    const first = await provisioning.bindIdentity({
      providerIssuer: "deterministic-local",
      providerSubject: "subject_teacher_amira",
      actorId: parseActorId("actor_teacher_amira"),
      displayName: "Amira Haddad",
      ...principal,
    });

    expect(first.idempotent).toBeTruthy();

    const created = await provisioning.bindIdentity({
      providerIssuer: "deterministic-local",
      providerSubject: "subject_teacher_new",
      actorId: parseActorId("actor_teacher_new"),
      displayName: "New Teacher",
      ...principal,
    });

    expect(created.idempotent).toBeFalsy();

    const binding = await persistence.findProviderBinding(
      "deterministic-local",
      "subject_teacher_new"
    );

    expect(binding?.actorId).toBe("actor_teacher_new");
  });

  it("rejects a conflicting rebinding and leaves the original binding intact", async () => {
    const { provisioning, persistence } = await createProvisioning();

    await expect(
      provisioning.bindIdentity({
        providerIssuer: "deterministic-local",
        providerSubject: "subject_teacher_amira",
        actorId: parseActorId("actor_teacher_impostor"),
        displayName: "Impostor",
        ...principal,
      })
    ).rejects.toMatchObject({
      code: "CONFLICT" satisfies IdentityError["code"],
    });

    const binding = await persistence.findProviderBinding(
      "deterministic-local",
      "subject_teacher_amira"
    );

    expect(binding?.actorId).toBe("actor_teacher_amira");
  });

  it("assigns, revokes, and disables through the trusted seam", async () => {
    const { provisioning, persistence } = await createProvisioning();

    await provisioning.assignClass({
      membershipId: parseMembershipId("membership_bilal_north"),
      classId: "class_north_5b" as never,
      tenantId: parseTenantId("tenant_school_north"),
      ...principal,
    });

    const roster = await persistence.listRosterClassIds(
      parseMembershipId("membership_bilal_north")
    );

    expect(roster).toContain("class_north_5b");

    const revoked = await provisioning.revokeMembership({
      membershipId: parseMembershipId("membership_amira_south"),
      ...principal,
    });

    expect(revoked.idempotent).toBeFalsy();

    const revokedMembership = await persistence.readMembership(
      parseMembershipId("membership_amira_south")
    );

    expect(revokedMembership?.status).toBe("revoked");

    const disabled = await provisioning.disableActor({
      actorId: parseActorId("actor_learner_lina"),
      ...principal,
    });

    expect(disabled.idempotent).toBeFalsy();

    const actor = await persistence.readActor(
      parseActorId("actor_learner_lina")
    );

    expect(actor?.isActive).toBeFalsy();
  });
});
