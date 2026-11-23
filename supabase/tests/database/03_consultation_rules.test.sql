-- Consultation lifecycle rules enforced by the consultations_enforce_rules trigger.
--   scheduled <-> completed, scheduled -> cancelled (terminal); times must be future.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000001', 'a@test.dev', '{"first_name":"Alice","last_name":"A"}');

insert into public.consultations (id, student_id, first_name, last_name, reason, scheduled_at) values
  ('aaaaaaaa-1111-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000001',
     'Alice', 'A', 'Lifecycle', now() + interval '2 days'),
  ('aaaaaaaa-2222-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000001',
     'Alice', 'A', 'Completed one', now() + interval '4 days');

-- Even privileged writers can't insert a non-scheduled row.
select throws_ok(
  $$ insert into public.consultations (student_id, first_name, last_name, reason, scheduled_at, status)
     values ('aaaaaaaa-0000-4000-a000-000000000001', 'A', 'A', 'x', now() + interval '1 day', 'completed') $$,
  'CN001', null,
  'New consultations must start as scheduled'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"aaaaaaaa-0000-4000-a000-000000000001","role":"authenticated","user_role":"student"}';

select throws_ok(
  $$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
     values ('Alice', 'A', 'Past', now() - interval '1 hour') $$,
  'CN002', null,
  'Cannot book a consultation in the past'
);

-- scheduled -> completed -> scheduled ---------------------------------------------
select lives_ok(
  $$ update public.consultations set status = 'completed'
      where id = 'aaaaaaaa-1111-4000-a000-000000000001' $$,
  'scheduled -> completed is allowed'
);
select isnt(
  (select completed_at from public.consultations where id = 'aaaaaaaa-1111-4000-a000-000000000001'),
  null,
  'completed_at is set when completed'
);

select lives_ok(
  $$ update public.consultations set status = 'scheduled'
      where id = 'aaaaaaaa-1111-4000-a000-000000000001' $$,
  'completed -> scheduled (mark incomplete) is allowed'
);
select is(
  (select completed_at from public.consultations where id = 'aaaaaaaa-1111-4000-a000-000000000001'),
  null,
  'completed_at is cleared when marked incomplete'
);

-- reschedule ----------------------------------------------------------------------
select throws_ok(
  $$ update public.consultations set scheduled_at = now() - interval '1 day'
      where id = 'aaaaaaaa-1111-4000-a000-000000000001' $$,
  'CN002', null,
  'Cannot reschedule into the past'
);

select lives_ok(
  $$ update public.consultations set scheduled_at = now() + interval '7 days'
      where id = 'aaaaaaaa-1111-4000-a000-000000000001' $$,
  'Can reschedule a scheduled consultation to a future time'
);
select is(
  (select scheduled_at from public.consultations where id = 'aaaaaaaa-1111-4000-a000-000000000001'),
  now() + interval '7 days',
  'scheduled_at is updated'
);

-- completed rows: no cancel, no reschedule -----------------------------------------
update public.consultations set status = 'completed'
 where id = 'aaaaaaaa-2222-4000-a000-000000000001';

select throws_ok(
  $$ update public.consultations set status = 'cancelled'
      where id = 'aaaaaaaa-2222-4000-a000-000000000001' $$,
  'CN001', null,
  'completed -> cancelled is rejected'
);
select throws_ok(
  $$ update public.consultations set scheduled_at = now() + interval '9 days'
      where id = 'aaaaaaaa-2222-4000-a000-000000000001' $$,
  'CN001', null,
  'Cannot reschedule a completed consultation'
);

-- cancel (terminal) ------------------------------------------------------------------
select lives_ok(
  $$ update public.consultations set status = 'cancelled'
      where id = 'aaaaaaaa-1111-4000-a000-000000000001' $$,
  'scheduled -> cancelled is allowed'
);
select isnt(
  (select cancelled_at from public.consultations where id = 'aaaaaaaa-1111-4000-a000-000000000001'),
  null,
  'cancelled_at is set when cancelled'
);
select throws_ok(
  $$ update public.consultations set status = 'scheduled'
      where id = 'aaaaaaaa-1111-4000-a000-000000000001' $$,
  'CN001', null,
  'A cancelled consultation cannot be reinstated'
);
select throws_ok(
  $$ update public.consultations set scheduled_at = now() + interval '10 days'
      where id = 'aaaaaaaa-1111-4000-a000-000000000001' $$,
  'CN001', null,
  'A cancelled consultation cannot be rescheduled'
);
select throws_ok(
  $$ update public.consultations set status = 'completed'
      where id = 'aaaaaaaa-1111-4000-a000-000000000001' $$,
  'CN001', null,
  'A cancelled consultation cannot be completed'
);

select * from finish();
rollback;
