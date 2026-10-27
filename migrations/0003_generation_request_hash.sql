-- Request hashes make changed-input idempotency conflicts explicit and let
-- moderation lookups find an unchanged blocked request. Legacy attempts stay
-- readable because the column is nullable and the codec derives the hash.
alter table lesson_generation_attempts
  add column if not exists request_hash text;

create index if not exists lesson_generation_attempts_request_hash_idx
  on lesson_generation_attempts (tenant_id, request_hash, created_at desc);
