-- school_memberships: the core of tenant isolation and RBAC. A person's
-- role is never global — it is always scoped to one (school_id, user_id)
-- pair, and a person can hold more than one role at the same school (e.g.
-- teacher + parent) or different roles at different schools.

create table if not exists public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.membership_role not null,
  status public.membership_status not null default 'active',
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, user_id, role)
);

create index if not exists school_memberships_user_idx on public.school_memberships(user_id);
create index if not exists school_memberships_school_idx on public.school_memberships(school_id);
create index if not exists school_memberships_school_role_idx on public.school_memberships(school_id, role);

drop trigger if exists school_memberships_set_updated_at on public.school_memberships;
create trigger school_memberships_set_updated_at
before update on public.school_memberships
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------
-- Helper functions. SECURITY DEFINER + stable + fixed search_path so they
-- can be used inside RLS policies without recursive-policy evaluation or
-- search_path hijacking. These are the single source of truth for "does
-- the current user have role X at school Y" checks across the schema.
-- ---------------------------------------------------------------------

create or replace function public.has_school_role(target_school uuid, roles public.membership_role[])
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.school_memberships
    where school_id = target_school
      and user_id = (select auth.uid())
      and status = 'active'
      and role = any(roles)
  );
$$;

create or replace function public.is_school_member(target_school uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.has_school_role(target_school, array['school_admin', 'teacher', 'parent']::public.membership_role[]);
$$;

create or replace function public.is_school_staff(target_school uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.has_school_role(target_school, array['school_admin', 'teacher']::public.membership_role[]);
$$;

create or replace function public.is_school_admin(target_school uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.has_school_role(target_school, array['school_admin']::public.membership_role[]);
$$;

create or replace function public.is_school_parent(target_school uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.has_school_role(target_school, array['parent']::public.membership_role[]);
$$;

grant execute on function public.has_school_role(uuid, public.membership_role[]) to authenticated;
grant execute on function public.is_school_member(uuid) to authenticated;
grant execute on function public.is_school_staff(uuid) to authenticated;
grant execute on function public.is_school_admin(uuid) to authenticated;
grant execute on function public.is_school_parent(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- schools RLS (policies deferred from 0003 until helpers above exist)
-- ---------------------------------------------------------------------

drop policy if exists "schools_select_member" on public.schools;
create policy "schools_select_member" on public.schools for select to authenticated
using (public.is_school_member(id) or public.is_platform_admin());

-- Any authenticated user may create a school (self-service onboarding).
-- The server action that calls this always does so via the
-- create_school_with_admin() RPC below in the same statement as the
-- admin membership insert, so a school never exists without an owner.
drop policy if exists "schools_insert_self" on public.schools;
create policy "schools_insert_self" on public.schools for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "schools_update_admin" on public.schools;
create policy "schools_update_admin" on public.schools for update to authenticated
using (public.is_school_admin(id) or public.is_platform_admin())
with check (public.is_school_admin(id) or public.is_platform_admin());

-- Only a platform admin (or the trusted server using the service-role
-- key after its own authorization check) may flip a school's status.
-- This blocks a school_admin from un-suspending their own tenant even
-- though the UPDATE policy above otherwise permits editing the row.
create or replace function public.protect_school_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if auth.role() <> 'service_role' and not public.is_platform_admin() then
      raise exception 'Only a platform admin can change school status';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists schools_protect_status on public.schools;
create trigger schools_protect_status
before update on public.schools
for each row execute procedure public.protect_school_status();

-- ---------------------------------------------------------------------
-- Atomic "create school + become its first admin" RPC used by onboarding.
-- ---------------------------------------------------------------------

create or replace function public.create_school_with_admin(
  p_name text,
  p_slug citext,
  p_timezone text default 'Asia/Seoul',
  p_locale text default 'ko'
)
returns public.schools
language plpgsql
security definer set search_path = public
as $$
declare
  v_school public.schools;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  insert into public.schools (name, slug, timezone, locale, created_by)
  values (p_name, p_slug, p_timezone, p_locale, (select auth.uid()))
  returning * into v_school;

  insert into public.school_memberships (school_id, user_id, role, status)
  values (v_school.id, (select auth.uid()), 'school_admin', 'active');

  return v_school;
end;
$$;

grant execute on function public.create_school_with_admin(text, citext, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- school_memberships RLS
-- ---------------------------------------------------------------------

alter table public.school_memberships enable row level security;

drop policy if exists "memberships_select" on public.school_memberships;
create policy "memberships_select" on public.school_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_school_staff(school_id)
  or public.is_platform_admin()
);

drop policy if exists "memberships_admin_insert" on public.school_memberships;
create policy "memberships_admin_insert" on public.school_memberships for insert to authenticated
with check (public.is_school_admin(school_id) or public.is_platform_admin());

drop policy if exists "memberships_admin_update" on public.school_memberships;
create policy "memberships_admin_update" on public.school_memberships for update to authenticated
using (public.is_school_admin(school_id) or public.is_platform_admin())
with check (public.is_school_admin(school_id) or public.is_platform_admin());

drop policy if exists "memberships_admin_delete" on public.school_memberships;
create policy "memberships_admin_delete" on public.school_memberships for delete to authenticated
using (public.is_school_admin(school_id) or public.is_platform_admin());

grant select, insert, update, delete on public.school_memberships to authenticated;

-- ---------------------------------------------------------------------
-- Now that is_school_staff() exists, extend profiles visibility so staff
-- can see (name/email/phone of) people who share a school with them —
-- e.g. an admin listing staff, or a teacher seeing a guardian's contact
-- info. This does NOT let staff see profiles with no shared school.
-- ---------------------------------------------------------------------

drop policy if exists "profiles_select_shared_school" on public.profiles;
create policy "profiles_select_shared_school" on public.profiles for select to authenticated
using (
  exists (
    select 1
    from public.school_memberships mine
    join public.school_memberships theirs on theirs.school_id = mine.school_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = public.profiles.id
      and theirs.status = 'active'
  )
  or public.is_platform_admin()
);
