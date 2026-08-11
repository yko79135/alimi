-- Web Push subscriptions and a narrow realtime invalidation-event table.
--
-- The event-table pattern (rather than subscribing directly to wide
-- tables like notices/acknowledgements) is adopted from Holga, see
-- docs/HOLGA_REFERENCE_AUDIT.md §6. Every row is scoped by BOTH
-- school_id and guardian_id, so a client's realtime filter never has to
-- rely on cross-tenant-safe filtering of a wide table.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  failure_count integer not null default 0
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
create index if not exists push_subscriptions_school_idx on public.push_subscriptions(school_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_owner" on public.push_subscriptions;
create policy "push_subscriptions_owner" on public.push_subscriptions for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and public.is_school_member(school_id));

grant select, insert, update, delete on public.push_subscriptions to authenticated;

create table if not exists public.guardian_dashboard_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  guardian_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  entity_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists guardian_dashboard_events_guardian_idx
  on public.guardian_dashboard_events(guardian_id, created_at desc);

alter table public.guardian_dashboard_events enable row level security;
alter table public.guardian_dashboard_events replica identity full;

drop policy if exists "guardian_dashboard_events_select" on public.guardian_dashboard_events;
create policy "guardian_dashboard_events_select" on public.guardian_dashboard_events for select to authenticated
using (guardian_id = (select auth.uid()) or public.is_school_staff(school_id));

drop policy if exists "guardian_dashboard_events_staff_insert" on public.guardian_dashboard_events;
create policy "guardian_dashboard_events_staff_insert" on public.guardian_dashboard_events for insert to authenticated
with check (public.is_school_staff(school_id));

grant select, insert on public.guardian_dashboard_events to authenticated;

-- Add these tables to the realtime publication so postgres_changes
-- subscriptions work. Safe to re-run.
do $$ begin
  alter publication supabase_realtime add table public.guardian_dashboard_events;
exception when duplicate_object then null; end $$;
