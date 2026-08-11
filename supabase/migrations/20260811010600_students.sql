-- students: the core tenant-owned record. verification_code is a short,
-- randomly generated code (independent of name/grade) used as a second
-- factor during parent self-signup, see 0008_guardians_and_invites.sql
-- and docs/MULTI_TENANCY.md for the full rationale.

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  grade_level_id uuid references public.grade_levels(id) on delete set null,
  homeroom_id uuid references public.homerooms(id) on delete set null,
  student_number text,
  status public.student_status not null default 'active',
  enrollment_date date,
  verification_code text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, verification_code)
);

create index if not exists students_school_idx on public.students(school_id);
create index if not exists students_school_status_idx on public.students(school_id, status);
create index if not exists students_grade_idx on public.students(grade_level_id);
create index if not exists students_homeroom_idx on public.students(homeroom_id);
-- Case/whitespace-normalized name lookup, used by signup matching.
create index if not exists students_name_search_idx
  on public.students (school_id, (lower(regexp_replace(name, '\s+', ' ', 'g'))));

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at
before update on public.students
for each row execute procedure public.set_updated_at();

create or replace function public.generate_verification_code()
returns text
language sql
as $$
  -- 8 unambiguous uppercase alphanumeric characters (no 0/O/1/I).
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() * 32)::int + 1, 1),
    ''
  )
  from generate_series(1, 8);
$$;

create or replace function public.students_default_verification_code()
returns trigger
language plpgsql
as $$
begin
  if new.verification_code is null or new.verification_code = '' then
    new.verification_code := public.generate_verification_code();
  end if;
  return new;
end;
$$;

drop trigger if exists students_default_verification_code on public.students;
create trigger students_default_verification_code
before insert on public.students
for each row execute procedure public.students_default_verification_code();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.students enable row level security;

-- Guardians never SELECT this table directly with the code exposed except
-- via their own linked children (guardian_students grants that, defined
-- in the next migration); staff see the full roster for their school.
drop policy if exists "students_select_staff" on public.students;
create policy "students_select_staff" on public.students for select to authenticated
using (public.is_school_staff(school_id) or public.is_platform_admin());

drop policy if exists "students_staff_insert" on public.students;
create policy "students_staff_insert" on public.students for insert to authenticated
with check (public.is_school_staff(school_id));

drop policy if exists "students_staff_update" on public.students;
create policy "students_staff_update" on public.students for update to authenticated
using (public.is_school_staff(school_id))
with check (public.is_school_staff(school_id));

-- Archiving is preferred; hard delete is admin-only and rare.
drop policy if exists "students_admin_delete" on public.students;
create policy "students_admin_delete" on public.students for delete to authenticated
using (public.is_school_admin(school_id));

grant select, insert, update, delete on public.students to authenticated;
