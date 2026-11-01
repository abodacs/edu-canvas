CREATE TABLE "assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"publication_id" text NOT NULL,
	"learner_id" text NOT NULL,
	"assigning_actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "assignments_schema_version_check" CHECK (schema_version = 'assignment-v1')
);
--> statement-breakpoint
ALTER TABLE "assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assistance_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"run_id" text NOT NULL,
	"item_id" text NOT NULL,
	"kind" text NOT NULL,
	"ordinal" integer NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "assistance_events_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "assistance_events_run_item_ordinal_key" UNIQUE("tenant_id","run_id","item_id","ordinal"),
	CONSTRAINT "assistance_events_schema_version_check" CHECK (schema_version = 'assistance-event-v1'),
	CONSTRAINT "assistance_events_kind_check" CHECK (kind = ANY (ARRAY['hint'::text, 'other'::text])),
	CONSTRAINT "assistance_events_ordinal_check" CHECK (ordinal > 0)
);
--> statement-breakpoint
ALTER TABLE "assistance_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "curated_references" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"teacher_actor_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"kind" text NOT NULL,
	"standard_id" text NOT NULL,
	"reference_key" text NOT NULL,
	"reference_version" text NOT NULL,
	"title" text NOT NULL,
	"attribution" text NOT NULL,
	"source_locator" text NOT NULL,
	"reviewed_content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curated_references_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "curated_references_schema_version_check" CHECK (schema_version = 'curated-reference-v1'),
	CONSTRAINT "curated_references_kind_check" CHECK (kind = 'curated')
);
--> statement-breakpoint
ALTER TABLE "curated_references" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "learner_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"run_id" text NOT NULL,
	"publication_id" text NOT NULL,
	"lesson_version_id" text NOT NULL,
	"item_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"prior_attempt_id" text,
	"selected_pairs" jsonb NOT NULL,
	"assistance_state" text NOT NULL,
	"assistance_event_ids" jsonb NOT NULL,
	"score" integer NOT NULL,
	"correctness" text NOT NULL,
	"grading_rule_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_attempts_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "learner_attempts_run_item_ordinal_key" UNIQUE("tenant_id","run_id","item_id","ordinal"),
	CONSTRAINT "learner_attempts_schema_version_check" CHECK (schema_version = 'attempt-v2'),
	CONSTRAINT "learner_attempts_ordinal_check" CHECK (ordinal > 0),
	CONSTRAINT "learner_attempts_score_check" CHECK ((score >= 0) AND (score <= 100)),
	CONSTRAINT "learner_attempts_correctness_check" CHECK (correctness = ANY (ARRAY['correct'::text, 'partial'::text, 'incorrect'::text])),
	CONSTRAINT "learner_attempts_assistance_state_check" CHECK (assistance_state = ANY (ARRAY['none'::text, 'hinted'::text]))
);
--> statement-breakpoint
ALTER TABLE "learner_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "learner_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"assignment_id" text NOT NULL,
	"learner_id" text NOT NULL,
	"publication_id" text NOT NULL,
	"assigned_variant_id" text NOT NULL,
	"stage" text NOT NULL,
	"first_response_status" text DEFAULT 'pending' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"next_activity" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_runs_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "learner_runs_tenant_id_assignment_id_key" UNIQUE("tenant_id","assignment_id"),
	CONSTRAINT "learner_runs_schema_version_check" CHECK (schema_version = 'learner-run-v1'),
	CONSTRAINT "learner_runs_stage_check" CHECK (stage = ANY (ARRAY['assigned'::text, 'active'::text, 'awaiting-decision'::text, 'paused'::text, 'advanced'::text, 'completed'::text])),
	CONSTRAINT "learner_runs_first_response_status_check" CHECK (first_response_status = ANY (ARRAY['pending'::text, 'submitted'::text])),
	CONSTRAINT "learner_runs_revision_check" CHECK (revision >= 0)
);
--> statement-breakpoint
ALTER TABLE "learner_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lesson_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"teacher_actor_id" text NOT NULL,
	"standard_id" text NOT NULL,
	"title" text NOT NULL,
	"head_revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_packages_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "lesson_packages_head_revision_check" CHECK (head_revision >= 0)
);
--> statement-breakpoint
ALTER TABLE "lesson_packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lesson_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"package_id" text NOT NULL,
	"revision" integer NOT NULL,
	"schema_version" text NOT NULL,
	"parent_version_id" text,
	"predecessor_version_id" text,
	"curated_reference_id" text NOT NULL,
	"generation_request_id" text,
	"concept_ids" jsonb NOT NULL,
	"variant_references" jsonb NOT NULL,
	"objective_hash" text NOT NULL,
	"sections" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"revision_kind" text NOT NULL,
	"changed_section_ids" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"package_hash" text NOT NULL,
	"private_answer_digest" text NOT NULL,
	"private_answer_relationships" jsonb NOT NULL,
	"validation_result" jsonb NOT NULL,
	"validation_result_hash" text NOT NULL,
	"rule_versions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_versions_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "lesson_versions_package_id_revision_key" UNIQUE("tenant_id","package_id","revision"),
	CONSTRAINT "lesson_versions_revision_check" CHECK (revision > 0),
	CONSTRAINT "lesson_versions_schema_version_check" CHECK (schema_version = 'lesson-package-curated-v1'),
	CONSTRAINT "lesson_versions_revision_kind_check" CHECK (revision_kind = ANY (ARRAY['initial'::text, 'section-revision'::text, 'reframe'::text, 'fresh-draft'::text])),
	CONSTRAINT "lesson_versions_lineage_check" CHECK (((revision_kind = 'initial'::text) AND (parent_version_id IS NULL) AND (predecessor_version_id IS NULL) AND (revision = 1)) OR ((revision_kind = 'section-revision'::text) AND (parent_version_id IS NOT NULL) AND (predecessor_version_id IS NULL) AND (revision > 1)) OR ((revision_kind = 'reframe'::text) AND (parent_version_id IS NOT NULL) AND (predecessor_version_id IS NULL) AND (revision > 1)) OR ((revision_kind = 'fresh-draft'::text) AND (parent_version_id IS NULL) AND (revision = 1)))
);
--> statement-breakpoint
ALTER TABLE "lesson_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "operation_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"actor_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"authorization_revision" integer NOT NULL,
	"action" text NOT NULL,
	"operation_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"result_kind" text NOT NULL,
	"result_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operation_receipts_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "operation_receipts_actor_action_key_key" UNIQUE("tenant_id","actor_id","action","operation_key"),
	CONSTRAINT "operation_receipts_schema_version_check" CHECK (schema_version = 'operation-receipt-v1'),
	CONSTRAINT "operation_receipts_authorization_revision_check" CHECK (authorization_revision >= 0),
	CONSTRAINT "operation_receipts_action_check" CHECK (action = ANY (ARRAY['store-grounding'::text, 'append-version'::text, 'publish'::text, 'assign'::text, 'start-run'::text, 'record-hint'::text, 'record-attempt'::text, 'choose'::text]))
);
--> statement-breakpoint
ALTER TABLE "operation_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "publications" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"lesson_version_id" text NOT NULL,
	"approving_actor_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"package_hash" text NOT NULL,
	"private_answer_digest" text NOT NULL,
	"validation_result_hash" text NOT NULL,
	"rule_versions" jsonb NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publications_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "publications_tenant_id_lesson_version_id_key" UNIQUE("tenant_id","lesson_version_id"),
	CONSTRAINT "publications_schema_version_check" CHECK (schema_version = 'publication-v1')
);
--> statement-breakpoint
ALTER TABLE "publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "teacher_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"run_id" text NOT NULL,
	"teacher_actor_id" text NOT NULL,
	"evidence_hash" text NOT NULL,
	"proposal" jsonb NOT NULL,
	"action" text NOT NULL,
	"approved_target_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_decisions_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "teacher_decisions_schema_version_check" CHECK (schema_version = 'teacher-decision-v1'),
	CONSTRAINT "teacher_decisions_action_check" CHECK (action = ANY (ARRAY['accept'::text, 'pause'::text, 'override'::text])),
	CONSTRAINT "teacher_decisions_target_check" CHECK (((action = 'pause'::text) AND (approved_target_id IS NULL)) OR ((action = ANY (ARRAY['accept'::text, 'override'::text])) AND (approved_target_id IS NOT NULL)))
);
--> statement-breakpoint
ALTER TABLE "teacher_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_publication_id_fkey" FOREIGN KEY ("tenant_id","publication_id") REFERENCES "public"."publications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_learner_id_fkey" FOREIGN KEY ("tenant_id","learner_id") REFERENCES "public"."identities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assigning_actor_id_fkey" FOREIGN KEY ("assigning_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistance_events" ADD CONSTRAINT "assistance_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistance_events" ADD CONSTRAINT "assistance_events_tenant_id_run_id_fkey" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."learner_runs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_references" ADD CONSTRAINT "curated_references_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_references" ADD CONSTRAINT "curated_references_teacher_actor_id_fkey" FOREIGN KEY ("teacher_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_references" ADD CONSTRAINT "curated_references_tenant_id_standard_id_fkey" FOREIGN KEY ("tenant_id","standard_id") REFERENCES "public"."standards"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_attempts" ADD CONSTRAINT "learner_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_attempts" ADD CONSTRAINT "learner_attempts_tenant_id_run_id_fkey" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."learner_runs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_attempts" ADD CONSTRAINT "learner_attempts_tenant_id_publication_id_fkey" FOREIGN KEY ("tenant_id","publication_id") REFERENCES "public"."publications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_attempts" ADD CONSTRAINT "learner_attempts_tenant_id_lesson_version_id_fkey" FOREIGN KEY ("tenant_id","lesson_version_id") REFERENCES "public"."lesson_versions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_attempts" ADD CONSTRAINT "learner_attempts_tenant_id_prior_attempt_id_fkey" FOREIGN KEY ("tenant_id","prior_attempt_id") REFERENCES "public"."learner_attempts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_runs" ADD CONSTRAINT "learner_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_runs" ADD CONSTRAINT "learner_runs_tenant_id_assignment_id_fkey" FOREIGN KEY ("tenant_id","assignment_id") REFERENCES "public"."assignments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_runs" ADD CONSTRAINT "learner_runs_tenant_id_learner_id_fkey" FOREIGN KEY ("tenant_id","learner_id") REFERENCES "public"."identities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_runs" ADD CONSTRAINT "learner_runs_tenant_id_publication_id_fkey" FOREIGN KEY ("tenant_id","publication_id") REFERENCES "public"."publications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_packages" ADD CONSTRAINT "lesson_packages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_packages" ADD CONSTRAINT "lesson_packages_teacher_actor_id_fkey" FOREIGN KEY ("teacher_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_packages" ADD CONSTRAINT "lesson_packages_tenant_id_standard_id_fkey" FOREIGN KEY ("tenant_id","standard_id") REFERENCES "public"."standards"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_versions" ADD CONSTRAINT "lesson_versions_tenant_id_package_id_fkey" FOREIGN KEY ("tenant_id","package_id") REFERENCES "public"."lesson_packages"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_versions" ADD CONSTRAINT "lesson_versions_tenant_id_parent_version_id_fkey" FOREIGN KEY ("tenant_id","parent_version_id") REFERENCES "public"."lesson_versions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_versions" ADD CONSTRAINT "lesson_versions_tenant_id_predecessor_version_id_fkey" FOREIGN KEY ("tenant_id","predecessor_version_id") REFERENCES "public"."lesson_versions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_versions" ADD CONSTRAINT "lesson_versions_tenant_id_curated_reference_id_fkey" FOREIGN KEY ("tenant_id","curated_reference_id") REFERENCES "public"."curated_references"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_versions" ADD CONSTRAINT "lesson_versions_tenant_id_generation_request_id_fkey" FOREIGN KEY ("tenant_id","generation_request_id") REFERENCES "public"."lesson_draft_requests"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_receipts" ADD CONSTRAINT "operation_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_receipts" ADD CONSTRAINT "operation_receipts_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_receipts" ADD CONSTRAINT "operation_receipts_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_tenant_id_lesson_version_id_fkey" FOREIGN KEY ("tenant_id","lesson_version_id") REFERENCES "public"."lesson_versions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_approving_actor_id_fkey" FOREIGN KEY ("approving_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_decisions" ADD CONSTRAINT "teacher_decisions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_decisions" ADD CONSTRAINT "teacher_decisions_tenant_id_run_id_fkey" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."learner_runs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_decisions" ADD CONSTRAINT "teacher_decisions_teacher_actor_id_fkey" FOREIGN KEY ("teacher_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_tenant_idx" ON "assignments" USING btree ("tenant_id" text_ops);--> statement-breakpoint
CREATE INDEX "assistance_events_run_idx" ON "assistance_events" USING btree ("run_id" text_ops);--> statement-breakpoint
CREATE INDEX "curated_references_tenant_idx" ON "curated_references" USING btree ("tenant_id" text_ops);--> statement-breakpoint
CREATE INDEX "learner_attempts_run_idx" ON "learner_attempts" USING btree ("run_id" text_ops);--> statement-breakpoint
CREATE INDEX "learner_runs_tenant_idx" ON "learner_runs" USING btree ("tenant_id" text_ops);--> statement-breakpoint
CREATE INDEX "lesson_packages_tenant_idx" ON "lesson_packages" USING btree ("tenant_id" text_ops);--> statement-breakpoint
CREATE INDEX "lesson_versions_tenant_idx" ON "lesson_versions" USING btree ("tenant_id" text_ops);--> statement-breakpoint
CREATE INDEX "operation_receipts_tenant_idx" ON "operation_receipts" USING btree ("tenant_id" text_ops);--> statement-breakpoint
CREATE INDEX "publications_tenant_idx" ON "publications" USING btree ("tenant_id" text_ops);--> statement-breakpoint
CREATE INDEX "teacher_decisions_run_idx" ON "teacher_decisions" USING btree ("run_id" text_ops);--> statement-breakpoint
CREATE POLICY "assignments_are_tenant_scoped" ON "assignments" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "assistance_events_are_tenant_scoped" ON "assistance_events" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "curated_references_are_tenant_scoped" ON "curated_references" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "learner_attempts_are_tenant_scoped" ON "learner_attempts" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "learner_runs_are_tenant_scoped" ON "learner_runs" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "lesson_packages_are_tenant_scoped" ON "lesson_packages" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "lesson_versions_are_tenant_scoped" ON "lesson_versions" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "operation_receipts_are_tenant_scoped" ON "operation_receipts" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "publications_are_tenant_scoped" ON "publications" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "teacher_decisions_are_tenant_scoped" ON "teacher_decisions" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));