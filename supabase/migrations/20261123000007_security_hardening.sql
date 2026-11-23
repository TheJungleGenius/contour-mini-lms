-- =============================================================================
-- Security hardening
--
--   1. Text columns reject whitespace-only values. `~ '\S'` requires at least
--      one non-whitespace character, so tabs and newlines don't count either
--      (btrim() only strips spaces). Zod already trims and rejects them, but
--      the database is the final authority: a direct Data API call skips Zod.
--      The length limits are unchanged.
--   2. Cancelled consultations are fully immutable. Previously a no-op update
--      (e.g. status 'cancelled' -> 'cancelled') succeeded and bumped
--      updated_at on a row that is meant to be terminal.
--   3. Least privilege on the trigger function: nobody needs to EXECUTE it
--      directly. Postgres checks that privilege when a trigger is created,
--      not when it fires, so the trigger keeps working.
-- =============================================================================

-- 1. Whitespace-only text ---------------------------------------------------------
alter table public.consultations
  drop constraint consultations_first_name_check,
  drop constraint consultations_last_name_check,
  drop constraint consultations_reason_check,
  add constraint consultations_first_name_check
    check (char_length(first_name) <= 100 and first_name ~ '\S'),
  add constraint consultations_last_name_check
    check (char_length(last_name) <= 100 and last_name ~ '\S'),
  add constraint consultations_reason_check
    check (char_length(reason) <= 1000 and reason ~ '\S');

-- profiles is only written by the sign-up trigger, which already trims and
-- substitutes 'Unknown'; the same rule keeps that invariant explicit.
alter table public.profiles
  drop constraint profiles_first_name_check,
  drop constraint profiles_last_name_check,
  add constraint profiles_first_name_check
    check (char_length(first_name) <= 100 and first_name ~ '\S'),
  add constraint profiles_last_name_check
    check (char_length(last_name) <= 100 and last_name ~ '\S');

-- 2. Cancelled is terminal: reject every update -----------------------------------
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
  if old.status = 'cancelled' then
    raise exception 'Cancelled consultations cannot be changed'
      using errcode = 'CN001';
  end if;

  if new.status is distinct from old.status then
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

-- 3. Least privilege on the trigger function ----------------------------------------
revoke execute on function public.consultations_enforce_rules() from public, anon, authenticated;
