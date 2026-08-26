-- Tenant isolation test suite. Runs as a plain SQL script (no pgTAP
-- dependency) against either a local Postgres primed with
-- tests/supabase_stub.sql, or a real Supabase project's SQL Editor /
-- `psql` connection (where auth.uid()/auth.role() already exist and
-- behave identically to the stub). See tests/README.md for how to run
-- this.
--
-- Every assertion follows the same shape: run a query as a specific
-- simulated user (via request.jwt.claims + SET ROLE authenticated), and
-- fail loudly (RAISE EXCEPTION) if row counts don't match what tenant
-- isolation requires. A clean run prints ALL ASSERTIONS PASSED and
-- nothing else.

begin;

-- ---------------------------------------------------------------------
-- Fixtures: two schools (A, B), one admin/teacher/parent per school, one
-- student per school, one notice per school (school-wide), a grade-
-- targeted notice, and a student-targeted notice.
-- ---------------------------------------------------------------------

reset role;

do $$
declare
  v_school_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_school_b uuid := '00000000-0000-0000-0000-0000000000b1';
  v_admin_a uuid := '00000000-0000-0000-0000-0000000a0001';
  v_teacher_a uuid := '00000000-0000-0000-0000-0000000a0002';
  v_parent_a uuid := '00000000-0000-0000-0000-0000000a0003';
  v_admin_b uuid := '00000000-0000-0000-0000-0000000b0001';
  v_parent_b uuid := '00000000-0000-0000-0000-0000000b0003';
  v_multi uuid := '00000000-0000-0000-0000-000000000099';
  v_student_a uuid := '00000000-0000-0000-0000-00000000aa01';
  v_student_b uuid := '00000000-0000-0000-0000-00000000bb01';
  v_grade_a uuid;
  v_grade_b uuid;
begin
  insert into auth.users (id, email) values
    (v_admin_a, 'admin-a@example.com'),
    (v_teacher_a, 'teacher-a@example.com'),
    (v_parent_a, 'parent-a@example.com'),
    (v_admin_b, 'admin-b@example.com'),
    (v_parent_b, 'parent-b@example.com'),
    (v_multi, 'multi@example.com')
  on conflict (id) do nothing;

  insert into public.profiles (id, email, full_name) values
    (v_admin_a, 'admin-a@example.com', 'Admin A'),
    (v_teacher_a, 'teacher-a@example.com', 'Teacher A'),
    (v_parent_a, 'parent-a@example.com', 'Parent A'),
    (v_admin_b, 'admin-b@example.com', 'Admin B'),
    (v_parent_b, 'parent-b@example.com', 'Parent B'),
    (v_multi, 'multi@example.com', 'Multi School User')
  on conflict (id) do nothing;

  insert into public.schools (id, name, slug, created_by) values
    (v_school_a, 'School A', 'school-a', v_admin_a),
    (v_school_b, 'School B', 'school-b', v_admin_b)
  on conflict (id) do nothing;

  insert into public.school_memberships (school_id, user_id, role, status) values
    (v_school_a, v_admin_a, 'school_admin', 'active'),
    (v_school_a, v_teacher_a, 'teacher', 'active'),
    (v_school_a, v_parent_a, 'parent', 'active'),
    (v_school_b, v_admin_b, 'school_admin', 'active'),
    (v_school_b, v_parent_b, 'parent', 'active'),
    -- v_multi is admin at A and parent at B, deliberately.
    (v_school_a, v_multi, 'school_admin', 'active'),
    (v_school_b, v_multi, 'parent', 'active')
  on conflict do nothing;

  insert into public.grade_levels (school_id, name, sort_order) values (v_school_a, 'Grade 1', 1) returning id into v_grade_a;
  insert into public.grade_levels (school_id, name, sort_order) values (v_school_b, 'Grade 1', 1) returning id into v_grade_b;

  insert into public.students (id, school_id, name, grade_level_id, verification_code) values
    (v_student_a, v_school_a, 'Student A', v_grade_a, 'CODEAAAA'),
    (v_student_b, v_school_b, 'Student B', v_grade_b, 'CODEBBBB')
  on conflict (id) do nothing;

  insert into public.guardian_students (school_id, guardian_id, student_id) values
    (v_school_a, v_parent_a, v_student_a),
    (v_school_b, v_parent_b, v_student_b)
  on conflict do nothing;

  insert into public.notices (school_id, title, body, target_scope, created_by) values
    (v_school_a, 'School A wide notice', 'body', 'school', v_admin_a),
    (v_school_b, 'School B wide notice', 'body', 'school', v_admin_b);

  insert into public.behavior_records (id, school_id, student_id, kind, points, delta, reason, author_id) values
    ('00000000-0000-0000-0000-0000000baa01', v_school_a, v_student_a, 'praise', 2, 2, 'Original reason A', v_admin_a),
    ('00000000-0000-0000-0000-0000000bbb01', v_school_b, v_student_b, 'praise', 2, 2, 'Original reason B', v_admin_b);
end $$;

-- ---------------------------------------------------------------------
-- Helper: run as a given user id (or NULL for anonymous/no-session).
-- ---------------------------------------------------------------------

create or replace function pg_temp.run_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;

create or replace function pg_temp.assert_count(p_label text, p_actual bigint, p_expected bigint) returns void language plpgsql as $$
begin
  if p_actual <> p_expected then
    raise exception 'ASSERTION FAILED: % (expected %, got %)', p_label, p_expected, p_actual;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- School A admin: sees only School A's student and notice.
-- ---------------------------------------------------------------------

