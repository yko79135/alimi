-- Lets school staff correct a behavior record's details directly
-- (category, points, reason, guardian-visible message, private note,
-- date) from the student detail page, rather than only ever appending
-- new rows. behavior_records was originally designed as a strictly
-- append-only ledger (see 20260811011100_behavior.sql) so monthly/
-- semester point totals are tamper-evident; that remains true for the
-- signed `delta` used in aggregate scoring. What this migration adds is
-- narrower: staff may edit a record's descriptive fields and correct a
-- mis-entered point value, and every edit is stamped with who/when
-- (`edited_by`/`edited_at`) so the row itself still shows it was
-- changed, and the full before/after is written to audit_logs by the
-- calling action (see app/app/behavior/actions.ts: updateBehaviorRecord).

alter table public.behavior_records add column if not exists edited_at timestamptz;
alter table public.behavior_records add column if not exists edited_by uuid references public.profiles(id) on delete set null;

drop policy if exists "behavior_records_staff_update" on public.behavior_records;
create policy "behavior_records_staff_update" on public.behavior_records for update to authenticated
using (public.is_school_staff(school_id))
with check (public.is_school_staff(school_id));

grant update on public.behavior_records to authenticated;

-- The guardian-facing projection should show whether a record was
-- corrected too (without exposing who edited it — that's staff-internal).
-- Postgres won't let `create or replace function` change a RETURNS
-- TABLE column list, so the old signature has to be dropped first.
drop function if exists public.guardian_behavior_records(uuid, date, date);

create function public.guardian_behavior_records(p_student uuid, p_from date, p_to date)
returns table (
  id uuid, student_id uuid, category_id uuid, kind public.behavior_kind, points integer,
  occurred_on date, reason text, guardian_message text, notice_id uuid, created_at timestamptz,
  edited_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select r.id, r.student_id, r.category_id, r.kind, r.points, r.occurred_on, r.reason,
         r.guardian_message, r.notice_id, r.created_at, r.edited_at
  from public.behavior_records r
  where r.student_id = p_student
    and public.guardian_has_student(p_student)
    and r.occurred_on between p_from and p_to
  order by r.occurred_on desc, r.created_at desc;
$$;

grant execute on function public.guardian_behavior_records(uuid, date, date) to authenticated;
