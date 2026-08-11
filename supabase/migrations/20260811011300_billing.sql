-- Billing: a plan catalog (platform-wide, not tenant-scoped) and one
-- subscription row per school. Payment provider integration is
-- abstracted behind `billing_provider`/`billing_provider_ref` so a real
-- processor (Stripe, a Korean PG) can be plugged in later without a
-- schema change. For the initial release, subscription state is
-- platform-admin-controlled (see docs/BILLING_ARCHITECTURE.md) — there
-- is no fake "payment succeeded" flow anywhere in this schema or the app.

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  max_students integer,
  max_staff integer,
  max_storage_mb integer,
  features jsonb not null default '{}'::jsonb,
  monthly_price_cents integer,
  currency text not null default 'KRW',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique references public.schools(id) on delete cascade,
  plan_id uuid references public.plans(id),
  status public.subscription_status not null default 'trialing',
  billing_provider text not null default 'manual',
  billing_provider_ref text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute procedure public.set_updated_at();

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;

-- Plans are readable by any authenticated user (needed to render pricing/
-- limits in-app) but only platform admins can define them.
drop policy if exists "plans_select" on public.plans;
create policy "plans_select" on public.plans for select to authenticated
using (true);

drop policy if exists "plans_platform_admin_write" on public.plans;
create policy "plans_platform_admin_write" on public.plans for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "subscriptions_select" on public.subscriptions;
create policy "subscriptions_select" on public.subscriptions for select to authenticated
using (public.is_school_admin(school_id) or public.is_platform_admin());

-- Only a platform admin (or the trusted server via service-role after
-- its own check) may change a subscription. A school_admin can view
-- their own billing state but never edit it — no client-side "grant
-- myself Pro" path exists.
drop policy if exists "subscriptions_platform_admin_write" on public.subscriptions;
create policy "subscriptions_platform_admin_write" on public.subscriptions for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select on public.plans, public.subscriptions to authenticated;
grant insert, update, delete on public.plans, public.subscriptions to authenticated;

-- A school starts in trialing status the moment it's created.
create or replace function public.seed_school_subscription()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.subscriptions (school_id, status, trial_ends_at)
  values (new.id, 'trialing', now() + interval '30 days')
  on conflict (school_id) do nothing;
  return new;
end;
$$;

drop trigger if exists schools_seed_subscription on public.schools;
create trigger schools_seed_subscription
after insert on public.schools
for each row execute procedure public.seed_school_subscription();

insert into public.plans (key, name, max_students, max_staff, max_storage_mb, monthly_price_cents, currency)
values
  ('starter', 'Starter', 100, 10, 1024, 0, 'KRW'),
  ('standard', 'Standard', 400, 40, 5120, 49000, 'KRW'),
  ('pro', 'Pro', null, null, 20480, 129000, 'KRW')
on conflict (key) do nothing;
