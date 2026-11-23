-- RBAC: default role assignment, the JWT hook, and that users can't escalate.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- Fixtures (as postgres). The sign-up trigger creates profiles and roles.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'student@test.dev',
     '{"first_name":"Alice","last_name":"Student","role":"admin","user_role":"admin"}'),
  ('cccccccc-0000-4000-a000-000000000001', 'admin@test.dev',
     '{"first_name":"Ada","last_name":"Admin"}');

update public.user_roles set role = 'admin'
 where user_id = 'cccccccc-0000-4000-a000-000000000001';

-- Sign-up trigger -------------------------------------------------------------
select is(
  (select role from public.user_roles where user_id = 'aaaaaaaa-0000-4000-a000-000000000001'),
  'student'::public.app_role,
  'New users are students even when sign-up metadata claims admin'
);

select is(
  (select first_name || ' ' || last_name || ' <' || email || '>'
     from public.profiles where id = 'aaaaaaaa-0000-4000-a000-000000000001'),
  'Alice Student <student@test.dev>',
  'Profile is created from sign-up metadata'
);

-- Custom access token hook ----------------------------------------------------
select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'aaaaaaaa-0000-4000-a000-000000000001',
    'claims',  jsonb_build_object('sub', 'aaaaaaaa-0000-4000-a000-000000000001')
  )) -> 'claims' ->> 'user_role',
  'student',
  'Hook adds user_role=student for students'
);

select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'cccccccc-0000-4000-a000-000000000001',
    'claims',  jsonb_build_object('sub', 'cccccccc-0000-4000-a000-000000000001')
  )) -> 'claims' ->> 'user_role',
  'admin',
  'Hook adds user_role=admin for admins'
);

select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'ffffffff-0000-4000-a000-000000000001',
    'claims',  '{}'::jsonb
  )) -> 'claims' ->> 'user_role',
  'student',
  'Hook falls back to the least-privileged role when no role row exists'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_roles'::regclass),
  'RLS is enabled on user_roles'
);

-- As a student ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"aaaaaaaa-0000-4000-a000-000000000001","role":"authenticated","user_role":"student"}';

select results_eq(
  $$ select user_id from public.user_roles $$,
  $$ values ('aaaaaaaa-0000-4000-a000-000000000001'::uuid) $$,
  'Users can read only their own role'
);

select throws_ok(
  $$ update public.user_roles set role = 'admin'
      where user_id = 'aaaaaaaa-0000-4000-a000-000000000001' $$,
  '42501', null,
  'Students cannot promote themselves'
);

select throws_ok(
  $$ insert into public.user_roles (user_id, role)
     values ('aaaaaaaa-0000-4000-a000-000000000001', 'admin') $$,
  '42501', null,
  'Students cannot insert role rows'
);

-- As anon -----------------------------------------------------------------------
reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$ select * from public.user_roles $$,
  '42501', null,
  'Anonymous users cannot read roles'
);

select * from finish();
rollback;
