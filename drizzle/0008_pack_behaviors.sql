-- Behaviors the Drizzle snapshot cannot express for the #5 pack records:
-- forced row-level security and append-only triggers. Versions, approvals,
-- publications, assignments, and receipts are append-only facts; a revision
-- inserts a new version row instead of updating one.
alter table "pack_versions" force row level security;
--> statement-breakpoint
alter table "pack_approvals" force row level security;
--> statement-breakpoint
alter table "pack_publications" force row level security;
--> statement-breakpoint
alter table "pack_assignments" force row level security;
--> statement-breakpoint
alter table "pack_receipts" force row level security;
--> statement-breakpoint
create trigger pack_versions_are_immutable
before update or delete on "pack_versions"
for each row execute function prevent_immutable_foundation_row_change();
--> statement-breakpoint
create trigger pack_approvals_are_immutable
before update or delete on "pack_approvals"
for each row execute function prevent_immutable_foundation_row_change();
--> statement-breakpoint
create trigger pack_publications_are_immutable
before update or delete on "pack_publications"
for each row execute function prevent_immutable_foundation_row_change();
--> statement-breakpoint
create trigger pack_assignments_are_immutable
before update or delete on "pack_assignments"
for each row execute function prevent_immutable_foundation_row_change();
--> statement-breakpoint
create trigger pack_receipts_are_immutable
before update or delete on "pack_receipts"
for each row execute function prevent_immutable_foundation_row_change();
