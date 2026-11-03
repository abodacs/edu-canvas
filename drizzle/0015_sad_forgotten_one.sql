CREATE TABLE "active_generation_leases" (
	"tenant_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"holder" text NOT NULL,
	"acquired_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "active_generation_leases_pkey" PRIMARY KEY("tenant_id","teacher_id"),
	CONSTRAINT "active_generation_leases_window_check" CHECK (expires_at > acquired_at)
);
--> statement-breakpoint
ALTER TABLE "active_generation_leases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "request_limit_counters" (
	"tenant_id" text NOT NULL,
	"scope_kind" text NOT NULL,
	"scope_id" text NOT NULL,
	"counter_kind" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "request_limit_counters_pkey" PRIMARY KEY("tenant_id","scope_kind","scope_id","counter_kind","window_start"),
	CONSTRAINT "request_limit_counters_scope_kind_check" CHECK (scope_kind = ANY (ARRAY['teacher'::text, 'tenant'::text, 'session'::text])),
	CONSTRAINT "request_limit_counters_counter_kind_check" CHECK (counter_kind = ANY (ARRAY['generation-attempt'::text, 'provider-call'::text, 'authoring-request'::text])),
	CONSTRAINT "request_limit_counters_count_check" CHECK (count >= 0),
	CONSTRAINT "request_limit_counters_window_check" CHECK (window_end > window_start)
);
--> statement-breakpoint
ALTER TABLE "request_limit_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "active_generation_leases_expiry_idx" ON "active_generation_leases" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "request_limit_counters_expiry_idx" ON "request_limit_counters" USING btree ("tenant_id","window_end");--> statement-breakpoint
CREATE POLICY "active_generation_leases_are_tenant_scoped" ON "active_generation_leases" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));--> statement-breakpoint
CREATE POLICY "request_limit_counters_are_tenant_scoped" ON "request_limit_counters" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_setting('app.tenant_id'::text, true)));