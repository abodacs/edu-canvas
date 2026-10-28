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
