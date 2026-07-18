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
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const appMigrations = pgTable('app_migrations', {
  name: text().primaryKey().notNull(),
  checksum: text().notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true, mode: 'string' })
    .defaultNow()
    .notNull(),
})

export const tenants = pgTable(
  'tenants',
  {
    id: text().primaryKey().notNull(),
    slug: text().notNull(),
    name: text().notNull(),
    syntheticDataOnly: boolean('synthetic_data_only').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('tenants_slug_key').on(table.slug),
    pgPolicy('tenants_are_tenant_scoped', {
      as: 'permissive',
      for: 'all',
      to: ['public'],
      using: sql`(id = current_setting('app.tenant_id'::text, true))`,
    }),
  ],
)

export const identities = pgTable(
  'identities',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    role: text().notNull(),
    displayName: text('display_name').notNull(),
    demoHandle: text('demo_handle').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('identities_tenant_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'identities_tenant_id_fkey',
    }),
    unique('identities_tenant_id_id_key').on(table.tenantId, table.id),
    unique('identities_demo_handle_key').on(table.demoHandle),
    pgPolicy('identities_are_tenant_scoped', {
      as: 'permissive',
      for: 'all',
      to: ['public'],
      using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
    }),
    check(
      'identities_role_check',
      sql`role = ANY (ARRAY['teacher'::text, 'student'::text])`,
    ),
  ],
)

export const standards = pgTable(
  'standards',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    code: text().notNull(),
    name: text().notNull(),
    subject: text().notNull(),
    gradeBand: text('grade_band').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('standards_tenant_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'standards_tenant_id_fkey',
    }),
    unique('standards_tenant_id_id_key').on(table.tenantId, table.id),
    unique('standards_tenant_id_code_key').on(table.tenantId, table.code),
    pgPolicy('standards_are_tenant_scoped', {
      as: 'permissive',
      for: 'all',
      to: ['public'],
      using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
    }),
  ],
)

export const prerequisiteNodes = pgTable(
  'prerequisite_nodes',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    standardId: text('standard_id').notNull(),
    label: text().notNull(),
    sequence: integer().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('graph_nodes_tenant_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'prerequisite_nodes_tenant_id_fkey',
    }),
    foreignKey({
      columns: [table.tenantId, table.standardId],
      foreignColumns: [standards.tenantId, standards.id],
      name: 'prerequisite_nodes_tenant_id_standard_id_fkey',
    }),
    unique('prerequisite_nodes_tenant_id_id_key').on(table.tenantId, table.id),
    pgPolicy('graph_nodes_are_tenant_scoped', {
      as: 'permissive',
      for: 'all',
      to: ['public'],
      using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
    }),
    check('prerequisite_nodes_sequence_check', sql`sequence > 0`),
  ],
)

export const activities = pgTable(
  'activities',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    slug: text().notNull(),
    standardId: text('standard_id').notNull(),
    title: text().notNull(),
    status: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('activities_tenant_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'activities_tenant_id_fkey',
    }),
    foreignKey({
      columns: [table.tenantId, table.standardId],
      foreignColumns: [standards.tenantId, standards.id],
      name: 'activities_tenant_id_standard_id_fkey',
    }),
    unique('activities_tenant_id_id_key').on(table.tenantId, table.id),
    unique('activities_tenant_id_slug_key').on(table.tenantId, table.slug),
    pgPolicy('activities_are_tenant_scoped', {
      as: 'permissive',
      for: 'all',
      to: ['public'],
      using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
    }),
    check(
      'activities_status_check',
      sql`status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])`,
    ),
  ],
)

export const activityVersions = pgTable(
  'activity_versions',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    activityId: text('activity_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    catalogVersion: text('catalog_version').notNull(),
    graphVersion: text('graph_version').notNull(),
    publicContent: jsonb('public_content').notNull(),
    answerKey: jsonb('answer_key').notNull(),
    immutableAt: timestamp('immutable_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('activity_versions_tenant_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'activity_versions_tenant_id_fkey',
    }),
    foreignKey({
      columns: [table.tenantId, table.activityId],
      foreignColumns: [activities.tenantId, activities.id],
      name: 'activity_versions_tenant_id_activity_id_fkey',
    }),
    unique('activity_versions_tenant_id_id_key').on(table.tenantId, table.id),
    unique('activity_versions_activity_id_version_number_key').on(
      table.activityId,
      table.versionNumber,
    ),
    pgPolicy('activity_versions_are_tenant_scoped', {
      as: 'permissive',
      for: 'all',
      to: ['public'],
      using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
    }),
    check('activity_versions_version_number_check', sql`version_number > 0`),
  ],
)

export const attempts = pgTable(
  'attempts',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    activityVersionId: text('activity_version_id').notNull(),
    studentId: text('student_id').notNull(),
    eventLog: jsonb('event_log').default([]).notNull(),
    score: integer(),
    submittedAt: timestamp('submitted_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('attempts_tenant_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'attempts_tenant_id_fkey',
    }),
    foreignKey({
      columns: [table.tenantId, table.activityVersionId],
      foreignColumns: [activityVersions.tenantId, activityVersions.id],
      name: 'attempts_tenant_id_activity_version_id_fkey',
    }),
    foreignKey({
      columns: [table.tenantId, table.studentId],
      foreignColumns: [identities.tenantId, identities.id],
      name: 'attempts_tenant_id_student_id_fkey',
    }),
    pgPolicy('attempts_are_tenant_scoped', {
      as: 'permissive',
      for: 'all',
      to: ['public'],
      using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
    }),
    check('attempts_score_check', sql`(score >= 0) AND (score <= 100)`),
  ],
)

