-- Behaviors the Drizzle snapshot cannot express: forced row-level security,
-- the immutable-row function, and its triggers. Keep schema-visible DDL in
-- schema.ts instead; Drizzle never records it from a custom migration.
alter table "tenants" force row level security;
--> statement-breakpoint
alter table "identities" force row level security;
--> statement-breakpoint
alter table "standards" force row level security;
--> statement-breakpoint
alter table "prerequisite_nodes" force row level security;
--> statement-breakpoint
alter table "prerequisite_edges" force row level security;
--> statement-breakpoint
alter table "activities" force row level security;
--> statement-breakpoint
alter table "activity_versions" force row level security;
--> statement-breakpoint
alter table "attempts" force row level security;
--> statement-breakpoint
alter table "lesson_draft_requests" force row level security;
--> statement-breakpoint
alter table "lesson_generation_attempts" force row level security;
--> statement-breakpoint
create or replace function prevent_immutable_foundation_row_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Immutable foundation rows cannot be changed: %', TG_TABLE_NAME;
end;
$$;
--> statement-breakpoint
create trigger activity_versions_are_immutable
before update or delete on "activity_versions"
for each row execute function prevent_immutable_foundation_row_change();
--> statement-breakpoint
create trigger attempts_are_immutable
before update or delete on "attempts"
for each row execute function prevent_immutable_foundation_row_change();
