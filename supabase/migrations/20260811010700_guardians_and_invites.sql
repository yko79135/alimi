-- Guardian/student links, staff invites, and parent self-signup links.
--
-- Design decision (see docs/MULTI_TENANCY.md and
-- docs/HOLGA_REFERENCE_AUDIT.md §2 for the full rationale): unlike Holga,
-- Alimi's parent signup NEVER creates a new student record from
-- self-reported signup data. A student must already exist (created by
-- staff, directly or via CSV import) with a verification_code before any
-- guardian can link to it. This removes an entire class of bugs (typo'd
-- phantom students, unreviewed roster pollution) and makes the identity
-- check a real second factor (name + grade + a code communicated
-- out-of-band) rather than "name + grade" alone.

create table if not exists public.guardian_students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  guardian_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  relationship text,
  created_at timestamptz not null default now(),
  unique (guardian_id, student_id)
);

create index if not exists guardian_students_guardian_idx on public.guardian_students(guardian_id);
create index if not exists guardian_students_student_idx on public.guardian_students(student_id);
create index if not exists guardian_students_school_idx on public.guardian_students(school_id);

-- Defense in depth: a guardian_students row alone is not enough to grant
-- access — the guardian must also hold an active 'parent' membership at
-- that school. This means deactivating a guardian's school_membership
-- immediately revokes access to every linked child without having to
-- also clean up guardian_students rows.
create or replace function public.guardian_has_student(target_student uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.guardian_students gs
    where gs.guardian_id = (select auth.uid())
      and gs.student_id = target_student
      and public.is_school_parent(gs.school_id)
  );
$$;

grant execute on function public.guardian_has_student(uuid) to authenticated;

alter table public.guardian_students enable row level security;

drop policy if exists "guardian_students_select" on public.guardian_students;
create policy "guardian_students_select" on public.guardian_students for select to authenticated
using (
  guardian_id = (select auth.uid())
  or public.is_school_staff(school_id)
  or public.is_platform_admin()
);

drop policy if exists "guardian_students_staff_write" on public.guardian_students;
create policy "guardian_students_staff_write" on public.guardian_students for all to authenticated
using (public.is_school_staff(school_id))
with check (public.is_school_staff(school_id));

grant select, insert, update, delete on public.guardian_students to authenticated;

-- Now that guardian_has_student() exists, students are also visible to
-- their linked guardians (previously staff-only in 0006_students.sql).
drop policy if exists "students_select_guardian" on public.students;
create policy "students_select_guardian" on public.students for select to authenticated
using (public.guardian_has_student(id));

-- ---------------------------------------------------------------------
-- Staff invites: admin invites a teacher or another school_admin by
-- email. Only a hash of the token is stored; the raw token is emailed/
-- shown once and never persisted.
-- ---------------------------------------------------------------------

create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  email citext not null,
  role public.membership_role not null,
  token_hash text not null unique,
  status public.invite_status not null default 'pending',
  invited_by uuid references public.profiles(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint staff_invites_role_valid check (role in ('school_admin', 'teacher'))
);

create index if not exists staff_invites_school_idx on public.staff_invites(school_id);
create index if not exists staff_invites_email_idx on public.staff_invites(school_id, email);

alter table public.staff_invites enable row level security;

drop policy if exists "staff_invites_admin_all" on public.staff_invites;
create policy "staff_invites_admin_all" on public.staff_invites for all to authenticated
using (public.is_school_admin(school_id))
with check (public.is_school_admin(school_id));

grant select, insert, update, delete on public.staff_invites to authenticated;

-- ---------------------------------------------------------------------
-- Parent signup links: reusable, school-scoped, optionally grade-
-- restricted and/or requiring admin approval before a guardian link is
-- created for an existing student.
-- ---------------------------------------------------------------------

