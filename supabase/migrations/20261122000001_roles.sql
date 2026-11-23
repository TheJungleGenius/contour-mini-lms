-- =============================================================================
-- Roles (RBAC)
--
-- A user's role lives in its own table that end users can read but never write.
-- A Custom Access Token Hook copies the role into the JWT as the `user_role`
-- claim, so the app (proxy, route handlers) and RLS policies can authorise
-- without an extra query. The role is never read from `user_metadata`, which
-- users can edit themselves.
-- =============================================================================

create type public.app_role as enum ('student', 'admin');

create table public.user_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       public.app_role not null default 'student',
  created_at timestamptz not null default now()
);

comment on table public.user_roles is
  'One role per user. Writable only by privileged roles (migrations, seed, dashboard), never via the Data API.';

alter table public.user_roles enable row level security;

-- Supabase grants every privilege on new public tables to anon/authenticated by
-- default. Revoke and re-grant explicitly: least privilege at the GRANT layer,
-- row filtering at the RLS layer.
revoke all on table public.user_roles from anon, authenticated;
grant select on table public.user_roles to authenticated;

create policy "Users can read their own role"
  on public.user_roles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Custom Access Token Hook: adds `user_role` to every issued JWT.
-- Enabled in supabase/config.toml ([auth.hook.custom_access_token]).
-- -----------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims    jsonb;
  user_role public.app_role;
begin
  select ur.role
    into user_role
    from public.user_roles ur
   where ur.user_id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  -- Users with no role row get the least-privileged role.
  claims := jsonb_set(claims, '{user_role}', to_jsonb(coalesce(user_role, 'student'::public.app_role)));

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant select on table public.user_roles to supabase_auth_admin;

create policy "Auth server can read roles for token issuance"
  on public.user_roles
  for select
  to supabase_auth_admin
  using (true);

-- -----------------------------------------------------------------------------
-- Helpers for RLS policies. They read the signed JWT claim, so a policy check
-- costs nothing per row (wrap calls in `(select ...)` so Postgres caches them
-- once per statement).
-- -----------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'user_role', '')::public.app_role,
    'student'::public.app_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.current_app_role() = 'admin'::public.app_role;
$$;

revoke execute on function public.current_app_role() from anon, public;
revoke execute on function public.is_admin() from anon, public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
