CREATE TABLE "pack_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"version_id" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"approving_actor_id" text NOT NULL,
	"artifact_hash" text NOT NULL,
	"validation_result_hash" text NOT NULL,
	"acknowledged_finding_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pack_approvals_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "pack_approvals_tenant_version_target_key" UNIQUE("tenant_id","version_id","target_kind","target_id"),
	CONSTRAINT "pack_approvals_target_kind_check" CHECK (target_kind = ANY (ARRAY['variant'::text, 'reverse-path'::text])),
	CONSTRAINT "pack_approvals_artifact_hash_check" CHECK (artifact_hash ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "pack_approvals_validation_result_hash_check" CHECK (validation_result_hash ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "pack_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pack_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"publication_id" text NOT NULL,
	"learner_id" text NOT NULL,
	"assigning_actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pack_assignments_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "pack_assignments_tenant_publication_learner_key" UNIQUE("tenant_id","publication_id","learner_id")
);
--> statement-breakpoint
ALTER TABLE "pack_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pack_publications" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"version_id" text NOT NULL,
	"approving_actor_id" text NOT NULL,
	"artifact_hash" text NOT NULL,
	"validation_result_hash" text NOT NULL,
	"content_hash" text NOT NULL,
	"private_answer_digest" text NOT NULL,
	"rule_versions" jsonb NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pack_publications_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "pack_publications_tenant_version_key" UNIQUE("tenant_id","version_id"),
	CONSTRAINT "pack_publications_artifact_hash_check" CHECK (artifact_hash ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "pack_publications_validation_result_hash_check" CHECK (validation_result_hash ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "pack_publications_content_hash_check" CHECK (content_hash ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "pack_publications_private_answer_digest_check" CHECK (private_answer_digest ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "pack_publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pack_receipts" (
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
	CONSTRAINT "pack_receipts_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "pack_receipts_tenant_actor_action_key_key" UNIQUE("tenant_id","actor_id","action","operation_key"),
	CONSTRAINT "pack_receipts_authorization_revision_check" CHECK (authorization_revision >= 0),
	CONSTRAINT "pack_receipts_action_check" CHECK (action = ANY (ARRAY['open-review'::text, 'approve-target'::text, 'revise-version'::text, 'publish'::text])),
	CONSTRAINT "pack_receipts_input_hash_check" CHECK (input_hash ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "pack_receipts_operation_key_check" CHECK (char_length(operation_key) >= 8 AND char_length(operation_key) <= 128)
);
--> statement-breakpoint
ALTER TABLE "pack_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pack_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"request_id" text NOT NULL,
	"teacher_actor_id" text NOT NULL,
	"revision" integer NOT NULL,
	"state" text NOT NULL,
	"parent_version_id" text,
	"source_artifact_hash" text NOT NULL,
	"artifact_hash" text NOT NULL,
	"gate_verdict" text NOT NULL,
	"gate_snapshot" jsonb,
	"validation_result" jsonb NOT NULL,
	"validation_result_hash" text NOT NULL,
	"rule_versions" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"public_content" jsonb NOT NULL,
	"private_answers" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"private_answer_digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pack_versions_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "pack_versions_tenant_id_request_id_revision_key" UNIQUE("tenant_id","request_id","revision"),
	CONSTRAINT "pack_versions_revision_check" CHECK (revision >= 1),
	CONSTRAINT "pack_versions_state_check" CHECK (state = ANY (ARRAY['ready-for-review'::text, 'blocked-by-validation'::text])),
	CONSTRAINT "pack_versions_gate_verdict_check" CHECK (gate_verdict = ANY (ARRAY['pass'::text, 'warning'::text, 'hard_block'::text])),
	CONSTRAINT "pack_versions_source_artifact_hash_check" CHECK (source_artifact_hash ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "pack_versions_artifact_hash_check" CHECK (artifact_hash ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "pack_versions_validation_result_hash_check" CHECK (validation_result_hash ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "pack_versions_content_hash_check" CHECK (content_hash ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "pack_versions_private_answer_digest_check" CHECK (private_answer_digest ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "pack_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pack_approvals" ADD CONSTRAINT "pack_approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_approvals" ADD CONSTRAINT "pack_approvals_approving_actor_id_fkey" FOREIGN KEY ("approving_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_approvals" ADD CONSTRAINT "pack_approvals_tenant_id_version_id_fkey" FOREIGN KEY ("tenant_id","version_id") REFERENCES "public"."pack_versions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_assignments" ADD CONSTRAINT "pack_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_assignments" ADD CONSTRAINT "pack_assignments_assigning_actor_id_fkey" FOREIGN KEY ("assigning_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_assignments" ADD CONSTRAINT "pack_assignments_tenant_id_publication_id_fkey" FOREIGN KEY ("tenant_id","publication_id") REFERENCES "public"."pack_publications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_assignments" ADD CONSTRAINT "pack_assignments_tenant_id_learner_id_fkey" FOREIGN KEY ("tenant_id","learner_id") REFERENCES "public"."identities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_publications" ADD CONSTRAINT "pack_publications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_publications" ADD CONSTRAINT "pack_publications_approving_actor_id_fkey" FOREIGN KEY ("approving_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_publications" ADD CONSTRAINT "pack_publications_tenant_id_version_id_fkey" FOREIGN KEY ("tenant_id","version_id") REFERENCES "public"."pack_versions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_receipts" ADD CONSTRAINT "pack_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_receipts" ADD CONSTRAINT "pack_receipts_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_receipts" ADD CONSTRAINT "pack_receipts_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_versions" ADD CONSTRAINT "pack_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_versions" ADD CONSTRAINT "pack_versions_teacher_actor_id_fkey" FOREIGN KEY ("teacher_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_versions" ADD CONSTRAINT "pack_versions_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id","request_id") REFERENCES "public"."lesson_draft_requests"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_versions" ADD CONSTRAINT "pack_versions_tenant_id_parent_version_id_fkey" FOREIGN KEY ("tenant_id","parent_version_id") REFERENCES "public"."pack_versions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pack_approvals_version_idx" ON "pack_approvals" USING btree ("tenant_id","version_id");--> statement-breakpoint
CREATE INDEX "pack_assignments_learner_idx" ON "pack_assignments" USING btree ("tenant_id","learner_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "pack_publications_tenant_idx" ON "pack_publications" USING btree ("tenant_id","approved_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "pack_versions_request_idx" ON "pack_versions" USING btree ("tenant_id","request_id","revision" DESC NULLS FIRST);--> statement-breakpoint
CREATE POLICY "pack_approvals_are_tenant_scoped" ON "pack_approvals" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "pack_assignments_are_tenant_scoped" ON "pack_assignments" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "pack_publications_are_tenant_scoped" ON "pack_publications" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "pack_receipts_are_tenant_scoped" ON "pack_receipts" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "pack_versions_are_tenant_scoped" ON "pack_versions" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));