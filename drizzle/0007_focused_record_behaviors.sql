-- Behaviors the Drizzle snapshot cannot express for the focused-loop records:
-- forced row-level security and append-only enforcement. Keep schema-visible DDL
-- in drizzle/schema.ts; Drizzle never records it from a custom migration.
--
-- These tables are always written with a tenant context, unlike the identity
-- tables whose pre-tenant lookups require the owner exemption. Forcing RLS here
-- means the application role cannot bypass the tenant policy even when it owns
-- the table.
alter table "curated_references" force row level security;
alter table "lesson_packages" force row level security;
alter table "lesson_versions" force row level security;
alter table "publications" force row level security;
alter table "assignments" force row level security;
alter table "learner_runs" force row level security;
alter table "assistance_events" force row level security;
alter table "learner_attempts" force row level security;
alter table "teacher_decisions" force row level security;
alter table "operation_receipts" force row level security;

-- Evidence is append-only. lesson_packages (head revision) and learner_runs
-- (progress revision) are deliberately mutable and have no trigger; their writes
-- go through a revision compare-and-set.
create trigger curated_references_are_immutable
before update or delete on "curated_references"
for each row execute function prevent_immutable_foundation_row_change();

create trigger lesson_versions_are_immutable
before update or delete on "lesson_versions"
for each row execute function prevent_immutable_foundation_row_change();

create trigger publications_are_immutable
before update or delete on "publications"
for each row execute function prevent_immutable_foundation_row_change();

create trigger assignments_are_immutable
before update or delete on "assignments"
for each row execute function prevent_immutable_foundation_row_change();

create trigger assistance_events_are_immutable
before update or delete on "assistance_events"
for each row execute function prevent_immutable_foundation_row_change();

create trigger learner_attempts_are_immutable
before update or delete on "learner_attempts"
for each row execute function prevent_immutable_foundation_row_change();

create trigger teacher_decisions_are_immutable
before update or delete on "teacher_decisions"
for each row execute function prevent_immutable_foundation_row_change();

create trigger operation_receipts_are_immutable
before update or delete on "operation_receipts"
for each row execute function prevent_immutable_foundation_row_change();