create table if not exists public.parent_signup_links (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  token text not null unique,
  label text not null default '',
  grade_level_id uuid references public.grade_levels(id) on delete set null,
  requires_approval boolean not null default false,
  active boolean not null default true,
  max_uses integer,
  uses_count integer not null default 0,
  expires_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists parent_signup_links_school_idx on public.parent_signup_links(school_id);

alter table public.parent_signup_links enable row level security;

drop policy if exists "parent_signup_links_admin_all" on public.parent_signup_links;
create policy "parent_signup_links_admin_all" on public.parent_signup_links for all to authenticated
using (public.is_school_admin(school_id))
with check (public.is_school_admin(school_id));

grant select, insert, update, delete on public.parent_signup_links to authenticated;

-- ---------------------------------------------------------------------
-- Every signup attempt (approved, auto-approved, rejected, or pending
-- review) is recorded, giving admins visibility into failed/suspicious
-- attempts, not just successful ones.
-- ---------------------------------------------------------------------

create table if not exists public.parent_signup_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  link_id uuid references public.parent_signup_links(id) on delete set null,
  guardian_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  submitted_name text not null,
  submitted_grade_level_id uuid references public.grade_levels(id),
  relationship text,
  status public.signup_request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists parent_signup_requests_school_idx on public.parent_signup_requests(school_id, status);
create index if not exists parent_signup_requests_guardian_idx on public.parent_signup_requests(guardian_id);

alter table public.parent_signup_requests enable row level security;

drop policy if exists "parent_signup_requests_select" on public.parent_signup_requests;
create policy "parent_signup_requests_select" on public.parent_signup_requests for select to authenticated
using (guardian_id = (select auth.uid()) or public.is_school_staff(school_id));

drop policy if exists "parent_signup_requests_staff_update" on public.parent_signup_requests;
create policy "parent_signup_requests_staff_update" on public.parent_signup_requests for update to authenticated
using (public.is_school_staff(school_id))
with check (public.is_school_staff(school_id));

grant select, update on public.parent_signup_requests to authenticated;
-- Inserts happen exclusively through redeem_parent_signup_invite() below.

-- ---------------------------------------------------------------------
-- Atomic signup redemption RPC. Matches each requested child against the
-- school's roster by normalized name + grade + verification_code. Every
-- attempt is logged; on any failure to match, the response (and the
-- logged row) never reveals which field was wrong or whether a similarly
-- named student exists, to avoid turning this into a roster-enumeration
-- oracle.
-- ---------------------------------------------------------------------

create or replace function public.redeem_parent_signup_invite(
  p_token text,
  p_guardian_id uuid,
  p_children jsonb -- [{ "name": "...", "grade_level_id": "uuid", "verification_code": "...", "relationship": "..." }, ...]
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_link public.parent_signup_links;
  v_child jsonb;
  v_student public.students;
  v_norm_name text;
  v_results jsonb := '[]'::jsonb;
  v_status public.signup_request_status;
  v_student_id uuid;
begin
  if auth.role() <> 'service_role' and p_guardian_id <> (select auth.uid()) then
    raise exception 'Not authorized to redeem this invite for another user';
  end if;

  select * into v_link from public.parent_signup_links where token = p_token for update;
  if v_link.id is null or not v_link.active then
    raise exception 'INVALID_INVITE';
  end if;
  if v_link.expires_at is not null and v_link.expires_at <= now() then
    raise exception 'INVALID_INVITE';
  end if;
  if v_link.max_uses is not null and v_link.uses_count >= v_link.max_uses then
    raise exception 'INVALID_INVITE';
  end if;

  for v_child in select * from jsonb_array_elements(p_children)
  loop
    v_norm_name := lower(regexp_replace(trim(v_child->>'name'), '\s+', ' ', 'g'));
    v_student_id := null;
    v_status := 'rejected';

    select s.* into v_student
    from public.students s
    where s.school_id = v_link.school_id
      and s.status = 'active'
      and lower(regexp_replace(s.name, '\s+', ' ', 'g')) = v_norm_name
      and s.grade_level_id = (v_child->>'grade_level_id')::uuid
      and s.verification_code = upper(trim(v_child->>'verification_code'))
      and (v_link.grade_level_id is null or s.grade_level_id = v_link.grade_level_id)
    limit 1;

    if v_student.id is not null then
      v_student_id := v_student.id;
      if v_link.requires_approval then
        v_status := 'pending';
      else
        insert into public.guardian_students (school_id, guardian_id, student_id, relationship)
        values (v_link.school_id, p_guardian_id, v_student.id, v_child->>'relationship')
        on conflict (guardian_id, student_id) do nothing;
        v_status := 'auto_approved';
      end if;
    end if;

    insert into public.parent_signup_requests (
      school_id, link_id, guardian_id, student_id, submitted_name,
      submitted_grade_level_id, relationship, status
    ) values (
      v_link.school_id, v_link.id, p_guardian_id, v_student_id, v_child->>'name',
      (v_child->>'grade_level_id')::uuid, v_child->>'relationship', v_status
    );

    v_results := v_results || jsonb_build_object('name', v_child->>'name', 'status', v_status);
  end loop;

  -- Ensure the guardian holds a 'parent' membership at this school even
  -- if every child in this batch failed to match (they may retry, or an
  -- admin may approve a pending request later).
  insert into public.school_memberships (school_id, user_id, role, status)
  values (v_link.school_id, p_guardian_id, 'parent', 'active')
  on conflict (school_id, user_id, role) do nothing;

  update public.parent_signup_links set uses_count = uses_count + 1 where id = v_link.id;

  return jsonb_build_object('school_id', v_link.school_id, 'results', v_results);
end;
$$;

grant execute on function public.redeem_parent_signup_invite(text, uuid, jsonb) to authenticated;

-- Approve a pending signup request: staff-only, creates the guardian
-- link and marks the request approved in one transaction.
create or replace function public.approve_parent_signup_request(p_request_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_request public.parent_signup_requests;
begin
  select * into v_request from public.parent_signup_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.is_school_staff(v_request.school_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_request.status <> 'pending' or v_request.student_id is null then
    raise exception 'INVALID_STATE';
  end if;

  insert into public.guardian_students (school_id, guardian_id, student_id, relationship)
  values (v_request.school_id, v_request.guardian_id, v_request.student_id, v_request.relationship)
  on conflict (guardian_id, student_id) do nothing;

  update public.parent_signup_requests
  set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.approve_parent_signup_request(uuid) to authenticated;
