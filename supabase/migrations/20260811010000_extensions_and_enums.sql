-- Alimi core schema: extensions and shared enum types.
-- Run migrations in this directory in filename order via `supabase db push`
-- or the Supabase SQL Editor (paste each file in order).

create extension if not exists pgcrypto;
create extension if not exists citext;

-- Roles a user can hold within a single school via school_memberships.
-- Platform-level administration is intentionally NOT a value here — see
-- platform_admins table. A school role must never imply platform access.
do $$ begin
  create type public.membership_role as enum ('school_admin', 'teacher', 'parent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.membership_status as enum ('active', 'invited', 'deactivated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.school_status as enum ('active', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.student_status as enum ('active', 'inactive', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.target_scope as enum ('school', 'grade', 'homeroom', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_status as enum ('present', 'late', 'absent', 'early_leave', 'excused');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.behavior_kind as enum ('discipline', 'praise');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invite_status as enum ('pending', 'accepted', 'revoked', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.signup_request_status as enum ('pending', 'approved', 'rejected', 'auto_approved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'suspended');
exception when duplicate_object then null; end $$;
