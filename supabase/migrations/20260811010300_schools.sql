-- schools: the tenant table. Every school-owned entity created later
-- carries a school_id foreign key back to this table.

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  short_name text,
  logo_url text,
  accent_color text,
  timezone text not null default 'Asia/Seoul',
  locale text not null default 'ko',
  contact_email citext,
  contact_phone text,
  status public.school_status not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schools_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')
);

drop trigger if exists schools_set_updated_at on public.schools;
create trigger schools_set_updated_at
before update on public.schools
for each row execute procedure public.set_updated_at();

-- RLS is enabled here but policies are added in the school_memberships
-- migration once public.has_school_role() exists. Enabling RLS with zero
-- policies denies all access in the interim, which is the safe default.
alter table public.schools enable row level security;

grant select, insert, update on public.schools to authenticated;
