-- platform_admins: Alimi (the SaaS vendor) operators. Completely separate
-- from school_memberships. A school_admin role at a school NEVER implies
-- platform admin access, and vice versa.

create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = (select auth.uid())
  );
$$;

grant execute on function public.is_platform_admin() to authenticated;

alter table public.platform_admins enable row level security;

drop policy if exists "platform_admins_select" on public.platform_admins;
create policy "platform_admins_select" on public.platform_admins for select to authenticated
using (public.is_platform_admin());

-- Intentionally no insert/update/delete policy for regular authenticated
-- users: platform admin grants are managed exclusively via the
-- service-role key from a trusted server context (see docs/SECURITY.md).

grant select on public.platform_admins to authenticated;
