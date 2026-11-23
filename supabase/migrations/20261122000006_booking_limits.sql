-- =============================================================================
-- Booking limits
--
--   1. scheduled_at at most 365 days ahead, on booking and on reschedule.
--      CN002 -> 422, the same code as "must be in the future".
--   2. A student can't hold two scheduled consultations at the same time.
--      Partial unique index -> 23505 -> 409.
--   3. At most 10 upcoming scheduled consultations per student, checked when
--      booking. CN003 -> 409. This caps how many rows one account can create;
--      per-request rate limiting belongs at the edge (see README).
--
-- Limits must match lib/consultations/validation.ts (BOOKING_HORIZON_DAYS,
-- MAX_UPCOMING_CONSULTATIONS).
-- =============================================================================

create unique index consultations_one_per_slot_idx
  on public.consultations (student_id, scheduled_at)
  where status = 'scheduled';

create or replace function public.consultations_enforce_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  booking_horizon constant interval := interval '365 days';
  max_upcoming    constant integer  := 10;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'scheduled' then
      raise exception 'New consultations must be scheduled'
        using errcode = 'CN001';
    end if;
    if new.scheduled_at <= now() then
      raise exception 'Consultations must be scheduled in the future'
        using errcode = 'CN002';
    end if;
    if new.scheduled_at > now() + booking_horizon then
      raise exception 'Consultations can be booked at most 365 days ahead'
        using errcode = 'CN002';
    end if;

    -- Quota. Take a per-student lock first, so two concurrent bookings can't
    -- both see 9 and both insert. The count runs as the caller; RLS lets a
    -- student see all of their own rows, so it's exact.
    perform pg_advisory_xact_lock(hashtextextended('consultations:' || new.student_id::text, 0));
    if (
      select count(*)
        from public.consultations c
       where c.student_id = new.student_id
         and c.status = 'scheduled'
         and c.scheduled_at > now()
    ) >= max_upcoming then
      raise exception 'You can have at most % upcoming consultations', max_upcoming
        using errcode = 'CN003';
    end if;

    new.completed_at := null;
    new.cancelled_at := null;
    new.created_at   := now();
    new.updated_at   := now();
    return new;
  end if;

  -- UPDATE
  if new.status is distinct from old.status then
    if old.status = 'cancelled' then
      raise exception 'Cancelled consultations cannot be changed'
        using errcode = 'CN001';
    end if;
    if old.status = 'completed' and new.status = 'cancelled' then
      raise exception 'Completed consultations cannot be cancelled'
        using errcode = 'CN001';
    end if;
    new.completed_at := case when new.status = 'completed' then now() end;
    new.cancelled_at := case when new.status = 'cancelled' then now() end;
  else
    -- Derived columns can only change through a status change.
    new.completed_at := old.completed_at;
    new.cancelled_at := old.cancelled_at;
  end if;

  if new.scheduled_at is distinct from old.scheduled_at then
    if old.status <> 'scheduled' or new.status <> 'scheduled' then
      raise exception 'Only scheduled consultations can be rescheduled'
        using errcode = 'CN001';
    end if;
    if new.scheduled_at <= now() then
      raise exception 'Consultations must be scheduled in the future'
        using errcode = 'CN002';
    end if;
    if new.scheduled_at > now() + booking_horizon then
      raise exception 'Consultations can be booked at most 365 days ahead'
        using errcode = 'CN002';
    end if;
  end if;

  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
