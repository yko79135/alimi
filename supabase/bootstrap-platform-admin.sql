-- Run this once, manually, in the Supabase SQL Editor after the first
-- Alimi operator account has signed up through the normal /signup flow.
-- Platform admin is intentionally NOT self-service (unlike school
-- creation) — it grants access to every school's operational data, so it
-- must be a deliberate, manual action by whoever owns the Alimi
-- deployment. This mirrors Holga's own bootstrap-admin.sql, but for the
-- platform level rather than a single school.

insert into public.platform_admins (user_id)
select id from public.profiles where email = 'REPLACE_WITH_YOUR_EMAIL@example.com'
on conflict (user_id) do nothing;
