-- =============================================================================
-- RLS reads the live role from user_roles, not the JWT claim
--
-- The `user_role` claim is a snapshot from when the token was issued. With RLS
-- reading the claim, a demoted admin kept admin access until their token
-- refreshed (up to jwt_expiry, 1 hour). The database is the final guarantee,
-- so it now checks user_roles directly.
--
-- Cost: one primary-key lookup per statement, not per row. Every policy calls
-- these helpers wrapped in `(select ...)`, which Postgres runs once as an
-- initplan.
--
-- The claim stays. The proxy and the page/API guards use it for routing and to
-- reject early. If it's stale, the database still decides what data is visible.
-- =============================================================================

-- SECURITY INVOKER (the default): users can read their own user_roles row
-- through RLS, which is all this needs.
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select ur.role from public.user_roles ur where ur.user_id = (select auth.uid())),
    'student'::public.app_role
  );
$$;

-- is_admin() calls current_app_role(), so it picks up the change as is.
-- `create or replace` keeps the existing EXECUTE grants.
