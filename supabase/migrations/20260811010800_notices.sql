-- Notices: Alimi's flagship communication feature. notice_types is a
-- per-school configurable table (not a fixed enum) so schools can rename/
-- add categories; a small set of defaults is seeded per school (see
-- 20260811011200_seed_defaults.sql).

create table if not exists public.notice_types (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  key text not null,
  label text not null,
  color text,
  is_positive boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, key)
);

create index if not exists notice_types_school_idx on public.notice_types(school_id, sort_order);

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  notice_type_id uuid references public.notice_types(id) on delete set null,
  title text not null,
  body text not null,
  target_scope public.target_scope not null default 'school',
  target_grade_level_id uuid references public.grade_levels(id),
  target_homeroom_id uuid references public.homerooms(id),
  requires_confirmation boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notices_target_grade_required check (
    (target_scope = 'grade' and target_grade_level_id is not null) or target_scope <> 'grade'
  ),
  constraint notices_target_homeroom_required check (
    (target_scope = 'homeroom' and target_homeroom_id is not null) or target_scope <> 'homeroom'
  )
);

create index if not exists notices_school_idx on public.notices(school_id, published_at desc);
create index if not exists notices_scope_grade_idx on public.notices(school_id, target_scope, target_grade_level_id);
create index if not exists notices_scope_homeroom_idx on public.notices(school_id, target_scope, target_homeroom_id);

drop trigger if exists notices_set_updated_at on public.notices;
create trigger notices_set_updated_at
before update on public.notices
for each row execute procedure public.set_updated_at();

