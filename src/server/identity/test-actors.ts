import {
  parseActorId,
  parseClassId,
  parseLearnerId,
  parseMembershipId,
  parseTenantId,
} from "./identifiers";

import type { LearnerActor, TeacherActor } from "./types";

const defaultTeacherActor: TeacherActor = {
  actorId: parseActorId("actor_teacher_amira"),
  displayName: "Emily Carter",
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
  displayName: "Lily Parker",
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
