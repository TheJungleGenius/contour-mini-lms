-- Booking limits enforced by consultations_enforce_rules and
-- consultations_one_per_slot_idx: a 365-day horizon, one scheduled
-- consultation per time slot, and at most 10 upcoming per student.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-0000-4000-a000-000000000001', 'd@test.dev', '{"first_name":"Dana","last_name":"D"}');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"dddddddd-0000-4000-a000-000000000001","role":"authenticated","user_role":"student"}';

-- Horizon ------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
     values ('Dana', 'D', 'Edge of horizon', now() + interval '364 days') $$,
  'Can book up to 365 days ahead'
);
select throws_ok(
  $$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
     values ('Dana', 'D', 'Too far', now() + interval '366 days') $$,
  'CN002', null,
  'Cannot book more than 365 days ahead'
);
select throws_ok(
  $$ update public.consultations set scheduled_at = now() + interval '400 days'
      where reason = 'Edge of horizon' $$,
  'CN002', null,
  'Cannot reschedule more than 365 days ahead'
);

-- One scheduled consultation per slot ---------------------------------------------
select lives_ok(
  $$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
     values ('Dana', 'D', 'Slot', date_trunc('hour', now()) + interval '50 days') $$,
  'Can book a free slot'
);
select throws_ok(
  $$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
     values ('Dana', 'D', 'Same slot', date_trunc('hour', now()) + interval '50 days') $$,
  '23505', null,
  'Cannot hold two scheduled consultations at the same time'
);

update public.consultations set status = 'cancelled' where reason = 'Slot';

select lives_ok(
  $$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
     values ('Dana', 'D', 'Rebooked slot', date_trunc('hour', now()) + interval '50 days') $$,
  'A cancelled booking frees its slot'
);

-- Quota: 10 upcoming scheduled ---------------------------------------------------
-- Upcoming so far: 'Edge of horizon' and 'Rebooked slot' (2).
select lives_ok(
  $$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
     select 'Dana', 'D', 'Quota ' || g, now() + make_interval(days => 10 + g)
       from generate_series(1, 8) as g $$,
  'Can hold 10 upcoming consultations'
);
select throws_ok(
  $$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
     values ('Dana', 'D', 'Eleventh', now() + interval '60 days') $$,
  'CN003', null,
  'Cannot book an 11th upcoming consultation'
);

update public.consultations set status = 'completed' where reason = 'Quota 1';

select lives_ok(
  $$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
     values ('Dana', 'D', 'After completing one', now() + interval '60 days') $$,
  'Completing a consultation frees a place in the quota'
);

reset role;
select is(
  (select count(*)::int from public.consultations
    where student_id = 'dddddddd-0000-4000-a000-000000000001'
      and status = 'scheduled' and scheduled_at > now()),
  10,
  'The student ends with exactly 10 upcoming consultations'
);

select * from finish();
rollback;
