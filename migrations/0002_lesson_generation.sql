create table if not exists lesson_draft_requests (
  id text primary key,
  tenant_id text not null,
  teacher_id text not null,
  prompt text not null,
  grade integer not null check (grade between 3 and 6),
  standard_id text not null,
  language text not null check (language in ('en', 'ar')),
  difficulty text not null check (difficulty in ('support', 'on-level', 'stretch')),
  state text not null check (
    state in (
      'requested',
      'generating',
      'ready-for-review',
      'blocked-by-validation',
      'blocked-by-moderation',
      'failed-retryable',
      'failed-terminal'
    )
  ),
  attempt integer not null check (attempt >= 0),
  diagnostics jsonb not null default '[]'::jsonb,
  -- This is server-owned canonical content. It is never selected by a browser route.
  draft jsonb,
  provenance jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (tenant_id, id),
  foreign key (tenant_id, teacher_id)
    references identities (tenant_id, id),
  foreign key (tenant_id, standard_id)
    references standards (tenant_id, id)
);

create table if not exists lesson_generation_attempts (
  request_id text not null,
  tenant_id text not null,
  attempt_number integer not null check (attempt_number > 0),
  idempotency_key text not null,
  state text not null check (
    state in (
      'generating',
      'ready-for-review',
      'blocked-by-validation',
      'blocked-by-moderation',
      'failed-retryable',
      'failed-terminal'
    )
  ),
  correction_attempted boolean not null default false,
  diagnostics jsonb not null default '[]'::jsonb,
  provenance jsonb,
  created_at timestamptz not null,
  primary key (request_id, attempt_number),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, request_id)
    references lesson_draft_requests (tenant_id, id)
);

create index if not exists lesson_draft_requests_tenant_idx
  on lesson_draft_requests (tenant_id, updated_at desc);

create index if not exists lesson_generation_attempts_tenant_idx
  on lesson_generation_attempts (tenant_id, created_at desc);

alter table lesson_draft_requests enable row level security;
alter table lesson_draft_requests force row level security;
alter table lesson_generation_attempts enable row level security;
alter table lesson_generation_attempts force row level security;

create policy lesson_draft_requests_are_tenant_scoped
  on lesson_draft_requests
  using (tenant_id = current_setting('app.tenant_id', true));

create policy lesson_generation_attempts_are_tenant_scoped
  on lesson_generation_attempts
  using (tenant_id = current_setting('app.tenant_id', true));
