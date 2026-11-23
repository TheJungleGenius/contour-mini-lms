-- =============================================================================
-- Consultations: access control
--
-- Two layers inside Postgres:
--   1. GRANTs: which columns a role may touch at all (column-level privileges).
--   2. RLS: which rows it may touch.
--
-- Access matrix:
--                     select       insert        update                 delete
--   student (own)     yes          yes           status, scheduled_at   no (cancel = soft)
--   student (others)  no           no            no                     no
--   admin             all rows     no            no                     no (read-only by design)
--   anon              no           no            no                     no
-- =============================================================================

alter table public.consultations enable row level security;

revoke all on table public.consultations from anon, authenticated;

grant select on table public.consultations to authenticated;
-- student_id has no INSERT grant, so it always comes from its default,
-- auth.uid(). status and the timestamps come from defaults or the trigger.
grant insert (first_name, last_name, reason, scheduled_at)
  on table public.consultations to authenticated;
-- Students can only change status and time. Ownership, names, reason and audit
-- columns can't be changed through the Data API.
grant update (status, scheduled_at)
  on table public.consultations to authenticated;

create policy "Students read their own consultations; admins read all"
  on public.consultations
  for select
  to authenticated
  using (
    student_id = (select auth.uid())
    or (select public.is_admin())
  );

create policy "Students book consultations for themselves"
  on public.consultations
  for insert
  to authenticated
  with check (
    student_id = (select auth.uid())
    and (select public.current_app_role()) = 'student'
  );

create policy "Students manage their own consultations"
  on public.consultations
  for update
  to authenticated
  using (
    student_id = (select auth.uid())
    and (select public.current_app_role()) = 'student'
  )
  with check (
    student_id = (select auth.uid())
    and (select public.current_app_role()) = 'student'
  );

-- No DELETE policy, and DELETE isn't granted: cancelling is a status change.
