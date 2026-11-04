-- Behaviors the Drizzle snapshot cannot express for standard groundings (#218):
-- forced row-level security and append-only enforcement. Keep schema-visible DDL
-- in drizzle/schema.ts; Drizzle never records it from a custom migration.
--
-- Every grounding write carries a tenant context, so forcing RLS means the
-- application role cannot bypass the tenant policy even when it owns the table.
alter table "standard_groundings" force row level security;

-- A re-retrieval appends a new row linked through predecessor_grounding_id.
-- Superseded rows stay readable, so no row may be updated or deleted.
create trigger standard_groundings_are_immutable
before update or delete on "standard_groundings"
for each row execute function prevent_immutable_foundation_row_change();
