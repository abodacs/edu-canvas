# Drizzle schema snapshot

`schema.ts` and `meta/` are the Drizzle representation captured from a
disposable PostgreSQL database after the authoritative SQL migrations and
synthetic seed ran. The composite tenant-key definitions were reviewed against
`migrations/0001_foundation.sql` and `migrations/0002_lesson_generation.sql`.

This directory intentionally contains no executable Drizzle migration SQL. The
SQL files in `migrations/` remain the only schema bootstrap and migration
authority for this repository. Treat `schema.ts` as a query-typing snapshot,
not as permission to replace the hand-written RLS policies, triggers, functions,
or constraints in the authoritative migrations.
The metadata journal is retained only to describe this introspection baseline;
there is deliberately no matching SQL migration to replay.
Drizzle Kit's migration log is intentionally configured to a separate
`drizzle.__edu_canvas_drizzle_migrations` table for a future ownership change;
this issue does not grant Drizzle migration ownership.
