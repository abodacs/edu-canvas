create table if not exists tenants (
  id text primary key,
  slug text not null unique,
  name text not null,
  synthetic_data_only boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists identities (
  id text primary key,
  tenant_id text not null references tenants (id),
  role text not null check (role in ('teacher', 'student')),
  display_name text not null,
  demo_handle text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table if not exists standards (
  id text primary key,
  tenant_id text not null references tenants (id),
  code text not null,
  name text not null,
  subject text not null,
  grade_band text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, id)
);

create table if not exists prerequisite_nodes (
  id text primary key,
  tenant_id text not null references tenants (id),
  standard_id text not null,
  label text not null,
  sequence integer not null check (sequence > 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, standard_id)
    references standards (tenant_id, id)
);

create table if not exists prerequisite_edges (
  tenant_id text not null references tenants (id),
  prerequisite_id text not null,
  successor_id text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, prerequisite_id, successor_id),
  foreign key (tenant_id, prerequisite_id)
    references prerequisite_nodes (tenant_id, id),
  foreign key (tenant_id, successor_id)
    references prerequisite_nodes (tenant_id, id),
  check (prerequisite_id <> successor_id)
);

create table if not exists activities (
  id text primary key,
  tenant_id text not null references tenants (id),
  slug text not null,
  standard_id text not null,
  title text not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (tenant_id, id),
  foreign key (tenant_id, standard_id)
    references standards (tenant_id, id)
);

create table if not exists activity_versions (
  id text primary key,
  tenant_id text not null references tenants (id),
  activity_id text not null,
  version_number integer not null check (version_number > 0),
  catalog_version text not null,
  graph_version text not null,
  public_content jsonb not null,
  -- Deliberately separate from public_content. This column is server-only.
  answer_key jsonb not null,
  immutable_at timestamptz not null default now(),
  unique (activity_id, version_number),
  unique (tenant_id, id),
  foreign key (tenant_id, activity_id)
    references activities (tenant_id, id)
);

create table if not exists attempts (
  id text primary key,
  tenant_id text not null references tenants (id),
  activity_version_id text not null,
  student_id text not null,
  event_log jsonb not null default '[]'::jsonb,
  score integer check (score between 0 and 100),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, activity_version_id)
    references activity_versions (tenant_id, id),
  foreign key (tenant_id, student_id)
    references identities (tenant_id, id)
);

create index if not exists identities_tenant_idx on identities (tenant_id);
create index if not exists standards_tenant_idx on standards (tenant_id);
create index if not exists graph_nodes_tenant_idx on prerequisite_nodes (tenant_id);
create index if not exists graph_edges_tenant_idx on prerequisite_edges (tenant_id);
create index if not exists activities_tenant_idx on activities (tenant_id);
create index if not exists activity_versions_tenant_idx on activity_versions (tenant_id);
create index if not exists attempts_tenant_idx on attempts (tenant_id);

alter table tenants enable row level security;
alter table tenants force row level security;
alter table identities enable row level security;
alter table identities force row level security;
alter table standards enable row level security;
alter table standards force row level security;
alter table prerequisite_nodes enable row level security;
alter table prerequisite_nodes force row level security;
alter table prerequisite_edges enable row level security;
alter table prerequisite_edges force row level security;
alter table activities enable row level security;
alter table activities force row level security;
alter table activity_versions enable row level security;
alter table activity_versions force row level security;
alter table attempts enable row level security;
alter table attempts force row level security;

create policy tenants_are_tenant_scoped on tenants
  using (id = current_setting('app.tenant_id', true));

create policy identities_are_tenant_scoped on identities
  using (tenant_id = current_setting('app.tenant_id', true));

create policy standards_are_tenant_scoped on standards
  using (tenant_id = current_setting('app.tenant_id', true));

create policy graph_nodes_are_tenant_scoped on prerequisite_nodes
  using (tenant_id = current_setting('app.tenant_id', true));

create policy graph_edges_are_tenant_scoped on prerequisite_edges
  using (tenant_id = current_setting('app.tenant_id', true));

create policy activities_are_tenant_scoped on activities
  using (tenant_id = current_setting('app.tenant_id', true));

create policy activity_versions_are_tenant_scoped on activity_versions
  using (tenant_id = current_setting('app.tenant_id', true));

create policy attempts_are_tenant_scoped on attempts
  using (tenant_id = current_setting('app.tenant_id', true));

create or replace function prevent_immutable_foundation_row_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Immutable foundation rows cannot be changed: %', TG_TABLE_NAME;
end;
$$;

create trigger activity_versions_are_immutable
before update or delete on activity_versions
for each row execute function prevent_immutable_foundation_row_change();

create trigger attempts_are_immutable
before update or delete on attempts
for each row execute function prevent_immutable_foundation_row_change();
