-- =============================================================================
-- Local development seed. Runs automatically on `supabase db reset`.
-- NEVER run this against a production project: it creates known passwords.
--
--   admin@example.com     / password123   (admin)
--   student@example.com   / password123   (student)
--   student2@example.com  / password123   (student)
-- =============================================================================

do $$
declare
  v_admin_id    uuid := '00000000-0000-4000-a000-000000000001';
  v_student_id  uuid := '00000000-0000-4000-a000-000000000002';
  v_student2_id uuid := '00000000-0000-4000-a000-000000000003';
  u record;
begin
  for u in
    select * from (values
      (v_admin_id,    'admin@example.com',    'Ada',   'Admin'),
      (v_student_id,  'student@example.com',  'Sam',   'Student'),
      (v_student2_id, 'student2@example.com', 'Taylor','Learner')
    ) as t(id, email, first_name, last_name)
  loop
    -- The empty-string token columns are needed because GoTrue can't scan NULL
    -- into them.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
      u.email, extensions.crypt('password123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name),
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), u.id, u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now()
    );
  end loop;

  -- The sign-up trigger made everyone a student. Promote the admin; this is the
  -- same one-line operation the README documents for promoting real users.
  update public.user_roles set role = 'admin' where user_id = v_admin_id;

  insert into public.consultations (student_id, first_name, last_name, reason, scheduled_at) values
    (v_student_id,  'Sam',    'Student', 'Help with Year 12 Methods practice exam',  date_trunc('hour', now()) + interval '1 day 10 hours'),
    (v_student_id,  'Sam',    'Student', 'Essay feedback for English',               date_trunc('hour', now()) + interval '3 days 14 hours'),
    (v_student_id,  'Sam',    'Student', 'Chemistry: equilibrium questions',         date_trunc('hour', now()) + interval '5 days 9 hours'),
    (v_student_id,  'Sam',    'Student', 'Study plan for exam period',               date_trunc('hour', now()) + interval '8 days 16 hours'),
    (v_student2_id, 'Taylor', 'Learner', 'Physics: projectile motion',               date_trunc('hour', now()) + interval '2 days 11 hours'),
    (v_student2_id, 'Taylor', 'Learner', 'Specialist Maths: complex numbers',        date_trunc('hour', now()) + interval '6 days 15 hours');

  -- Run the lifecycle through the real trigger (it sets completed_at / cancelled_at).
  update public.consultations set status = 'completed'
   where student_id = v_student_id and reason like 'Essay feedback%';
  update public.consultations set status = 'cancelled'
   where student_id = v_student_id and reason like 'Study plan%';
end;
$$;
