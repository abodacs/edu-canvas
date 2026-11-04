#!/usr/bin/env bash
# Read-only snapshot of stored drafts and validation records in the local dev DB.
# Every statement runs with default_transaction_read_only=on.
set -euo pipefail
cd "$(dirname "$0")/../../../.."
export DATABASE_URL="$(grep -E "^DATABASE_URL=" .env | head -1 | cut -d= -f2- | tr -d "\"'")"
DB=$(python3 -I -c "import os,urllib.parse as u;print(u.urlparse(os.environ['DATABASE_URL']).path.lstrip('/'))")
US=$(python3 -I -c "import os,urllib.parse as u;print(u.urlparse(os.environ['DATABASE_URL']).username)")
Q(){ echo "-- $1"; docker exec -e PGOPTIONS='-c default_transaction_read_only=on' edu-canvas-postgres-1 psql -U "$US" -d "$DB" -X -A -F '|' -c "$1"; echo; }
Q "select id, tenant_id, code, name, subject, grade_band from standards order by id"
Q "select id, label, sequence from prerequisite_nodes order by sequence"
Q "select prerequisite_id, successor_id from prerequisite_edges"
Q "select id, catalog_version, graph_version from activity_versions"
Q "select standard_id, state, count(*) from lesson_draft_requests group by 1,2 order by 1,2"
Q "select provenance->>'model' as model, provenance->>'provider' as provider, count(*) from lesson_draft_requests group by 1,2 order by 3 desc"
Q "select d->>'code' as code, d->>'severity' as sev, count(*) from lesson_draft_requests r, jsonb_array_elements(r.diagnostics) d group by 1,2 order by 3 desc"
Q "select count(*) as drafts_with_any_non_fraction_label from lesson_draft_requests r, jsonb_array_elements(r.draft->'variants') v, jsonb_array_elements(v->'sourceItems') s where (s->>'label') !~ '^\s*\d+\s*/\s*\d+\s*$'"
Q "select state, correction_attempted, count(*) from lesson_generation_attempts group by 1,2 order by 1,2"
Q "select round(extract(epoch from (updated_at-created_at))::numeric,1) as secs, state, provenance->>'model' m from lesson_draft_requests where provenance->>'model' like 'muse%' order by created_at"
Q "select r.id, r.provenance->>'model' m, t->>'label' as target_label from lesson_draft_requests r, jsonb_array_elements(r.draft->'variants') v, jsonb_array_elements(v->'targetItems') t where (t->>'label') !~ '^\s*\d+\s*/\s*\d+\s*$' limit 12"
Q "select r.provenance->>'model' m, r.state, round(extract(epoch from (r.updated_at-r.created_at))::numeric,1) secs from lesson_draft_requests r where r.provenance->>'provider'='openai' order by r.created_at"
Q "select count(*) filter (where draft is not null) with_draft, count(*) total from lesson_draft_requests"