select pg_temp.run_as('00000000-0000-0000-0000-0000000a0001');
select pg_temp.assert_count('admin_a sees only school A students', count(*), 1) from public.students;
select pg_temp.assert_count('admin_a cannot see school B student by id', count(*), 0)
  from public.students where id = '00000000-0000-0000-0000-00000000bb01';
select pg_temp.assert_count('admin_a sees only school A notices', count(*), 1) from public.notices;

-- School A admin cannot read School B's guardian links, attendance, or
-- behavior records (base tables are staff-only-within-their-school).
select pg_temp.assert_count('admin_a cannot see school B guardian_students', count(*), 0)
  from public.guardian_students where school_id = '00000000-0000-0000-0000-0000000000b1';

reset role;

-- ---------------------------------------------------------------------
-- School A teacher: same read scope as admin for students/notices, but
-- cannot write school_memberships (admin-only).
-- ---------------------------------------------------------------------

select pg_temp.run_as('00000000-0000-0000-0000-0000000a0002');
select pg_temp.assert_count('teacher_a sees only school A students', count(*), 1) from public.students;

do $$
begin
  begin
    insert into public.school_memberships (school_id, user_id, role, status)
    values ('00000000-0000-0000-0000-0000000000a1', gen_random_uuid(), 'teacher', 'active');
    raise exception 'ASSERTION FAILED: teacher_a was able to insert a school_membership (admin-only action)';
  exception when others then
    if sqlerrm like 'ASSERTION FAILED%' then raise; end if;
    -- expected: RLS denies the insert.
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- School A parent: sees only their own linked student, school A's
-- school-wide notice, and cannot see School B's student roster at all
-- (not even existence via a filtered query).
-- ---------------------------------------------------------------------

select pg_temp.run_as('00000000-0000-0000-0000-0000000a0003');
select pg_temp.assert_count('parent_a sees only their own linked student', count(*), 1) from public.students;
select pg_temp.assert_count('parent_a sees exactly their linked student', count(*), 1)
  from public.students where id = '00000000-0000-0000-0000-00000000aa01';
select pg_temp.assert_count('parent_a cannot see school B student', count(*), 0)
  from public.students where id = '00000000-0000-0000-0000-00000000bb01';
select pg_temp.assert_count('parent_a sees school A notice', count(*), 1) from public.notices;
select pg_temp.assert_count('parent_a cannot see guardian_students rows for other guardians', count(*), 1)
  from public.guardian_students;

reset role;

-- ---------------------------------------------------------------------
-- School A teacher can edit a behavior_record belonging to School A
-- (the student-detail "edit" feature), but the same UPDATE against a
-- School B record affects zero rows rather than leaking cross-tenant
-- write access.
-- ---------------------------------------------------------------------

select pg_temp.run_as('00000000-0000-0000-0000-0000000a0002');

do $$
declare
  v_updated integer;
begin
  update public.behavior_records set reason = 'Corrected reason A'
  where id = '00000000-0000-0000-0000-0000000baa01';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'ASSERTION FAILED: teacher_a could not edit their own school''s behavior record (% rows)', v_updated;
  end if;

  update public.behavior_records set reason = 'Should not apply'
  where id = '00000000-0000-0000-0000-0000000bbb01';
  get diagnostics v_updated = row_count;
  if v_updated <> 0 then
    raise exception 'ASSERTION FAILED: teacher_a was able to edit school B''s behavior record';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- School B admin: symmetric checks, and explicitly cannot enumerate
-- School A's roster (mirrors the "School B cannot enumerate School A
-- students" requirement).
-- ---------------------------------------------------------------------

select pg_temp.run_as('00000000-0000-0000-0000-0000000b0001');
select pg_temp.assert_count('admin_b sees only school B students', count(*), 1) from public.students;
select pg_temp.assert_count('admin_b cannot see school A student by id', count(*), 0)
  from public.students where id = '00000000-0000-0000-0000-00000000aa01';

reset role;

-- ---------------------------------------------------------------------
-- Multi-school user: school_admin at A, parent at B. Confirm BOTH
-- memberships are visible to themself, but their access to students is
-- exactly the union implied by each role at each school — not more.
-- ---------------------------------------------------------------------

select pg_temp.run_as('00000000-0000-0000-0000-000000000099');
select pg_temp.assert_count('multi user sees both own memberships', count(*), 2)
  from public.school_memberships where user_id = '00000000-0000-0000-0000-000000000099';
-- Admin at A -> sees all of A's students (1). Parent at B with no linked
-- child -> sees none of B's students. Total = 1.
select pg_temp.assert_count('multi user sees school A roster via admin role, none of school B via unlinked parent role', count(*), 1)
  from public.students;

reset role;

-- ---------------------------------------------------------------------
-- No session (anonymous / expired token): sees nothing from any tenant
-- table.
-- ---------------------------------------------------------------------

select pg_temp.run_as(null);
select pg_temp.assert_count('anonymous session sees no students', count(*), 0) from public.students;
select pg_temp.assert_count('anonymous session sees no schools', count(*), 0) from public.schools;
select pg_temp.assert_count('anonymous session sees no notices', count(*), 0) from public.notices;

reset role;

-- ---------------------------------------------------------------------
-- Platform admin role does NOT leak from a school_admin membership: a
-- plain school_admin (admin_a) must not pass is_platform_admin().
-- ---------------------------------------------------------------------

select pg_temp.run_as('00000000-0000-0000-0000-0000000a0001');
do $$
begin
  if public.is_platform_admin() then
    raise exception 'ASSERTION FAILED: school_admin incorrectly resolved as platform admin';
  end if;
end $$;
reset role;

select 'ALL ASSERTIONS PASSED' as result;

rollback;
