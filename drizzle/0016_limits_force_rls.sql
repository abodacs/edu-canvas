-- The Drizzle snapshot can enable RLS but cannot force it. #104 tables carry
-- the same forced-RLS guarantee as the rest of the foundation so the
-- application role cannot read another tenant's counters.
alter table "request_limit_counters" force row level security;
--> statement-breakpoint
alter table "active_generation_leases" force row level security;
