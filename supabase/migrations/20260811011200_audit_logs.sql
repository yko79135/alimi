-- Tenant-scoped audit log for meaningful administrative actions. Stores
-- identifiers and small metadata, never full record bodies (see product
-- requirement: "Do not unnecessarily copy entire sensitive record bodies
-- into the audit table").

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_school_idx on public.audit_logs(school_id, created_at desc);
create index if not exists audit_logs_target_idx on public.audit_logs(target_type, target_id);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_select" on public.audit_logs;
create policy "audit_logs_select" on public.audit_logs for select to authenticated
using (public.is_school_admin(school_id) or public.is_platform_admin());

-- Inserts happen from server actions using the caller's own RLS-scoped
-- session (staff performing the action), never a blanket "anyone can
-- write logs" policy.
drop policy if exists "audit_logs_staff_insert" on public.audit_logs;
create policy "audit_logs_staff_insert" on public.audit_logs for insert to authenticated
with check (public.is_school_staff(school_id) and actor_id = (select auth.uid()));

grant select, insert on public.audit_logs to authenticated;