create table if not exists public.notice_students (
  notice_id uuid not null references public.notices(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  primary key (notice_id, student_id)
);

create index if not exists notice_students_student_idx on public.notice_students(student_id);

create table if not exists public.notice_attachments (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.notices(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint notice_attachments_mime_allowed check (mime_type = 'application/pdf'),
  constraint notice_attachments_size_limit check (size_bytes > 0 and size_bytes <= 20 * 1024 * 1024)
);

create index if not exists notice_attachments_notice_idx on public.notice_attachments(notice_id);

create table if not exists public.acknowledgements (
  notice_id uuid not null references public.notices(id) on delete cascade,
  guardian_id uuid not null references public.profiles(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  read_at timestamptz,
  confirmed_at timestamptz,
  parent_reply text,
  replied_at timestamptz,
  primary key (notice_id, guardian_id)
);

create index if not exists acknowledgements_guardian_idx on public.acknowledgements(guardian_id);
create index if not exists acknowledgements_notice_idx on public.acknowledgements(notice_id);

-- ---------------------------------------------------------------------
-- Shared targeting predicate, used by both notices_select and
-- notice_attachments_select so the two policies can never drift apart
-- the way Holga's did (see docs/HOLGA_REFERENCE_AUDIT.md §3).
-- ---------------------------------------------------------------------

create or replace function public.guardian_can_see_notice(target_notice uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.notices n
    where n.id = target_notice
      and n.published_at <= now()
      and (
        n.target_scope = 'school'
        or (
          n.target_scope = 'grade'
          and exists (
            select 1 from public.guardian_students gs
            join public.students s on s.id = gs.student_id
            where gs.guardian_id = (select auth.uid()) and s.grade_level_id = n.target_grade_level_id
          )
        )
        or (
          n.target_scope = 'homeroom'
          and exists (
            select 1 from public.guardian_students gs
            join public.students s on s.id = gs.student_id
            where gs.guardian_id = (select auth.uid()) and s.homeroom_id = n.target_homeroom_id
          )
        )
        or (
          n.target_scope = 'student'
          and exists (
            select 1 from public.notice_students ns
            join public.guardian_students gs on gs.student_id = ns.student_id
            where ns.notice_id = n.id and gs.guardian_id = (select auth.uid())
          )
        )
      )
  );
$$;

grant execute on function public.guardian_can_see_notice(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.notice_types enable row level security;
alter table public.notices enable row level security;
alter table public.notice_students enable row level security;
alter table public.notice_attachments enable row level security;
alter table public.acknowledgements enable row level security;

drop policy if exists "notice_types_select" on public.notice_types;
create policy "notice_types_select" on public.notice_types for select to authenticated
using (public.is_school_member(school_id) or public.is_platform_admin());

drop policy if exists "notice_types_admin_write" on public.notice_types;
create policy "notice_types_admin_write" on public.notice_types for all to authenticated
using (public.is_school_admin(school_id))
with check (public.is_school_admin(school_id));

drop policy if exists "notices_select" on public.notices;
create policy "notices_select" on public.notices for select to authenticated
using (
  public.is_school_staff(school_id)
  or public.is_platform_admin()
  or (public.is_school_parent(school_id) and public.guardian_can_see_notice(id))
);

drop policy if exists "notices_staff_insert" on public.notices;
create policy "notices_staff_insert" on public.notices for insert to authenticated
with check (public.is_school_staff(school_id) and created_by = (select auth.uid()));

drop policy if exists "notices_staff_update" on public.notices;
create policy "notices_staff_update" on public.notices for update to authenticated
using (public.is_school_staff(school_id))
with check (public.is_school_staff(school_id));

drop policy if exists "notices_staff_delete" on public.notices;
create policy "notices_staff_delete" on public.notices for delete to authenticated
using (public.is_school_staff(school_id));

drop policy if exists "notice_students_select" on public.notice_students;
create policy "notice_students_select" on public.notice_students for select to authenticated
using (
  exists (select 1 from public.notices n where n.id = notice_id and public.is_school_staff(n.school_id))
  or public.guardian_has_student(student_id)
);

drop policy if exists "notice_students_staff_write" on public.notice_students;
create policy "notice_students_staff_write" on public.notice_students for all to authenticated
using (exists (select 1 from public.notices n where n.id = notice_id and public.is_school_staff(n.school_id)))
with check (exists (select 1 from public.notices n where n.id = notice_id and public.is_school_staff(n.school_id)));

-- Mirrors notices_select exactly (see guardian_can_see_notice above) —
-- this is the fix for the Holga bug documented in
-- docs/HOLGA_REFERENCE_AUDIT.md §3, where the attachment policy only
-- checked that the parent notice row existed, not that it was targeted
-- at the current guardian.
drop policy if exists "notice_attachments_select" on public.notice_attachments;
create policy "notice_attachments_select" on public.notice_attachments for select to authenticated
using (
  public.is_school_staff(school_id)
  or public.is_platform_admin()
  or (public.is_school_parent(school_id) and public.guardian_can_see_notice(notice_id))
);

drop policy if exists "notice_attachments_staff_write" on public.notice_attachments;
create policy "notice_attachments_staff_write" on public.notice_attachments for all to authenticated
using (public.is_school_staff(school_id))
with check (public.is_school_staff(school_id));

drop policy if exists "acknowledgements_select" on public.acknowledgements;
create policy "acknowledgements_select" on public.acknowledgements for select to authenticated
using (guardian_id = (select auth.uid()) or public.is_school_staff(school_id));

drop policy if exists "acknowledgements_guardian_insert" on public.acknowledgements;
create policy "acknowledgements_guardian_insert" on public.acknowledgements for insert to authenticated
with check (
  guardian_id = (select auth.uid())
  and public.guardian_can_see_notice(notice_id)
);

drop policy if exists "acknowledgements_guardian_update" on public.acknowledgements;
create policy "acknowledgements_guardian_update" on public.acknowledgements for update to authenticated
using (guardian_id = (select auth.uid()))
with check (guardian_id = (select auth.uid()));

grant select, insert, update, delete on public.notice_types, public.notices, public.notice_students, public.notice_attachments to authenticated;
grant select, insert, update on public.acknowledgements to authenticated;
