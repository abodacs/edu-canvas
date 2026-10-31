CREATE TABLE "source_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"standard_id" text NOT NULL,
	"mode" text NOT NULL,
	"file_name" text NOT NULL,
	"file_format" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"page_count" integer,
	"content_hash" text,
	"extracted_text" text,
	"state" text NOT NULL,
	"gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failure_reason" text,
	"unverified_alignment" boolean DEFAULT true NOT NULL,
	"alignment_acknowledged_at" timestamp with time zone,
	"synthetic_material_confirmed" boolean DEFAULT false NOT NULL,
	"required_skills_confirmed_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"replaces_snapshot_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "source_snapshots_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "source_snapshots_mode_check" CHECK (mode = 'upload'),
	CONSTRAINT "source_snapshots_file_format_check" CHECK (file_format = ANY (ARRAY['pdf'::text, 'txt'::text, 'markdown'::text])),
	CONSTRAINT "source_snapshots_state_check" CHECK (state = ANY (ARRAY['extracting'::text, 'complete'::text, 'partial'::text, 'failed'::text])),
	CONSTRAINT "source_snapshots_file_size_check" CHECK (file_size_bytes >= 0 AND file_size_bytes <= 5242880),
	CONSTRAINT "source_snapshots_extracted_text_length_check" CHECK (extracted_text IS NULL OR char_length(extracted_text) <= 30000),
	CONSTRAINT "source_snapshots_page_count_check" CHECK (page_count IS NULL OR (page_count >= 1 AND page_count <= 20)),
	CONSTRAINT "source_snapshots_failure_reason_check" CHECK (failure_reason IS NULL OR failure_reason = ANY (ARRAY['unsupported-format'::text, 'oversized-file'::text, 'too-many-pages'::text, 'encrypted'::text, 'empty-source'::text, 'encoding'::text, 'character-limit-exceeded'::text, 'parser-fault'::text, 'extraction-timeout'::text, 'interrupted'::text, 'personal-data'::text]))
);
--> statement-breakpoint
ALTER TABLE "source_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lesson_draft_requests" ADD COLUMN "source_snapshot_id" text;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_tenant_id_standard_id_fkey" FOREIGN KEY ("tenant_id","standard_id") REFERENCES "public"."standards"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_tenant_id_replaces_snapshot_id_fkey" FOREIGN KEY ("tenant_id","replaces_snapshot_id") REFERENCES "public"."source_snapshots"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_snapshots_tenant_idx" ON "source_snapshots" USING btree ("tenant_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "source_snapshots_expiry_idx" ON "source_snapshots" USING btree ("expires_at");--> statement-breakpoint
CREATE POLICY "source_snapshots_are_tenant_scoped" ON "source_snapshots" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));