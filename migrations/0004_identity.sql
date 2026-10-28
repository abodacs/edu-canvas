-- Server-owned identity persistence (issue #98, spec §5 "Identity ownership and
-- provisioning" and §8 "Database authority and atomic effects"). Forward and
-- idempotent: apply forward on an existing synthetic database; rerunning is safe.

-- An actor is an identity that may hold memberships in zero or more schools. It
-- is deliberately NOT tenant-scoped: binding an actor to one tenant would stop a
-- teacher from working in a second school, would duplicate identity before #99
-- provisions the first membership, and cannot be verified before a tenant is
-- known. A teacher self-signup therefore creates an actor with no membership and
-- no authority (spec D-10).
create table if not exists actors (
  id text primary key,
  display_name text not null,
  is_active boolean not null default true,
  authorization_revision integer not null default 1 check (authorization_revision >= 0),
  created_at timestamptz not null default now()
);

-- A provider binding maps a configured provider issuer/subject to an actor. It is
-- deliberately NOT tenant-scoped: the binding is the pre-tenant credential step
-- that proves which actor a verified provider subject represents, before any
-- school membership is selected. Never bind by email, display name, or other
-- untrusted metadata (spec §5). The primary key makes one subject belong to one
-- actor; the unique key makes one actor hold one subject per issuer.
create table if not exists provider_bindings (
  provider_issuer text not null,
  provider_subject text not null,
  actor_id text not null references actors (id),
  created_at timestamptz not null default now(),
  primary key (provider_issuer, provider_subject),
  unique (actor_id, provider_issuer)
);

create table if not exists memberships (
  id text primary key,
  actor_id text not null references actors (id),
  tenant_id text not null references tenants (id),
  role text not null check (role in ('teacher', 'student')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  -- A learner membership references its tenant-local domain identity; nothing
  -- lets a login request choose or override that identity.
  learner_id text,
  revision integer not null default 1 check (revision >= 0),
  created_at timestamptz not null default now(),
  unique (actor_id, tenant_id, role),
  unique (tenant_id, id),
  foreign key (tenant_id, learner_id)
    references identities (tenant_id, id)
);

create table if not exists class_assignments (
  membership_id text not null,
  class_id text not null,
  tenant_id text not null references tenants (id),
  created_at timestamptz not null default now(),
  primary key (membership_id, class_id),
  -- The membership and the class must be in the same tenant (spec §5).
  foreign key (tenant_id, membership_id)
    references memberships (tenant_id, id)
);

create table if not exists identity_sessions (
  session_id text primary key,
  verifier_hash text not null unique,
  actor_id text not null references actors (id),
  membership_id text not null,
  tenant_id text not null references tenants (id),
  provider_session_id text not null,
  provider_subject text not null,
  session_generation text not null,
  authorization_revision integer not null,
  revision integer not null default 1 check (revision >= 0),
  provider_credentials_ciphertext text,
  created_at timestamptz not null,
  last_activity_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  unique (tenant_id, membership_id, session_id),
  foreign key (tenant_id, membership_id)
    references memberships (tenant_id, id)
);

create table if not exists pending_authentications (
  pending_id text primary key,
  verifier_hash text not null unique,
  actor_id text not null references actors (id),
  memberships jsonb not null,
  provider_session_id text not null,
  provider_subject text not null,
  provider_credentials_ciphertext text,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);

-- Operator/service audit of trusted provisioning. Not tenant-scoped: an entry
-- records the provisioning principal and target identifiers, not school content.
-- It never carries credentials or learner content (spec §5).
create table if not exists provisioning_audit (
  id text primary key,
  principal text not null,
  operation text not null,
  target_id text not null,
  result text not null,
  request_id text not null,
  created_at timestamptz not null
);

create index if not exists memberships_actor_idx on memberships (actor_id);
create index if not exists memberships_tenant_idx on memberships (tenant_id);
create index if not exists class_assignments_membership_idx on class_assignments (membership_id);
create index if not exists identity_sessions_actor_idx on identity_sessions (actor_id);
create index if not exists provider_bindings_actor_idx on provider_bindings (actor_id);

-- Row-level security on the identity tables is ENABLED but deliberately NOT
-- FORCED. These tables are reached before a tenant is known (the credential
-- verifier step) or without any single tenant context (an actor's memberships
-- span schools), so the `app.tenant_id` predicate below cannot be satisfied for
-- those reads. Without FORCE, the table owner — which is also the owner of the
-- SECURITY DEFINER functions below — is exempt from the policy, so the
-- pre-tenant lookup works. Any non-owner runtime role is still scoped by the
-- policy. The least-privilege role split that replaces the owner connection is
-- issue #100's gate; re-enable FORCE with a dedicated definer owner when it lands.
alter table memberships enable row level security;
alter table class_assignments enable row level security;
alter table identity_sessions enable row level security;

drop policy if exists memberships_are_tenant_scoped on memberships;
create policy memberships_are_tenant_scoped on memberships
  using (tenant_id = current_setting('app.tenant_id', true));

drop policy if exists class_assignments_are_tenant_scoped on class_assignments;
create policy class_assignments_are_tenant_scoped on class_assignments
  using (tenant_id = current_setting('app.tenant_id', true));

drop policy if exists identity_sessions_are_tenant_scoped on identity_sessions;
create policy identity_sessions_are_tenant_scoped on identity_sessions
  using (tenant_id = current_setting('app.tenant_id', true));

-- The functions below exist for the two steps the runtime cannot take under
-- tenant row-level security: the pre-tenant credential-verifier lookup (spec §8)
-- and the id-scoped reads/writes the identity port performs before or without a
-- single tenant context. Each fixes namespace resolution, revokes public
-- execution, and returns at most one row for one opaque server-owned key. The
-- least-privilege role split (a dedicated definer owner granted only to the
-- intended roles) is issue #100's gate; this migration only establishes the
-- shape and the revoke.
create or replace function identity_lookup_session(p_verifier_hash text)
returns table (
  session_id text,
  verifier_hash text,
  actor_id text,
  membership_id text,
  tenant_id text,
  provider_session_id text,
  provider_subject text,
  session_generation text,
  authorization_revision integer,
  revision integer,
  provider_credentials_ciphertext text,
  created_at timestamptz,
  last_activity_at timestamptz,
  absolute_expires_at timestamptz,
  revoked_at timestamptz
)
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select
    session.session_id,
    session.verifier_hash,
    session.actor_id,
    session.membership_id,
    session.tenant_id,
    session.provider_session_id,
    session.provider_subject,
    session.session_generation,
    session.authorization_revision,
    session.revision,
    session.provider_credentials_ciphertext,
    session.created_at,
    session.last_activity_at,
    session.absolute_expires_at,
    session.revoked_at
  from public.identity_sessions as session
  where session.verifier_hash = p_verifier_hash
  limit 1;
$$;

create or replace function identity_lookup_pending(p_verifier_hash text)
returns table (
  pending_id text,
  verifier_hash text,
  actor_id text,
  memberships jsonb,
  provider_session_id text,
  provider_subject text,
  provider_credentials_ciphertext text,
  created_at timestamptz,
  expires_at timestamptz,
  consumed_at timestamptz
)
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select
    pending.pending_id,
    pending.verifier_hash,
    pending.actor_id,
    pending.memberships,
    pending.provider_session_id,
    pending.provider_subject,
    pending.provider_credentials_ciphertext,
    pending.created_at,
    pending.expires_at,
    pending.consumed_at
  from public.pending_authentications as pending
  where pending.verifier_hash = p_verifier_hash
  limit 1;
$$;

create or replace function identity_lookup_session_by_id(p_session_id text)
returns table (
  session_id text,
  verifier_hash text,
  actor_id text,
  membership_id text,
  tenant_id text,
  provider_session_id text,
  provider_subject text,
  session_generation text,
  authorization_revision integer,
  revision integer,
  provider_credentials_ciphertext text,
  created_at timestamptz,
  last_activity_at timestamptz,
  absolute_expires_at timestamptz,
  revoked_at timestamptz
)
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select
    session.session_id,
    session.verifier_hash,
    session.actor_id,
    session.membership_id,
    session.tenant_id,
    session.provider_session_id,
    session.provider_subject,
    session.session_generation,
    session.authorization_revision,
    session.revision,
    session.provider_credentials_ciphertext,
    session.created_at,
    session.last_activity_at,
    session.absolute_expires_at,
    session.revoked_at
  from public.identity_sessions as session
  where session.session_id = p_session_id
  limit 1;
$$;

create or replace function identity_lookup_membership(p_membership_id text)
returns table (
  membership_id text,
  actor_id text,
  tenant_id text,
  role text,
  status text,
  learner_id text,
  revision integer,
  tenant_name text
)
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select
    membership.id,
    membership.actor_id,
    membership.tenant_id,
    membership.role,
    membership.status,
    membership.learner_id,
    membership.revision,
    tenant.name
  from public.memberships as membership
  join public.tenants as tenant on tenant.id = membership.tenant_id
  where membership.id = p_membership_id
  limit 1;
$$;

create or replace function identity_list_actor_memberships(p_actor_id text)
returns table (
  membership_id text,
  actor_id text,
  tenant_id text,
  role text,
  status text,
  learner_id text,
  revision integer,
  tenant_name text
)
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select
    membership.id,
    membership.actor_id,
    membership.tenant_id,
    membership.role,
    membership.status,
    membership.learner_id,
    membership.revision,
    tenant.name
  from public.memberships as membership
  join public.tenants as tenant on tenant.id = membership.tenant_id
  where membership.actor_id = p_actor_id;
$$;

create or replace function identity_disable_actor(p_actor_id text, p_revoked_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  disabled integer;
begin
  update public.actors
  set is_active = false,
      authorization_revision = authorization_revision + 1
  where id = p_actor_id
  returning 1 into disabled;

  if disabled is null then
    return false;
  end if;

  update public.identity_sessions
  set revoked_at = coalesce(revoked_at, p_revoked_at),
      revision = revision + 1
  where actor_id = p_actor_id and revoked_at is null;

  return true;
end;
$$;

revoke all on function identity_lookup_session(text) from public;
revoke all on function identity_lookup_pending(text) from public;
revoke all on function identity_lookup_session_by_id(text) from public;
revoke all on function identity_lookup_membership(text) from public;
revoke all on function identity_list_actor_memberships(text) from public;
revoke all on function identity_disable_actor(text, timestamptz) from public;
