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
  {
    email: "maya.demo@example.test",
    password: syntheticPassword,
    subject: "subject_learner_maya",
    emailVerified: true,
  },
  {
    email: "samir.demo@example.test",
    password: syntheticPassword,
    subject: "subject_learner_samir",
    emailVerified: true,
  },
  {
    email: "noor.demo@example.test",
    password: syntheticPassword,
    subject: "subject_learner_noor",
    emailVerified: true,
  },
];

export const syntheticPasswordForTests = syntheticPassword;

const principal = "synthetic-fixture";

const fixture = {
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
    { id: "actor_teacher_amira", displayName: "Emily Carter" },
    { id: "actor_teacher_bilal", displayName: "Michael Brooks" },
    { id: "actor_learner_lina", displayName: "Lily Parker" },
    { id: "actor_learner_yusuf", displayName: "Jacob Reed" },
    { id: "actor_learner_omar", displayName: "Ethan Cole" },
    { id: "actor_learner_maya", displayName: "Ava Turner" },
    { id: "actor_learner_samir", displayName: "Noah Bennett" },
    { id: "actor_learner_noor", displayName: "Grace Hall" },
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
        displayName: "Lily Parker",
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
        displayName: "Jacob Reed",
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
        displayName: "Ethan Cole",
        demoHandle: "omar.demo",
      },
    },
    {
      membershipId: "membership_maya_demo",
      actorId: "actor_learner_maya",
      tenantKey: "demo" as const,
      role: "student" as const,
      learner: {
        id: "learner_maya",
        displayName: "Ava Turner",
        demoHandle: "maya.demo",
      },
    },
    {
      membershipId: "membership_samir_demo",
      actorId: "actor_learner_samir",
      tenantKey: "demo" as const,
      role: "student" as const,
      learner: {
        id: "learner_samir",
        displayName: "Noah Bennett",
        demoHandle: "samir.demo",
      },
    },
    {
      membershipId: "membership_noor_demo",
      actorId: "actor_learner_noor",
      tenantKey: "demo" as const,
      role: "student" as const,
      learner: {
        id: "learner_noor",
        displayName: "Grace Hall",
        demoHandle: "noor.demo",
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

export const ensureSyntheticIdentityFixture = async (
  persistence: IdentityPersistence
): Promise<void> => {
  const provisioning = createIdentityProvisioning({ persistence });

  for (const [index, account] of syntheticAccounts.entries()) {
    const actor = fixture.actors[index];
    if (actor === undefined) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop -- sequential provisioning is the fix: concurrent grants race on the shared tenant row.
    await provisioning.bindIdentity({
      providerIssuer: syntheticProviderIssuer,
      providerSubject: account.subject,
      actorId: parseActorId(actor.id),
      displayName: actor.displayName,
      principal,
      requestId: `fixture-bind-${actor.id}`,
    });
  }

  for (const membership of fixture.memberships) {
    const tenant = tenantFor(membership.tenantKey);
    // eslint-disable-next-line no-await-in-loop -- sequential provisioning is the fix: concurrent grants race on the shared tenant row.
    await provisioning.grantMembership({
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
  }

  for (const assignment of fixture.classAssignments) {
    const tenant = fixture.tenants.north;
    // eslint-disable-next-line no-await-in-loop -- sequential provisioning is the fix: concurrent grants race on the shared tenant row.
    await provisioning.assignClass({
      membershipId: parseMembershipId(assignment.membershipId),
      classId: parseClassId(assignment.classId),
      tenantId: parseTenantId(tenant.id),
      principal,
      requestId: `fixture-class-${assignment.membershipId}-${assignment.classId}`,
    });
  }
};
