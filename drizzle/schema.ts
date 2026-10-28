import {
  pgTable,
  text,
  timestamp,
  unique,
  pgPolicy,
  boolean,
  index,
  foreignKey,
  check,
  integer,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const tenants = pgTable(
  "tenants",
  {
    id: text().primaryKey().notNull(),
    slug: text().notNull(),
    name: text().notNull(),
    syntheticDataOnly: boolean("synthetic_data_only").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return [
      unique("tenants_slug_key").on(table.slug),
      pgPolicy("tenants_are_tenant_scoped", {
        as: "permissive",
        for: "all",
        to: ["public"],
        using: sql`(id = current_setting('app.tenant_id'::text, true))`,
      }),
    ];
  }
).enableRLS();

export const identities = pgTable(
  "identities",
  {
    id: text().primaryKey().notNull(),
    tenantId: text("tenant_id").notNull(),
    role: text().notNull(),
    displayName: text("display_name").notNull(),
    demoHandle: text("demo_handle").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return [
      index("identities_tenant_idx").using(
        "btree",
        table.tenantId.asc().nullsLast()
      ),
      foreignKey({
        columns: [table.tenantId],
        foreignColumns: [tenants.id],
        name: "identities_tenant_id_fkey",
      }),
      unique("identities_tenant_id_id_key").on(table.tenantId, table.id),
      unique("identities_demo_handle_key").on(table.demoHandle),
      pgPolicy("identities_are_tenant_scoped", {
        as: "permissive",
        for: "all",
        to: ["public"],
        using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
      }),
      check(
        "identities_role_check",
        sql`role = ANY (ARRAY['teacher'::text, 'student'::text])`
      ),
    ];
  }
).enableRLS();

export const standards = pgTable(
  "standards",
  {
    id: text().primaryKey().notNull(),
    tenantId: text("tenant_id").notNull(),
    code: text().notNull(),
    name: text().notNull(),
    subject: text().notNull(),
    gradeBand: text("grade_band").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return [
      index("standards_tenant_idx").using(
        "btree",
        table.tenantId.asc().nullsLast()
      ),
      foreignKey({
        columns: [table.tenantId],
        foreignColumns: [tenants.id],
        name: "standards_tenant_id_fkey",
      }),
      unique("standards_tenant_id_id_key").on(table.tenantId, table.id),
      unique("standards_tenant_id_code_key").on(table.tenantId, table.code),
      pgPolicy("standards_are_tenant_scoped", {
        as: "permissive",
        for: "all",
        to: ["public"],
        using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
      }),
    ];
  }
).enableRLS();

export const prerequisiteNodes = pgTable(
  "prerequisite_nodes",
  {
    id: text().primaryKey().notNull(),
    tenantId: text("tenant_id").notNull(),
    standardId: text("standard_id").notNull(),
    label: text().notNull(),
    sequence: integer().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return [
      index("graph_nodes_tenant_idx").using(
        "btree",
        table.tenantId.asc().nullsLast()
      ),
      foreignKey({
        columns: [table.tenantId],
        foreignColumns: [tenants.id],
        name: "prerequisite_nodes_tenant_id_fkey",
      }),
      foreignKey({
        columns: [table.tenantId, table.standardId],
        foreignColumns: [standards.tenantId, standards.id],
        name: "prerequisite_nodes_tenant_id_standard_id_fkey",
      }),
      unique("prerequisite_nodes_tenant_id_id_key").on(
        table.tenantId,
        table.id
      ),
      pgPolicy("graph_nodes_are_tenant_scoped", {
        as: "permissive",
        for: "all",
        to: ["public"],
        using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
      }),
      check("prerequisite_nodes_sequence_check", sql`sequence > 0`),
    ];
  }
).enableRLS();

export const activities = pgTable(
  "activities",
  {
    id: text().primaryKey().notNull(),
    tenantId: text("tenant_id").notNull(),
    slug: text().notNull(),
    standardId: text("standard_id").notNull(),
    title: text().notNull(),
    status: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return [
      index("activities_tenant_idx").using(
        "btree",
        table.tenantId.asc().nullsLast()
      ),
      foreignKey({
        columns: [table.tenantId],
        foreignColumns: [tenants.id],
        name: "activities_tenant_id_fkey",
      }),
      foreignKey({
        columns: [table.tenantId, table.standardId],
        foreignColumns: [standards.tenantId, standards.id],
        name: "activities_tenant_id_standard_id_fkey",
      }),
      unique("activities_tenant_id_id_key").on(table.tenantId, table.id),
      unique("activities_tenant_id_slug_key").on(table.tenantId, table.slug),
      pgPolicy("activities_are_tenant_scoped", {
        as: "permissive",
        for: "all",
        to: ["public"],
        using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
      }),
      check(
        "activities_status_check",
        sql`status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])`
      ),
    ];
  }
).enableRLS();

export const activityVersions = pgTable(
  "activity_versions",
  {
    id: text().primaryKey().notNull(),
    tenantId: text("tenant_id").notNull(),
    activityId: text("activity_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    catalogVersion: text("catalog_version").notNull(),
    graphVersion: text("graph_version").notNull(),
    publicContent: jsonb("public_content").notNull(),
    answerKey: jsonb("answer_key").notNull(),
    immutableAt: timestamp("immutable_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return [
      index("activity_versions_tenant_idx").using(
        "btree",
        table.tenantId.asc().nullsLast()
      ),
      foreignKey({
        columns: [table.tenantId],
        foreignColumns: [tenants.id],
        name: "activity_versions_tenant_id_fkey",
      }),
      foreignKey({
        columns: [table.tenantId, table.activityId],
        foreignColumns: [activities.tenantId, activities.id],
        name: "activity_versions_tenant_id_activity_id_fkey",
      }),
      unique("activity_versions_tenant_id_id_key").on(table.tenantId, table.id),
      unique("activity_versions_activity_id_version_number_key").on(
        table.activityId,
        table.versionNumber
      ),
      pgPolicy("activity_versions_are_tenant_scoped", {
        as: "permissive",
        for: "all",
        to: ["public"],
        using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
      }),
      check("activity_versions_version_number_check", sql`version_number > 0`),
    ];
  }
).enableRLS();

export const attempts = pgTable(
  "attempts",
  {
    id: text().primaryKey().notNull(),
    tenantId: text("tenant_id").notNull(),
    activityVersionId: text("activity_version_id").notNull(),
    studentId: text("student_id").notNull(),
    eventLog: jsonb("event_log").default([]).notNull(),
    score: integer(),
    submittedAt: timestamp("submitted_at", {
      withTimezone: true,
      mode: "string",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return [
      index("attempts_tenant_idx").using(
        "btree",
        table.tenantId.asc().nullsLast()
      ),
      foreignKey({
        columns: [table.tenantId],
        foreignColumns: [tenants.id],
        name: "attempts_tenant_id_fkey",
      }),
      foreignKey({
        columns: [table.tenantId, table.activityVersionId],
        foreignColumns: [activityVersions.tenantId, activityVersions.id],
        name: "attempts_tenant_id_activity_version_id_fkey",
      }),
      foreignKey({
        columns: [table.tenantId, table.studentId],
        foreignColumns: [identities.tenantId, identities.id],
        name: "attempts_tenant_id_student_id_fkey",
      }),
      pgPolicy("attempts_are_tenant_scoped", {
        as: "permissive",
        for: "all",
        to: ["public"],
        using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
      }),
      check("attempts_score_check", sql`(score >= 0) AND (score <= 100)`),
    ];
  }
).enableRLS();

export const lessonDraftRequests = pgTable(
  "lesson_draft_requests",
  {
    id: text().primaryKey().notNull(),
    tenantId: text("tenant_id").notNull(),
    teacherId: text("teacher_id").notNull(),
    prompt: text().notNull(),
    grade: integer().notNull(),
    standardId: text("standard_id").notNull(),
    language: text().notNull(),
    difficulty: text().notNull(),
    state: text().notNull(),
    attempt: integer().notNull(),
    diagnostics: jsonb().default([]).notNull(),
    draft: jsonb(),
    provenance: jsonb(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => {
    return [
      index("lesson_draft_requests_tenant_idx").using(
        "btree",
        table.tenantId.asc().nullsLast(),
        table.updatedAt.desc().nullsFirst()
      ),
      foreignKey({
        columns: [table.tenantId, table.teacherId],
        foreignColumns: [identities.tenantId, identities.id],
        name: "lesson_draft_requests_tenant_id_teacher_id_fkey",
      }),
      foreignKey({
        columns: [table.tenantId, table.standardId],
        foreignColumns: [standards.tenantId, standards.id],
        name: "lesson_draft_requests_tenant_id_standard_id_fkey",
      }),
      unique("lesson_draft_requests_tenant_id_id_key").on(
        table.tenantId,
        table.id
      ),
      pgPolicy("lesson_draft_requests_are_tenant_scoped", {
        as: "permissive",
        for: "all",
        to: ["public"],
        using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
      }),
      check(
        "lesson_draft_requests_grade_check",
        sql`(grade >= 3) AND (grade <= 6)`
      ),
      check(
        "lesson_draft_requests_language_check",
        sql`language = ANY (ARRAY['en'::text, 'ar'::text])`
      ),
      check(
        "lesson_draft_requests_difficulty_check",
        sql`difficulty = ANY (ARRAY['support'::text, 'on-level'::text, 'stretch'::text])`
      ),
      check(
        "lesson_draft_requests_state_check",
        sql`state = ANY (ARRAY['requested'::text, 'generating'::text, 'ready-for-review'::text, 'blocked-by-validation'::text, 'blocked-by-moderation'::text, 'failed-retryable'::text, 'failed-terminal'::text])`
      ),
      check("lesson_draft_requests_attempt_check", sql`attempt >= 0`),
    ];
  }
).enableRLS();

export const prerequisiteEdges = pgTable(
  "prerequisite_edges",
  {
    tenantId: text("tenant_id").notNull(),
    prerequisiteId: text("prerequisite_id").notNull(),
    successorId: text("successor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return [
      index("graph_edges_tenant_idx").using(
        "btree",
        table.tenantId.asc().nullsLast()
      ),
      foreignKey({
        columns: [table.tenantId],
        foreignColumns: [tenants.id],
        name: "prerequisite_edges_tenant_id_fkey",
      }),
      foreignKey({
        columns: [table.tenantId, table.prerequisiteId],
        foreignColumns: [prerequisiteNodes.tenantId, prerequisiteNodes.id],
        name: "prerequisite_edges_tenant_id_prerequisite_id_fkey",
      }),
      foreignKey({
        columns: [table.tenantId, table.successorId],
        foreignColumns: [prerequisiteNodes.tenantId, prerequisiteNodes.id],
        name: "prerequisite_edges_tenant_id_successor_id_fkey",
      }),
      primaryKey({
        columns: [table.tenantId, table.prerequisiteId, table.successorId],
        name: "prerequisite_edges_pkey",
      }),
      pgPolicy("graph_edges_are_tenant_scoped", {
        as: "permissive",
        for: "all",
        to: ["public"],
        using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
      }),
      check("prerequisite_edges_check", sql`prerequisite_id <> successor_id`),
    ];
  }
).enableRLS();

export const lessonGenerationAttempts = pgTable(
  "lesson_generation_attempts",
  {
    requestId: text("request_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash"),
    state: text().notNull(),
    correctionAttempted: boolean("correction_attempted")
      .default(false)
      .notNull(),
    diagnostics: jsonb().default([]).notNull(),
    provenance: jsonb(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => {
    return [
      index("lesson_generation_attempts_tenant_idx").using(
        "btree",
        table.tenantId.asc().nullsLast(),
        table.createdAt.desc().nullsFirst()
      ),
      index("lesson_generation_attempts_request_hash_idx").using(
        "btree",
        table.tenantId.asc().nullsLast(),
        table.requestHash.asc().nullsLast(),
        table.createdAt.desc().nullsFirst()
      ),
      foreignKey({
        columns: [table.tenantId, table.requestId],
        foreignColumns: [lessonDraftRequests.tenantId, lessonDraftRequests.id],
        name: "lesson_generation_attempts_tenant_id_request_id_fkey",
      }),
      primaryKey({
        columns: [table.requestId, table.attemptNumber],
        name: "lesson_generation_attempts_pkey",
      }),
      unique("lesson_generation_attempts_tenant_id_idempotency_key_key").on(
        table.tenantId,
        table.idempotencyKey
      ),
      pgPolicy("lesson_generation_attempts_are_tenant_scoped", {
        as: "permissive",
        for: "all",
        to: ["public"],
        using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
      }),
      check(
        "lesson_generation_attempts_attempt_number_check",
        sql`attempt_number > 0`
      ),
      check(
        "lesson_generation_attempts_state_check",
        sql`state = ANY (ARRAY['generating'::text, 'ready-for-review'::text, 'blocked-by-validation'::text, 'blocked-by-moderation'::text, 'failed-retryable'::text, 'failed-terminal'::text])`
      ),
    ];
  }
).enableRLS();

// Identity persistence. actors and provider_bindings are deliberately not
// tenant-scoped: the credential binding step runs before a tenant is known.
export const actors = pgTable(
  "actors",
  {
    id: text().primaryKey().notNull(),
    displayName: text("display_name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    authorizationRevision: integer("authorization_revision")
      .default(1)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  () => {
    return [
      check(
        "actors_authorization_revision_check",
        sql`authorization_revision >= 0`
      ),
    ];
  }
).enableRLS();

export const providerBindings = pgTable(
  "provider_bindings",
  {
    providerIssuer: text("provider_issuer").notNull(),
    providerSubject: text("provider_subject").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return [
      index("provider_bindings_actor_idx").using(
        "btree",
        table.actorId.asc().nullsLast().op("text_ops")
      ),
      foreignKey({
        columns: [table.actorId],
        foreignColumns: [actors.id],
        name: "provider_bindings_actor_id_fkey",
      }),
      primaryKey({
        columns: [table.providerIssuer, table.providerSubject],
        name: "provider_bindings_pkey",
      }),
      unique("provider_bindings_actor_id_provider_issuer_key").on(
        table.actorId,
        table.providerIssuer
      ),
    ];
  }
).enableRLS();

export const memberships = pgTable(
  "memberships",
  {
    id: text().primaryKey().notNull(),
    actorId: text("actor_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    role: text().notNull(),
    status: text().default("active").notNull(),
    learnerId: text("learner_id"),
    revision: integer().default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return [
      index("memberships_actor_idx").using(
        "btree",
        table.actorId.asc().nullsLast().op("text_ops")
      ),
      index("memberships_tenant_idx").using(
        "btree",
        table.tenantId.asc().nullsLast().op("text_ops")
      ),
      foreignKey({
        columns: [table.actorId],
        foreignColumns: [actors.id],
        name: "memberships_actor_id_fkey",
      }),
      foreignKey({
        columns: [table.tenantId],
        foreignColumns: [tenants.id],
        name: "memberships_tenant_id_fkey",
      }),
      foreignKey({
        columns: [table.tenantId, table.learnerId],
        foreignColumns: [identities.tenantId, identities.id],
        name: "memberships_tenant_id_learner_id_fkey",
      }),
      unique("memberships_actor_id_tenant_id_role_key").on(
        table.actorId,
        table.tenantId,
        table.role
      ),
      unique("memberships_tenant_id_id_key").on(table.tenantId, table.id),
      pgPolicy("memberships_are_tenant_scoped", {
        as: "permissive",
        for: "all",
        to: ["public"],
        using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
      }),
      check(
        "memberships_role_check",
        sql`role = ANY (ARRAY['teacher'::text, 'student'::text])`
      ),
      check(
        "memberships_status_check",
        sql`status = ANY (ARRAY['active'::text, 'revoked'::text])`
      ),
      check("memberships_revision_check", sql`revision >= 0`),
    ];
  }
).enableRLS();

export const classAssignments = pgTable(
  "class_assignments",
  {
    membershipId: text("membership_id").notNull(),
    classId: text("class_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return [
      index("class_assignments_membership_idx").using(
        "btree",
        table.membershipId.asc().nullsLast().op("text_ops")
      ),
      foreignKey({
        columns: [table.tenantId],
        foreignColumns: [tenants.id],
        name: "class_assignments_tenant_id_fkey",
      }),
      foreignKey({
        columns: [table.tenantId, table.membershipId],
        foreignColumns: [memberships.tenantId, memberships.id],
        name: "class_assignments_tenant_id_membership_id_fkey",
      }),
      primaryKey({
        columns: [table.membershipId, table.classId],
        name: "class_assignments_pkey",
      }),
      pgPolicy("class_assignments_are_tenant_scoped", {
        as: "permissive",
        for: "all",
        to: ["public"],
        using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
      }),
    ];
  }
).enableRLS();

export const identitySessions = pgTable(
  "identity_sessions",
  {
    sessionId: text("session_id").primaryKey().notNull(),
    verifierHash: text("verifier_hash").notNull(),
    actorId: text("actor_id").notNull(),
    membershipId: text("membership_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    providerSessionId: text("provider_session_id").notNull(),
    providerSubject: text("provider_subject").notNull(),
    sessionGeneration: text("session_generation").notNull(),
    authorizationRevision: integer("authorization_revision").notNull(),
    revision: integer().default(1).notNull(),
    providerCredentialsCiphertext: text("provider_credentials_ciphertext"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    lastActivityAt: timestamp("last_activity_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
  },
  (table) => {
    return [
      index("identity_sessions_actor_idx").using(
        "btree",
        table.actorId.asc().nullsLast().op("text_ops")
      ),
      foreignKey({
        columns: [table.actorId],
        foreignColumns: [actors.id],
        name: "identity_sessions_actor_id_fkey",
      }),
      foreignKey({
        columns: [table.tenantId],
        foreignColumns: [tenants.id],
        name: "identity_sessions_tenant_id_fkey",
      }),
      foreignKey({
        columns: [table.tenantId, table.membershipId],
        foreignColumns: [memberships.tenantId, memberships.id],
        name: "identity_sessions_tenant_id_membership_id_fkey",
      }),
      unique("identity_sessions_verifier_hash_key").on(table.verifierHash),
      unique("identity_sessions_tenant_id_membership_id_session_id_key").on(
        table.tenantId,
        table.membershipId,
        table.sessionId
      ),
      pgPolicy("identity_sessions_are_tenant_scoped", {
        as: "permissive",
        for: "all",
        to: ["public"],
        using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
      }),
      check("identity_sessions_revision_check", sql`revision >= 0`),
    ];
  }
).enableRLS();

export const pendingAuthentications = pgTable(
  "pending_authentications",
  {
    pendingId: text("pending_id").primaryKey().notNull(),
    verifierHash: text("verifier_hash").notNull(),
    actorId: text("actor_id").notNull(),
    memberships: jsonb().notNull(),
    providerSessionId: text("provider_session_id").notNull(),
    providerSubject: text("provider_subject").notNull(),
    providerCredentialsCiphertext: text("provider_credentials_ciphertext"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    consumedAt: timestamp("consumed_at", {
      withTimezone: true,
      mode: "string",
    }),
  },
  (table) => {
    return [
      foreignKey({
        columns: [table.actorId],
        foreignColumns: [actors.id],
        name: "pending_authentications_actor_id_fkey",
      }),
      unique("pending_authentications_verifier_hash_key").on(
        table.verifierHash
      ),
    ];
  }
).enableRLS();

export const provisioningAudit = pgTable("provisioning_audit", {
  id: text().primaryKey().notNull(),
  principal: text().notNull(),
  operation: text().notNull(),
  targetId: text("target_id").notNull(),
  result: text().notNull(),
  requestId: text("request_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
}).enableRLS();
