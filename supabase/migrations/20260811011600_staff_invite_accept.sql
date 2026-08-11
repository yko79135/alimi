-- Lets a newly invited staff member flip their own membership from
-- 'invited' to 'active' once they've set a password via the Supabase
-- invite-email flow, without loosening school_memberships UPDATE (which
-- otherwise stays admin-only, see 20260811010400_school_memberships.sql).
-- Deliberately does not allow changing the role — only the status
-- transition invited -> active for the caller's own row.

create or replace function public.accept_school_invite(p_school_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  update public.school_memberships
  set status = 'active'
  where school_id = p_school_id
    and user_id = (select auth.uid())
    and status = 'invited';
end;
$$;

grant execute on function public.accept_school_invite(uuid) to authenticated;
