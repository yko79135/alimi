-- Academic structure: per-school academic years, grade levels, and
-- homerooms/classes. Labels are entirely school-defined free text (a
-- school picks its own grade names: "G1", "1학년", "Kindergarten", "7E")
-- but are backed by real reference tables (not free text on students)
-- so admins get validation, ordering, and a real dropdown instead of
-- whatever string happened to be typed on a given student.

create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  label text not null,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  constraint academic_years_dates_valid check (end_date > start_date)
);

create index if not exists academic_years_school_idx on public.academic_years(school_id);
-- At most one "current" academic year per school.
create unique index if not exists academic_years_one_current_idx
  on public.academic_years(school_id) where is_current;

create table if not exists public.grade_levels (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create index if not exists grade_levels_school_idx on public.grade_levels(school_id, sort_order);

create table if not exists public.homerooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  grade_level_id uuid references public.grade_levels(id) on delete set null,
  name text not null,
  homeroom_teacher_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, academic_year_id, name)
);

create index if not exists homerooms_school_idx on public.homerooms(school_id);
create index if not exists homerooms_grade_idx on public.homerooms(grade_level_id);

-- ---------------------------------------------------------------------
-- RLS: staff of the school can manage; any school member can read.
-- ---------------------------------------------------------------------

alter table public.academic_years enable row level security;
alter table public.grade_levels enable row level security;
alter table public.homerooms enable row level security;

drop policy if exists "academic_years_select" on public.academic_years;
create policy "academic_years_select" on public.academic_years for select to authenticated
using (public.is_school_member(school_id) or public.is_platform_admin());

drop policy if exists "academic_years_staff_write" on public.academic_years;
create policy "academic_years_staff_write" on public.academic_years for all to authenticated
using (public.is_school_admin(school_id))
with check (public.is_school_admin(school_id));

drop policy if exists "grade_levels_select" on public.grade_levels;
create policy "grade_levels_select" on public.grade_levels for select to authenticated
using (public.is_school_member(school_id) or public.is_platform_admin());

drop policy if exists "grade_levels_staff_write" on public.grade_levels;
create policy "grade_levels_staff_write" on public.grade_levels for all to authenticated
using (public.is_school_admin(school_id))
with check (public.is_school_admin(school_id));

drop policy if exists "homerooms_select" on public.homerooms;
create policy "homerooms_select" on public.homerooms for select to authenticated
using (public.is_school_member(school_id) or public.is_platform_admin());

drop policy if exists "homerooms_staff_write" on public.homerooms;
create policy "homerooms_staff_write" on public.homerooms for all to authenticated
using (public.is_school_staff(school_id))
with check (public.is_school_staff(school_id));

grant select, insert, update, delete on public.academic_years, public.grade_levels, public.homerooms to authenticated;
