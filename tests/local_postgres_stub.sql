-- Minimal stub of Supabase's auth/storage schemas + realtime publication,
-- for local syntax/logic validation of Alimi's migrations only. Not part
-- of the real schema.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Matches real Supabase's auth.uid()/auth.role() implementations exactly
-- (reading the request.jwt.claims GUC), so tests written against this
-- stub run unmodified against a real Supabase project.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::json->>'role', current_setting('role', true))::text
$$;

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select string_to_array(regexp_replace(name, '/[^/]+$', ''), '/'); $$;

create publication supabase_realtime;
