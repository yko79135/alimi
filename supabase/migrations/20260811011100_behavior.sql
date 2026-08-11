-- Behavior/conduct: signed-delta ledger, same append-only shape as
-- attendance. behavior_categories is per-school configurable (school
-- picks its own terminology: "벌점", "Warning", "Conduct Record") rather
-- than a fixed, CHECK-constrained category list — see
-- docs/HOLGA_REFERENCE_AUDIT.md §5 for why Holga's fixed list doesn't
-- generalize. `kind` is an explicit column from day one (Holga initially
-- inferred it from category text and had to backfill a real column
-- later).

create table if not exists public.behavior_categories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  key text not null,
  label text not null,
  kind public.behavior_kind not null,
  default_points integer not null default 1,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (school_id, key)
);

create index if not exists behavior_categories_school_idx on public.behavior_categories(school_id, kind, sort_order);

create table if not exists public.behavior_change_batches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  idempotency_key text not null,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, idempotency_key)
);

create table if not exists public.behavior_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  category_id uuid references public.behavior_categories(id) on delete set null,
  kind public.behavior_kind not null,
  points integer not null check (points > 0),
  delta integer not null,
  change_type text not null default 'entry',
  occurred_on date not null default current_date,
  reason text not null,
  teacher_note text,
  guardian_message text,
  notice_id uuid references public.notices(id) on delete set null,
  batch_id uuid references public.behavior_change_batches(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint behavior_records_delta_nonzero check (delta <> 0),
  constraint behavior_records_delta_sign check (
    (kind = 'discipline' and delta < 0) or (kind = 'praise' and delta > 0)
  ),
  constraint behavior_records_change_type_valid check (change_type in ('entry', 'correction', 'cancellation'))
);

create index if not exists behavior_records_school_idx on public.behavior_records(school_id, occurred_on desc);
create index if not exists behavior_records_student_idx on public.behavior_records(student_id, occurred_on desc);

alter table public.behavior_categories enable row level security;
alter table public.behavior_change_batches enable row level security;
alter table public.behavior_records enable row level security;

drop policy if exists "behavior_categories_select" on public.behavior_categories;
create policy "behavior_categories_select" on public.behavior_categories for select to authenticated
using (public.is_school_member(school_id) or public.is_platform_admin());

drop policy if exists "behavior_categories_admin_write" on public.behavior_categories;
create policy "behavior_categories_admin_write" on public.behavior_categories for all to authenticated
using (public.is_school_admin(school_id))
with check (public.is_school_admin(school_id));

drop policy if exists "behavior_batches_staff" on public.behavior_change_batches;
create policy "behavior_batches_staff" on public.behavior_change_batches for all to authenticated
using (public.is_school_staff(school_id))
with check (public.is_school_staff(school_id) and author_id = (select auth.uid()));

-- Base table is staff-only, same rationale as attendance_entries:
-- teacher_note must never be exposed to guardians. Guardians read
-- through guardian_behavior_records() below.
drop policy if exists "behavior_records_select" on public.behavior_records;
create policy "behavior_records_select" on public.behavior_records for select to authenticated
using (public.is_school_staff(school_id) or public.is_platform_admin());

drop policy if exists "behavior_records_staff_insert" on public.behavior_records;
create policy "behavior_records_staff_insert" on public.behavior_records for insert to authenticated
with check (public.is_school_staff(school_id) and author_id = (select auth.uid()));

grant select, insert, update, delete on public.behavior_categories to authenticated;
grant select, insert on public.behavior_change_batches, public.behavior_records to authenticated;

create or replace function public.guardian_behavior_records(p_student uuid, p_from date, p_to date)
returns table (
  id uuid, student_id uuid, category_id uuid, kind public.behavior_kind, points integer,
  occurred_on date, reason text, guardian_message text, notice_id uuid, created_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select r.id, r.student_id, r.category_id, r.kind, r.points, r.occurred_on, r.reason,
         r.guardian_message, r.notice_id, r.created_at
  from public.behavior_records r
  where r.student_id = p_student
    and public.guardian_has_student(p_student)
    and r.occurred_on between p_from and p_to
  order by r.occurred_on desc, r.created_at desc;
$$;

grant execute on function public.guardian_behavior_records(uuid, date, date) to authenticated;
