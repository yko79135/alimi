-- Seed a small, religiously/institutionally neutral set of default
-- notice types and behavior categories for every new school. Schools can
-- rename, reorder, deactivate, or add their own afterward — nothing here
-- is a fixed enum. Deliberately does NOT seed grade_levels, homerooms, or
-- class periods: those are structural choices each school makes for
-- itself during onboarding (see docs/HOLGA_REFERENCE_AUDIT.md §8 for why
-- Holga's hardcoded, one-school class list must not be repeated).

create or replace function public.seed_school_defaults()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.notice_types (school_id, key, label, color, is_positive, sort_order) values
    (new.id, 'general', 'General Notice', '#4b8792', false, 0),
    (new.id, 'newsletter', 'Newsletter', '#7398bc', false, 1),
    (new.id, 'guidance', 'Guidance', '#bfac9d', false, 2),
    (new.id, 'consultation', 'Consultation', '#88c8c0', false, 3),
    (new.id, 'urgent', 'Urgent', '#b94f53', false, 4),
    (new.id, 'praise', 'Praise', '#3d897a', true, 5)
  on conflict (school_id, key) do nothing;

  insert into public.behavior_categories (school_id, key, label, kind, default_points, sort_order) values
    (new.id, 'general_discipline', 'General', 'discipline', 1, 0),
    (new.id, 'general_praise', 'General', 'praise', 1, 0)
  on conflict (school_id, key) do nothing;

  return new;
end;
$$;

drop trigger if exists schools_seed_defaults on public.schools;
create trigger schools_seed_defaults
after insert on public.schools
for each row execute procedure public.seed_school_defaults();
