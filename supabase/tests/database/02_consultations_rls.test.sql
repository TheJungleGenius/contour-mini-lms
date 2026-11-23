-- Consultations access matrix: students see and manage only their own rows,
-- admins read everything but write nothing, anon gets nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Fixtures (as postgres) ----------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'a@test.dev', '{"first_name":"Alice","last_name":"A"}'),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'b@test.dev', '{"first_name":"Bob","last_name":"B"}'),
  ('cccccccc-0000-4000-a000-000000000001', 'admin@test.dev', '{"first_name":"Ada","last_name":"Admin"}');

update public.user_roles set role = 'admin'
 where user_id = 'cccccccc-0000-4000-a000-000000000001';

insert into public.consultations (id, student_id, first_name, last_name, reason, scheduled_at) values
  ('aaaaaaaa-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000001',
     'Alice', 'A', 'Alice existing', now() + interval '2 days'),
  ('bbbbbbbb-1111-4000-a000-000000000001', 'bbbbbbbb-0000-4000-a000-000000000001',
     'Bob', 'B', 'Bob existing', now() + interval '3 days');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.consultations'::regclass),
  'RLS is enabled on consultations'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is enabled on profiles'
);

-- As student A ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"aaaaaaaa-0000-4000-a000-000000000001","role":"authenticated","user_role":"student"}';

select results_eq(
  $$ select id from public.consultations $$,
  $$ values ('aaaaaaaa-1111-4000-a000-000000000001'::uuid) $$,
  'A student sees only their own consultations'
);

select is_empty(
  $$ select 1 from public.consultations where id = 'bbbbbbbb-1111-4000-a000-000000000001' $$,
  'A student cannot read another student''s consultation by id'
);

select lives_ok(
  $$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
     values ('Alice', 'A', 'Alice new booking', now() + interval '1 day') $$,
  'A student can book a consultation'
);

select is(
  (select student_id from public.consultations where reason = 'Alice new booking'),
  'aaaaaaaa-0000-4000-a000-000000000001'::uuid,
  'student_id comes from auth.uid(), not the client'
);

select throws_ok(
  $$ insert into public.consultations (student_id, first_name, last_name, reason, scheduled_at)
     values ('bbbbbbbb-0000-4000-a000-000000000001', 'Bob', 'B', 'Spoofed', now() + interval '1 day') $$,
  '42501', null,
  'A student cannot book on behalf of someone else'
);

select is_empty(
  $$ update public.consultations set status = 'cancelled'
      where id = 'bbbbbbbb-1111-4000-a000-000000000001' returning id $$,
  'A student cannot update another student''s consultation'
);

select throws_ok(
  $$ update public.consultations set student_id = 'bbbbbbbb-0000-4000-a000-000000000001'
      where id = 'aaaaaaaa-1111-4000-a000-000000000001' $$,
  '42501', null,
  'A student cannot reassign ownership'
);

select throws_ok(
  $$ update public.consultations set reason = 'edited'
      where id = 'aaaaaaaa-1111-4000-a000-000000000001' $$,
  '42501', null,
  'A student cannot edit columns outside status/scheduled_at'
);

select throws_ok(
  $$ update public.consultations set completed_at = now()
      where id = 'aaaaaaaa-1111-4000-a000-000000000001' $$,
  '42501', null,
  'A student cannot write derived audit columns'
);

select throws_ok(
  $$ delete from public.consultations where id = 'aaaaaaaa-1111-4000-a000-000000000001' $$,
  '42501', null,
  'A student cannot hard-delete (cancel is a soft delete)'
);

select lives_ok(
  $$ update public.consultations set status = 'completed'
      where id = 'aaaaaaaa-1111-4000-a000-000000000001' $$,
  'A student can update their own consultation'
);

select results_eq(
  $$ select id from public.profiles $$,
  $$ values ('aaaaaaaa-0000-4000-a000-000000000001'::uuid) $$,
  'A student sees only their own profile'
);

-- As admin ----------------------------------------------------------------------
set local request.jwt.claims to
  '{"sub":"cccccccc-0000-4000-a000-000000000001","role":"authenticated","user_role":"admin"}';

-- Scoped to this file's fixture users so the assertions hold whether or not
-- seed data is present.
select is(
  (select count(*) from public.consultations
    where student_id in ('aaaaaaaa-0000-4000-a000-000000000001',
                         'bbbbbbbb-0000-4000-a000-000000000001')),
  3::bigint,
  'An admin sees every student''s consultations'
);

select is(
  (select count(*) from public.profiles
    where id in ('aaaaaaaa-0000-4000-a000-000000000001',
                 'bbbbbbbb-0000-4000-a000-000000000001',
                 'cccccccc-0000-4000-a000-000000000001')),
  3::bigint,
  'An admin sees every profile'
);

select throws_ok(
  $$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
     values ('Ada', 'Admin', 'Admin booking', now() + interval '1 day') $$,
  '42501', null,
  'An admin cannot create consultations (admin view is read-only)'
);

select is_empty(
  $$ update public.consultations set status = 'cancelled'
      where id = 'bbbbbbbb-1111-4000-a000-000000000001' returning id $$,
  'An admin cannot modify consultations'
);

-- Forged role claim: a user_role claim with no admin row behind it would need a
-- validly signed JWT, which only the auth server can issue (the hook reads the
-- role from user_roles). Here we check the RLS side: a student token does not
-- see admin data.
set local request.jwt.claims to
  '{"sub":"bbbbbbbb-0000-4000-a000-000000000001","role":"authenticated","user_role":"student"}';

select results_eq(
  $$ select id from public.consultations $$,
  $$ values ('bbbbbbbb-1111-4000-a000-000000000001'::uuid) $$,
  'A second student is equally isolated'
);

-- RLS reads the live role from user_roles, not the token's user_role claim.
set local request.jwt.claims to
  '{"sub":"bbbbbbbb-0000-4000-a000-000000000001","role":"authenticated","user_role":"admin"}';

select results_eq(
  $$ select id from public.consultations $$,
  $$ values ('bbbbbbbb-1111-4000-a000-000000000001'::uuid) $$,
  'A user_role=admin claim without an admin row grants nothing'
);

-- Demote the admin while their (still valid) token says admin.
reset role;
update public.user_roles set role = 'student'
 where user_id = 'cccccccc-0000-4000-a000-000000000001';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"cccccccc-0000-4000-a000-000000000001","role":"authenticated","user_role":"admin"}';

select is_empty(
  $$ select id from public.consultations $$,
  'A demoted admin loses access immediately, before their token expires'
);

-- As anon -----------------------------------------------------------------------
reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$ select * from public.consultations $$,
  '42501', null,
  'Anonymous users cannot read consultations'
);

select throws_ok(
  $$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
     values ('X', 'Y', 'anon', now() + interval '1 day') $$,
  '42501', null,
  'Anonymous users cannot book consultations'
);

-- Verify as postgres that the blocked writes really changed nothing --------------
reset role;

select is(
  (select status from public.consultations where id = 'bbbbbbbb-1111-4000-a000-000000000001'),
  'scheduled'::public.consultation_status,
  'Blocked updates left the other student''s consultation untouched'
);

select * from finish();
rollback;
