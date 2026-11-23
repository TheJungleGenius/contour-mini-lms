-- =============================================================================
-- Consultations
--
-- Lifecycle (a single status column, so impossible states can't exist):
--
--     scheduled <──> completed        (mark complete / incomplete)
--     scheduled ───> cancelled        (cancel; terminal, a soft delete)
--
-- Business rules are enforced in the database (the trigger below), so they hold
-- no matter which client writes: our API, or someone calling the Data API
-- directly with their own JWT. The API validates the same rules first to give
-- friendlier errors; the database is the final authority.
-- =============================================================================

create type public.consultation_status as enum ('scheduled', 'completed', 'cancelled');

create table public.consultations (
  id           uuid primary key default gen_random_uuid(),
  -- References profiles (which cascades from auth.users) so PostgREST can embed
  -- the student's profile in the admin view.
  student_id   uuid not null default auth.uid()
               references public.profiles (id) on delete cascade,
  -- Names are captured on the booking itself, as the brief requires. They are
  -- prefilled from the profile but stored as a snapshot.
  first_name   text not null check (char_length(first_name) between 1 and 100),
  last_name    text not null check (char_length(last_name) between 1 and 100),
  reason       text not null check (char_length(reason) between 1 and 1000),
  scheduled_at timestamptz not null,
  status       public.consultation_status not null default 'scheduled',
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint consultations_completed_at_matches_status
    check ((status = 'completed') = (completed_at is not null)),
  constraint consultations_cancelled_at_matches_status
    check ((status = 'cancelled') = (cancelled_at is not null))
);

comment on table public.consultations is
  'Student consultation bookings. Cancel is a soft delete (status = cancelled); rows are never deleted via the API.';

-- Student dashboard: WHERE student_id = $1 ORDER BY scheduled_at, id (keyset).
create index consultations_student_scheduled_idx
  on public.consultations (student_id, scheduled_at, id);

-- Admin view: ORDER BY scheduled_at DESC, id DESC (keyset), optional status filter.
create index consultations_scheduled_idx
  on public.consultations (scheduled_at desc, id desc);
create index consultations_status_scheduled_idx
  on public.consultations (status, scheduled_at desc, id desc);

-- -----------------------------------------------------------------------------
-- Invariants and state machine. SECURITY INVOKER (the default): it only
-- validates and derives columns, and needs no extra privileges.
--
-- Custom SQLSTATEs let the API map failures to HTTP codes:
--   CN001  invalid state transition       -> 409 Conflict
--   CN002  scheduled_at not in the future -> 422 Unprocessable
-- -----------------------------------------------------------------------------
create or replace function public.consultations_enforce_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
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
  end if;

  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger consultations_enforce_rules
  before insert or update on public.consultations
  for each row execute function public.consultations_enforce_rules();
