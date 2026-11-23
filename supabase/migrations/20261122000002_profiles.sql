-- =============================================================================
-- Profiles
--
-- Public, app-level user data. `auth.users` is not reachable via the Data API,
-- so the details the app needs (names, and email for the admin view) are copied
-- here by triggers.
-- =============================================================================

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  first_name text not null check (char_length(first_name) between 1 and 100),
  last_name  text not null check (char_length(last_name) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

create policy "Users can read their own profile; admins can read all"
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
  );

-- -----------------------------------------------------------------------------
-- On sign-up: create the profile and assign the default role.
-- SECURITY DEFINER because it writes tables the signing-up user cannot write.
-- Names come from sign-up metadata (user-controlled, which is fine for display
-- data). The role is *always* 'student' and is never taken from metadata.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(left(nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''), 100), 'Unknown'),
    coalesce(left(nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''), 100), 'Unknown')
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'student');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the copied email in sync when a user changes it.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email = coalesce(new.email, ''),
         updated_at = now()
   where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.handle_user_email_change() from anon, authenticated, public;
