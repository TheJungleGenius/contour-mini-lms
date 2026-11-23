-- Hardening from migration …07: whitespace-only text is rejected, cancelled
-- rows are fully immutable, and the trigger function isn't directly executable.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
  ('eeeeeeee-0000-4000-a000-000000000001', 'e@test.dev', '{"first_name":"Eve","last_name":"E"}');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"eeeeeeee-0000-4000-a000-000000000001","role":"authenticated","user_role":"student"}';

-- Whitespace-only text (direct Data API callers skip Zod) -------------------------
select throws_ok(
  $$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
     values ('   ', 'E', 'Reason', now() + interval '1 day') $$,
  '23514', null,
  'A whitespace-only first name is rejected'
);
select throws_ok(
  $$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
     values ('Eve', 'E', E' \t\n ', now() + interval '1 day') $$,
  '23514', null,
  'A whitespace-only reason is rejected'
);
select lives_ok(
  $$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
     values ('Eve', 'E', 'Real reason', now() + interval '2 days') $$,
  'Normal text is still accepted'
);

-- Cancelled rows are immutable ---------------------------------------------------
update public.consultations set status = 'cancelled' where reason = 'Real reason';

select throws_ok(
  $$ update public.consultations set status = 'cancelled' where reason = 'Real reason' $$,
  'CN001', null,
  'A no-op update on a cancelled consultation is rejected'
);

reset role;
select isnt(
  (select cancelled_at from public.consultations where reason = 'Real reason'),
  null,
  'The cancelled row keeps its cancelled_at'
);

-- Least privilege ----------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.consultations_enforce_rules()', 'execute'),
  'anon cannot execute the trigger function'
);
select ok(
  not has_function_privilege('authenticated', 'public.consultations_enforce_rules()', 'execute'),
  'authenticated cannot execute the trigger function'
);
select ok(
  not exists (
    select 1 from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public'
  ),
  'anon has no privileges on any public table'
);

select * from finish();
rollback;