export const lessonDraftRequests = pgTable(
  'lesson_draft_requests',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    teacherId: text('teacher_id').notNull(),
    prompt: text().notNull(),
    grade: integer().notNull(),
    standardId: text('standard_id').notNull(),
    language: text().notNull(),
    difficulty: text().notNull(),
    state: text().notNull(),
    attempt: integer().notNull(),
    diagnostics: jsonb().default([]).notNull(),
    draft: jsonb(),
    provenance: jsonb(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
  },
  (table) => [
    index('lesson_draft_requests_tenant_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.updatedAt.desc().nullsFirst().op('text_ops'),
    ),
    foreignKey({
      columns: [table.tenantId, table.teacherId],
      foreignColumns: [identities.tenantId, identities.id],
      name: 'lesson_draft_requests_tenant_id_teacher_id_fkey',
    }),
    foreignKey({
      columns: [table.tenantId, table.standardId],
      foreignColumns: [standards.tenantId, standards.id],
      name: 'lesson_draft_requests_tenant_id_standard_id_fkey',
    }),
    unique('lesson_draft_requests_tenant_id_id_key').on(
      table.tenantId,
      table.id,
    ),
    pgPolicy('lesson_draft_requests_are_tenant_scoped', {
      as: 'permissive',
      for: 'all',
      to: ['public'],
      using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
    }),
    check(
      'lesson_draft_requests_grade_check',
      sql`(grade >= 3) AND (grade <= 6)`,
    ),
    check(
      'lesson_draft_requests_language_check',
      sql`language = ANY (ARRAY['en'::text, 'ar'::text])`,
    ),
    check(
      'lesson_draft_requests_difficulty_check',
      sql`difficulty = ANY (ARRAY['support'::text, 'on-level'::text, 'stretch'::text])`,
    ),
    check(
      'lesson_draft_requests_state_check',
      sql`state = ANY (ARRAY['requested'::text, 'generating'::text, 'ready-for-review'::text, 'blocked-by-validation'::text, 'blocked-by-moderation'::text, 'failed-retryable'::text, 'failed-terminal'::text])`,
    ),
    check('lesson_draft_requests_attempt_check', sql`attempt >= 0`),
  ],
)

export const prerequisiteEdges = pgTable(
  'prerequisite_edges',
  {
    tenantId: text('tenant_id').notNull(),
    prerequisiteId: text('prerequisite_id').notNull(),
    successorId: text('successor_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('graph_edges_tenant_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'prerequisite_edges_tenant_id_fkey',
    }),
    foreignKey({
      columns: [table.tenantId, table.prerequisiteId],
      foreignColumns: [prerequisiteNodes.tenantId, prerequisiteNodes.id],
      name: 'prerequisite_edges_tenant_id_prerequisite_id_fkey',
    }),
    foreignKey({
      columns: [table.tenantId, table.successorId],
      foreignColumns: [prerequisiteNodes.tenantId, prerequisiteNodes.id],
      name: 'prerequisite_edges_tenant_id_successor_id_fkey',
    }),
    primaryKey({
      columns: [table.tenantId, table.prerequisiteId, table.successorId],
      name: 'prerequisite_edges_pkey',
    }),
    pgPolicy('graph_edges_are_tenant_scoped', {
      as: 'permissive',
      for: 'all',
      to: ['public'],
      using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
    }),
    check('prerequisite_edges_check', sql`prerequisite_id <> successor_id`),
  ],
)

export const lessonGenerationAttempts = pgTable(
  'lesson_generation_attempts',
  {
    requestId: text('request_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    state: text().notNull(),
    correctionAttempted: boolean('correction_attempted')
      .default(false)
      .notNull(),
    diagnostics: jsonb().default([]).notNull(),
    provenance: jsonb(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
  },
  (table) => [
    index('lesson_generation_attempts_tenant_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.desc().nullsFirst().op('text_ops'),
    ),
    foreignKey({
      columns: [table.tenantId, table.requestId],
      foreignColumns: [lessonDraftRequests.tenantId, lessonDraftRequests.id],
      name: 'lesson_generation_attempts_tenant_id_request_id_fkey',
    }),
    primaryKey({
      columns: [table.requestId, table.attemptNumber],
      name: 'lesson_generation_attempts_pkey',
    }),
    unique('lesson_generation_attempts_tenant_id_idempotency_key_key').on(
      table.tenantId,
      table.idempotencyKey,
    ),
    pgPolicy('lesson_generation_attempts_are_tenant_scoped', {
      as: 'permissive',
      for: 'all',
      to: ['public'],
      using: sql`(tenant_id = current_setting('app.tenant_id'::text, true))`,
    }),
    check(
      'lesson_generation_attempts_attempt_number_check',
      sql`attempt_number > 0`,
    ),
    check(
      'lesson_generation_attempts_state_check',
      sql`state = ANY (ARRAY['generating'::text, 'ready-for-review'::text, 'blocked-by-validation'::text, 'blocked-by-moderation'::text, 'failed-retryable'::text, 'failed-terminal'::text])`,
    ),
  ],
)
