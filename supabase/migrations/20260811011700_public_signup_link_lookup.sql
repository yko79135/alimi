-- A public (anon-callable) lookup for the /join/[token] page: returns
-- just enough to render the signup form (school name, grade
-- restriction, whether admin approval is required) for a valid, active,
-- unexpired link — nothing else. Deliberately does not expose the full
-- parent_signup_links row (which stays admin-only via RLS), and returns
-- no rows at all for an invalid/expired/inactive token rather than
-- distinguishing why, so this can't be used to probe token validity
-- beyond "does this exact token currently work."

create or replace function public.get_active_signup_link(p_token text)
returns table (
  school_id uuid,
  school_name text,
  school_logo_url text,
  requires_approval boolean,
  grade_level_id uuid
)
language sql
stable
security definer set search_path = public
as $$
  select s.id, s.name, s.logo_url, l.requires_approval, l.grade_level_id
  from public.parent_signup_links l
  join public.schools s on s.id = l.school_id
  where l.token = p_token
    and l.active
    and (l.expires_at is null or l.expires_at > now())
    and (l.max_uses is null or l.uses_count < l.max_uses)
    and s.status = 'active';
$$;

grant execute on function public.get_active_signup_link(text) to anon, authenticated;

-- Grade levels must also be readable anonymously on the join page (to
-- populate the grade dropdown) for the school the link belongs to. A
-- second narrow function, rather than opening grade_levels RLS to anon.
create or replace function public.get_school_grade_levels_public(p_school_id uuid)
returns table (id uuid, name text, sort_order integer)
language sql
stable
security definer set search_path = public
as $$
  select g.id, g.name, g.sort_order
  from public.grade_levels g
  where g.school_id = p_school_id and g.active
  order by g.sort_order;
$$;

grant execute on function public.get_school_grade_levels_public(uuid) to anon, authenticated;
