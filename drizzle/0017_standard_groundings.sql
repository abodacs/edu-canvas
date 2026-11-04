CREATE TABLE "standard_groundings" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"request_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"registry_version" text NOT NULL,
	"framework_id" text NOT NULL,
	"jurisdiction" text NOT NULL,
	"statement_code" text NOT NULL,
	"subject" text NOT NULL,
	"grade" integer NOT NULL,
	"standard_id" text,
	"description" text,
	"description_hash" text,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prerequisites" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prerequisite_resolution" text NOT NULL,
	"gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"retrieval_attempt" integer DEFAULT 1 NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"predecessor_grounding_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "standard_groundings_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "standard_groundings_tenant_id_request_key_key" UNIQUE("tenant_id","request_key"),
	CONSTRAINT "standard_groundings_retrieval_attempt_check" CHECK (retrieval_attempt = ANY (ARRAY[1, 2])),
	CONSTRAINT "standard_groundings_grade_check" CHECK (grade >= 0),
	CONSTRAINT "standard_groundings_statement_code_length_check" CHECK (char_length(statement_code) <= 40),
	CONSTRAINT "standard_groundings_description_length_check" CHECK (description IS NULL OR char_length(description) <= 1200),
	CONSTRAINT "standard_groundings_prerequisite_resolution_check" CHECK (prerequisite_resolution = ANY (ARRAY['direct'::text, 'crosswalk'::text, 'unavailable'::text])),
	CONSTRAINT "standard_groundings_input_hash_check" CHECK (input_hash ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "standard_groundings_content_hash_check" CHECK (content_hash ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "standard_groundings_description_hash_check" CHECK (description_hash IS NULL OR description_hash ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "standard_groundings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "standard_groundings" ADD CONSTRAINT "standard_groundings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standard_groundings" ADD CONSTRAINT "standard_groundings_tenant_id_predecessor_grounding_id_fkey" FOREIGN KEY ("tenant_id","predecessor_grounding_id") REFERENCES "public"."standard_groundings"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "standard_groundings_standard_idx" ON "standard_groundings" USING btree ("tenant_id","jurisdiction","statement_code","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE POLICY "standard_groundings_are_tenant_scoped" ON "standard_groundings" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));