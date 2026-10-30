CREATE TABLE "actors" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"authorization_revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actors_authorization_revision_check" CHECK (authorization_revision >= 0)
);
--> statement-breakpoint
CREATE TABLE "class_assignments" (
	"membership_id" text NOT NULL,
	"class_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_assignments_pkey" PRIMARY KEY("membership_id","class_id")
);
--> statement-breakpoint
ALTER TABLE "class_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"verifier_hash" text NOT NULL,
	"actor_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"provider_session_id" text NOT NULL,
	"provider_subject" text NOT NULL,
	"session_generation" text NOT NULL,
	"authorization_revision" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"provider_credentials_ciphertext" text,
	"created_at" timestamp with time zone NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "identity_sessions_verifier_hash_key" UNIQUE("verifier_hash"),
	CONSTRAINT "identity_sessions_tenant_id_membership_id_session_id_key" UNIQUE("tenant_id","membership_id","session_id"),
	CONSTRAINT "identity_sessions_revision_check" CHECK (revision >= 0)
);
--> statement-breakpoint
ALTER TABLE "identity_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"learner_id" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_actor_id_tenant_id_role_key" UNIQUE("actor_id","tenant_id","role"),
	CONSTRAINT "memberships_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "memberships_role_check" CHECK (role = ANY (ARRAY['teacher'::text, 'student'::text])),
	CONSTRAINT "memberships_status_check" CHECK (status = ANY (ARRAY['active'::text, 'revoked'::text])),
	CONSTRAINT "memberships_revision_check" CHECK (revision >= 0)
);
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pending_authentications" (
	"pending_id" text PRIMARY KEY NOT NULL,
	"verifier_hash" text NOT NULL,
	"actor_id" text NOT NULL,
	"memberships" jsonb NOT NULL,
	"provider_session_id" text NOT NULL,
	"provider_subject" text NOT NULL,
	"provider_credentials_ciphertext" text,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "pending_authentications_verifier_hash_key" UNIQUE("verifier_hash")
);
--> statement-breakpoint
CREATE TABLE "provider_bindings" (
	"provider_issuer" text NOT NULL,
	"provider_subject" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_bindings_pkey" PRIMARY KEY("provider_issuer","provider_subject"),
	CONSTRAINT "provider_bindings_actor_id_provider_issuer_key" UNIQUE("actor_id","provider_issuer")
);
--> statement-breakpoint
CREATE TABLE "provisioning_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"principal" text NOT NULL,
	"operation" text NOT NULL,
	"target_id" text NOT NULL,
	"result" text NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_sessions" ADD CONSTRAINT "identity_sessions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_sessions" ADD CONSTRAINT "identity_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_sessions" ADD CONSTRAINT "identity_sessions_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_learner_id_fkey" FOREIGN KEY ("tenant_id","learner_id") REFERENCES "public"."identities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_authentications" ADD CONSTRAINT "pending_authentications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_bindings" ADD CONSTRAINT "provider_bindings_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_assignments_membership_idx" ON "class_assignments" USING btree ("membership_id" text_ops);--> statement-breakpoint
CREATE INDEX "identity_sessions_actor_idx" ON "identity_sessions" USING btree ("actor_id" text_ops);--> statement-breakpoint
CREATE INDEX "memberships_actor_idx" ON "memberships" USING btree ("actor_id" text_ops);--> statement-breakpoint
CREATE INDEX "memberships_tenant_idx" ON "memberships" USING btree ("tenant_id" text_ops);--> statement-breakpoint
CREATE INDEX "provider_bindings_actor_idx" ON "provider_bindings" USING btree ("actor_id" text_ops);--> statement-breakpoint
CREATE POLICY "class_assignments_are_tenant_scoped" ON "class_assignments" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "identity_sessions_are_tenant_scoped" ON "identity_sessions" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "memberships_are_tenant_scoped" ON "memberships" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));