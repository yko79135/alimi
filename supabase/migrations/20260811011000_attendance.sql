-- Attendance: exception-based append-only ledger. A student with no row
-- for a given date is implicitly present; rows are written only for
-- exceptions (late/absent/early_leave/excused) or to correct a prior
-- exception back to present. See docs/HOLGA_REFERENCE_AUDIT.md §4.

create table if not exists public.attendance_change_batches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  idempotency_key text not null,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, idempotency_key)
);

create table if not exists public.attendance_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  attendance_date date not null,
  status public.attendance_status not null,
  previous_status public.attendance_status,
  change_type text not null default 'exception',
  parent_visible_reason text,
  teacher_note text,
  batch_id uuid references public.attendance_change_batches(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint attendance_entries_change_type_valid check (change_type in ('exception', 'correction'))
);

create index if not exists attendance_entries_school_date_idx on public.attendance_entries(school_id, attendance_date);
create index if not exists attendance_entries_student_date_idx on public.attendance_entries(student_id, attendance_date, created_at desc);

-- Fast "current status per (student, date)" lookup: the latest row wins.
create or replace function public.attendance_current_status(p_student uuid, p_date date)
returns public.attendance_status
language sql
stable
as $$
  select coalesce(
    (select status from public.attendance_entries
     where student_id = p_student and attendance_date = p_date
     order by created_at desc limit 1),
    'present'::public.attendance_status
  );
$$;

alter table public.attendance_change_batches enable row level security;
alter table public.attendance_entries enable row level security;

drop policy if exists "attendance_batches_staff" on public.attendance_change_batches;
create policy "attendance_batches_staff" on public.attendance_change_batches for all to authenticated
using (public.is_school_staff(school_id))
with check (public.is_school_staff(school_id) and author_id = (select auth.uid()));

-- Base table SELECT is staff-only. Guardians never query this table
-- directly (teacher_note must never be exposed to them) — they read
-- through guardian_attendance_entries() below, a security-definer
-- function that projects only guardian-safe columns. Holga's equivalent
-- policy tried to achieve this by hiding the entire row whenever
-- teacher_note was set, which incorrectly hid the exception itself (a
-- parent would see a falsely-implied "present") — see
-- docs/HOLGA_REFERENCE_AUDIT.md §4. The function-based projection avoids
-- that bug: the row (minus the private note) stays visible.
drop policy if exists "attendance_entries_select" on public.attendance_entries;
create policy "attendance_entries_select" on public.attendance_entries for select to authenticated
using (public.is_school_staff(school_id) or public.is_platform_admin());

drop policy if exists "attendance_entries_staff_insert" on public.attendance_entries;
create policy "attendance_entries_staff_insert" on public.attendance_entries for insert to authenticated
with check (public.is_school_staff(school_id) and author_id = (select auth.uid()));

grant select, insert on public.attendance_change_batches, public.attendance_entries to authenticated;

create or replace function public.guardian_attendance_entries(p_student uuid, p_from date, p_to date)
returns table (
  id uuid, student_id uuid, attendance_date date, status public.attendance_status,
  previous_status public.attendance_status, parent_visible_reason text, created_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select e.id, e.student_id, e.attendance_date, e.status, e.previous_status, e.parent_visible_reason, e.created_at
  from public.attendance_entries e
  where e.student_id = p_student
    and public.guardian_has_student(p_student)
    and e.attendance_date between p_from and p_to
  order by e.attendance_date desc, e.created_at desc;
$$;

grant execute on function public.guardian_attendance_entries(uuid, date, date) to authenticated;
