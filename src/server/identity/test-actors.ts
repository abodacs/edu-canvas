import {
  parseActorId,
  parseClassId,
  parseLearnerId,
  parseMembershipId,
  parseTenantId,
} from "./identifiers";

import type { LearnerActor, TeacherActor } from "./types";

/**
 * Test-support actors mirror the synthetic identity fixture so tests can stand
 * in for a resolved session without provisioning the whole composition. They
 * live outside the production import graph; nothing in `src` imports them.
 */
const defaultTeacherActor: TeacherActor = {
  actorId: parseActorId("actor_teacher_amira"),
  displayName: "Amira Haddad",
  tenantId: parseTenantId("tenant_school_north"),
  tenantName: "Grade 4A · Equivalent Fractions",
  membershipId: parseMembershipId("membership_amira_north"),
  sessionId: "session_test_0001",
  sessionGeneration: "gen_test",
  authorizationRevision: 1,
  role: "teacher",
  rosterClassIds: [parseClassId("class_north_4a")],
};

const defaultLearnerActor: LearnerActor = {
  actorId: parseActorId("actor_learner_lina"),
  displayName: "Lina Farouk",
  tenantId: parseTenantId("tenant_school_north"),
  tenantName: "Grade 4A · Equivalent Fractions",
  membershipId: parseMembershipId("membership_lina_north"),
  sessionId: "session_test_0002",
  sessionGeneration: "gen_test",
  authorizationRevision: 1,
  role: "student",
  learnerId: parseLearnerId("learner_lina"),
};

export const syntheticTeacherActor = (
  overrides: Partial<TeacherActor> = {}
): TeacherActor => ({ ...defaultTeacherActor, ...overrides });

export const syntheticLearnerActor = (
  overrides: Partial<LearnerActor> = {}
): LearnerActor => ({ ...defaultLearnerActor, ...overrides });
