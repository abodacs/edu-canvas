CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"slug" text NOT NULL,
	"standard_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "activities_tenant_id_slug_key" UNIQUE("tenant_id","slug"),
	CONSTRAINT "activities_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))
);
--> statement-breakpoint
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "activity_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"catalog_version" text NOT NULL,
	"graph_version" text NOT NULL,
	"public_content" jsonb NOT NULL,
	"answer_key" jsonb NOT NULL,
	"immutable_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_versions_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "activity_versions_activity_id_version_number_key" UNIQUE("activity_id","version_number"),
	CONSTRAINT "activity_versions_version_number_check" CHECK (version_number > 0)
);
--> statement-breakpoint
ALTER TABLE "activity_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"activity_version_id" text NOT NULL,
	"student_id" text NOT NULL,
	"event_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"score" integer,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempts_score_check" CHECK ((score >= 0) AND (score <= 100))
);
--> statement-breakpoint
ALTER TABLE "attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identities" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"role" text NOT NULL,
	"display_name" text NOT NULL,
	"demo_handle" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identities_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "identities_demo_handle_key" UNIQUE("demo_handle"),
	CONSTRAINT "identities_role_check" CHECK (role = ANY (ARRAY['teacher'::text, 'student'::text]))
);
--> statement-breakpoint
ALTER TABLE "identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lesson_draft_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"prompt" text NOT NULL,
	"grade" integer NOT NULL,
	"standard_id" text NOT NULL,
	"language" text NOT NULL,
	"difficulty" text NOT NULL,
	"state" text NOT NULL,
	"attempt" integer NOT NULL,
	"diagnostics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"draft" jsonb,
	"provenance" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lesson_draft_requests_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "lesson_draft_requests_grade_check" CHECK ((grade >= 3) AND (grade <= 6)),
	CONSTRAINT "lesson_draft_requests_language_check" CHECK (language = ANY (ARRAY['en'::text, 'ar'::text])),
	CONSTRAINT "lesson_draft_requests_difficulty_check" CHECK (difficulty = ANY (ARRAY['support'::text, 'on-level'::text, 'stretch'::text])),
	CONSTRAINT "lesson_draft_requests_state_check" CHECK (state = ANY (ARRAY['requested'::text, 'generating'::text, 'ready-for-review'::text, 'blocked-by-validation'::text, 'blocked-by-moderation'::text, 'failed-retryable'::text, 'failed-terminal'::text])),
	CONSTRAINT "lesson_draft_requests_attempt_check" CHECK (attempt >= 0)
);
--> statement-breakpoint
ALTER TABLE "lesson_draft_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lesson_generation_attempts" (
	"request_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text,
	"state" text NOT NULL,
	"correction_attempted" boolean DEFAULT false NOT NULL,
	"diagnostics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provenance" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lesson_generation_attempts_pkey" PRIMARY KEY("request_id","attempt_number"),
	CONSTRAINT "lesson_generation_attempts_tenant_id_idempotency_key_key" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "lesson_generation_attempts_attempt_number_check" CHECK (attempt_number > 0),
	CONSTRAINT "lesson_generation_attempts_state_check" CHECK (state = ANY (ARRAY['generating'::text, 'ready-for-review'::text, 'blocked-by-validation'::text, 'blocked-by-moderation'::text, 'failed-retryable'::text, 'failed-terminal'::text]))
);
--> statement-breakpoint
ALTER TABLE "lesson_generation_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prerequisite_edges" (
	"tenant_id" text NOT NULL,
	"prerequisite_id" text NOT NULL,
	"successor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prerequisite_edges_pkey" PRIMARY KEY("tenant_id","prerequisite_id","successor_id"),
	CONSTRAINT "prerequisite_edges_check" CHECK (prerequisite_id <> successor_id)
);
--> statement-breakpoint
ALTER TABLE "prerequisite_edges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prerequisite_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"standard_id" text NOT NULL,
	"label" text NOT NULL,
	"sequence" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prerequisite_nodes_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "prerequisite_nodes_sequence_check" CHECK (sequence > 0)
);
--> statement-breakpoint
ALTER TABLE "prerequisite_nodes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "standards" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"grade_band" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "standards_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "standards_tenant_id_code_key" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
ALTER TABLE "standards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"synthetic_data_only" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_tenant_id_standard_id_fkey" FOREIGN KEY ("tenant_id","standard_id") REFERENCES "public"."standards"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_versions" ADD CONSTRAINT "activity_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_versions" ADD CONSTRAINT "activity_versions_tenant_id_activity_id_fkey" FOREIGN KEY ("tenant_id","activity_id") REFERENCES "public"."activities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_tenant_id_activity_version_id_fkey" FOREIGN KEY ("tenant_id","activity_version_id") REFERENCES "public"."activity_versions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."identities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_draft_requests" ADD CONSTRAINT "lesson_draft_requests_tenant_id_teacher_id_fkey" FOREIGN KEY ("tenant_id","teacher_id") REFERENCES "public"."identities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_draft_requests" ADD CONSTRAINT "lesson_draft_requests_tenant_id_standard_id_fkey" FOREIGN KEY ("tenant_id","standard_id") REFERENCES "public"."standards"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_generation_attempts" ADD CONSTRAINT "lesson_generation_attempts_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id","request_id") REFERENCES "public"."lesson_draft_requests"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prerequisite_edges" ADD CONSTRAINT "prerequisite_edges_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prerequisite_edges" ADD CONSTRAINT "prerequisite_edges_tenant_id_prerequisite_id_fkey" FOREIGN KEY ("tenant_id","prerequisite_id") REFERENCES "public"."prerequisite_nodes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prerequisite_edges" ADD CONSTRAINT "prerequisite_edges_tenant_id_successor_id_fkey" FOREIGN KEY ("tenant_id","successor_id") REFERENCES "public"."prerequisite_nodes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prerequisite_nodes" ADD CONSTRAINT "prerequisite_nodes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prerequisite_nodes" ADD CONSTRAINT "prerequisite_nodes_tenant_id_standard_id_fkey" FOREIGN KEY ("tenant_id","standard_id") REFERENCES "public"."standards"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standards" ADD CONSTRAINT "standards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_tenant_idx" ON "activities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "activity_versions_tenant_idx" ON "activity_versions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "attempts_tenant_idx" ON "attempts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "identities_tenant_idx" ON "identities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "lesson_draft_requests_tenant_idx" ON "lesson_draft_requests" USING btree ("tenant_id","updated_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "lesson_generation_attempts_tenant_idx" ON "lesson_generation_attempts" USING btree ("tenant_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "lesson_generation_attempts_request_hash_idx" ON "lesson_generation_attempts" USING btree ("tenant_id","request_hash","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "graph_edges_tenant_idx" ON "prerequisite_edges" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "graph_nodes_tenant_idx" ON "prerequisite_nodes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "standards_tenant_idx" ON "standards" USING btree ("tenant_id");--> statement-breakpoint
CREATE POLICY "activities_are_tenant_scoped" ON "activities" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "activity_versions_are_tenant_scoped" ON "activity_versions" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "attempts_are_tenant_scoped" ON "attempts" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "identities_are_tenant_scoped" ON "identities" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "lesson_draft_requests_are_tenant_scoped" ON "lesson_draft_requests" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "lesson_generation_attempts_are_tenant_scoped" ON "lesson_generation_attempts" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "graph_edges_are_tenant_scoped" ON "prerequisite_edges" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "graph_nodes_are_tenant_scoped" ON "prerequisite_nodes" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "standards_are_tenant_scoped" ON "standards" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "tenants_are_tenant_scoped" ON "tenants" AS PERMISSIVE FOR ALL TO public USING ((id = current_setting('app.tenant_id'::text, true)));