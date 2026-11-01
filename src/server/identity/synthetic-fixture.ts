import {
  parseActorId,
  parseClassId,
  parseLearnerId,
  parseMembershipId,
  parseTenantId,
} from "./identifiers";

import { createIdentityProvisioning } from "./provisioning";

import type { IdentityPersistence } from "./persistence-port";
import type { DeterministicAccount } from "./provider/deterministic";

/**
 * Synthetic identity fixture for explicit local development and tests. Two
 * classes plus the curriculum-owning synthetic class, two teachers in one
 * class, two class assignments, and three learners, per the spec's fixture
 * requirement (the classroom membership the focused generation gate signs in
 * through was added for issue #115; the demo-tenant learner was added for
 * issue #5 so a published pack has a real assignment referent). It is invoked
 * only by the development
 * composition and by tests; it can never supply authority to a deployed
 * request because the deterministic provider is unreachable outside
 * development (config forces the hosted provider elsewhere).
 */
export const syntheticProviderIssuer = "deterministic-local";

const syntheticPassword = "synthetic-pass-1";

export const syntheticAccounts: readonly DeterministicAccount[] = [
  {
    email: "amira.north@example.test",
    password: syntheticPassword,
    subject: "subject_teacher_amira",
    emailVerified: true,
  },
  {
    email: "bilal.north@example.test",
    password: syntheticPassword,
    subject: "subject_teacher_bilal",
    emailVerified: true,
  },
  {
    email: "lina.north@example.test",
    password: syntheticPassword,
    subject: "subject_learner_lina",
    emailVerified: true,
  },
  {
    email: "yusuf.north@example.test",
    password: syntheticPassword,
    subject: "subject_learner_yusuf",
    emailVerified: true,
  },
  {
    email: "omar.demo@example.test",
    password: syntheticPassword,
    subject: "subject_learner_omar",
    emailVerified: true,
  },
];

export const syntheticPasswordForTests = syntheticPassword;

const principal = "synthetic-fixture";

const fixture = {
  // One tenant row carries one class until #99 lands a real class object, so
  // the fixture names read as classes, not schools.
  tenants: {
    north: {
      id: "tenant_school_north",
      name: "Grade 4A · Equivalent Fractions",
    },
    south: { id: "tenant_school_south", name: "Grade 5B · Ratio Reasoning" },
    demo: {
      id: "tenant_demo_eu_synthetic",
      name: "Grade 4S · Synthetic Fractions",
    },
  },
  actors: [
    { id: "actor_teacher_amira", displayName: "Amira Haddad" },
    { id: "actor_teacher_bilal", displayName: "Bilal Nasser" },
    { id: "actor_learner_lina", displayName: "Lina Farouk" },
    { id: "actor_learner_yusuf", displayName: "Yusuf Karim" },
    { id: "actor_learner_omar", displayName: "Omar Nabil" },
  ],
  memberships: [
    {
      membershipId: "membership_amira_demo",
      actorId: "actor_teacher_amira",
      tenantKey: "demo" as const,
      role: "teacher" as const,
    },
    {
      membershipId: "membership_bilal_demo",
      actorId: "actor_teacher_bilal",
      tenantKey: "demo" as const,
      role: "teacher" as const,
    },
    {
      membershipId: "membership_amira_north",
      actorId: "actor_teacher_amira",
      tenantKey: "north" as const,
      role: "teacher" as const,
    },
    {
      membershipId: "membership_amira_south",
      actorId: "actor_teacher_amira",
      tenantKey: "south" as const,
      role: "teacher" as const,
    },
    {
      membershipId: "membership_bilal_north",
      actorId: "actor_teacher_bilal",
      tenantKey: "north" as const,
      role: "teacher" as const,
    },
    {
      membershipId: "membership_lina_north",
      actorId: "actor_learner_lina",
      tenantKey: "north" as const,
      role: "student" as const,
      learner: {
        id: "learner_lina",
        displayName: "Lina Farouk",
        demoHandle: "lina.demo",
      },
    },
    {
      membershipId: "membership_yusuf_north",
      actorId: "actor_learner_yusuf",
      tenantKey: "north" as const,
      role: "student" as const,
      learner: {
        id: "learner_yusuf",
        displayName: "Yusuf Karim",
        demoHandle: "yusuf.demo",
      },
    },
    {
      membershipId: "membership_omar_demo",
      actorId: "actor_learner_omar",
      tenantKey: "demo" as const,
      role: "student" as const,
      learner: {
        id: "learner_omar",
        displayName: "Omar Nabil",
        demoHandle: "omar.demo",
      },
    },
  ],
  classAssignments: [
    { membershipId: "membership_amira_north", classId: "class_north_4a" },
    { membershipId: "membership_bilal_north", classId: "class_north_4a" },
  ],
} as const;

const tenantFor = (key: keyof typeof fixture.tenants) => fixture.tenants[key];

export interface SyntheticLearner {
  readonly id: string;
  readonly displayName: string;
  readonly tenantId: string;
}

/**
The learner directory the seeded pack store assigns against. Derived from the same fixture so a membership and an assignment referent cannot drift.
*/
export const syntheticLearnerDirectory: readonly SyntheticLearner[] = (() => {
  const learners: SyntheticLearner[] = [];
  for (const membership of fixture.memberships) {
    if (membership.role === "student" && "learner" in membership) {
      learners.push({
        id: membership.learner.id,
        displayName: membership.learner.displayName,
        tenantId: tenantFor(membership.tenantKey).id,
      });
    }
  }
  return learners;
})();

/**
 * Idempotent: provisioning operations are safe to replay. Running the fixture twice leaves one actor, membership, and binding per entry.
 */
export const ensureSyntheticIdentityFixture = async (
  persistence: IdentityPersistence
): Promise<void> => {
  const provisioning = createIdentityProvisioning({ persistence });

  await Promise.all(
    syntheticAccounts.map((account, index) => {
      const actor = fixture.actors[index];
      if (!actor) {
        return Promise.resolve();
      }
      return provisioning.bindIdentity({
        providerIssuer: syntheticProviderIssuer,
        providerSubject: account.subject,
        actorId: parseActorId(actor.id),
        displayName: actor.displayName,
        principal,
        requestId: `fixture-bind-${actor.id}`,
      });
    })
  );

  await Promise.all(
    fixture.memberships.map((membership) => {
      const tenant = tenantFor(membership.tenantKey);
      return provisioning.grantMembership({
        membershipId: parseMembershipId(membership.membershipId),
        actorId: parseActorId(membership.actorId),
        tenantId: parseTenantId(tenant.id),
        tenantName: tenant.name,
        role: membership.role,
        ...("learner" in membership && {
          learner: {
            ...membership.learner,
            id: parseLearnerId(membership.learner.id),
          },
        }),
        principal,
        requestId: `fixture-membership-${membership.membershipId}`,
      });
    })
  );

  await Promise.all(
    fixture.classAssignments.map((assignment) => {
      const tenant = fixture.tenants.north;
      return provisioning.assignClass({
        membershipId: parseMembershipId(assignment.membershipId),
        classId: parseClassId(assignment.classId),
        tenantId: parseTenantId(tenant.id),
        principal,
        requestId: `fixture-class-${assignment.membershipId}-${assignment.classId}`,
      });
    })
  );
};
