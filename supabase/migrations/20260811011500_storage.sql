-- Storage buckets and RLS policies. Two buckets:
--   school-logos        public read (branding must render without auth
--                        on the landing page / PWA manifest), tenant-
--                        scoped write.
--   notice-attachments   private; every object path is
--                        {school_id}/{notice_id}/{filename} so tenant
--                        isolation holds even before RLS is considered.
--                        Downloads always go through
--                        app/api/attachments/[id]/route.ts, which checks
--                        visibility via the caller's own RLS-scoped
--                        client (guardian_can_see_notice) before minting
--                        a short-lived signed URL with the admin client
--                        — the storage.objects policies below are
--                        defense in depth, not the only gate.

-- A storage path segment is arbitrary, caller-controlled text. Casting it
-- straight to uuid inside a policy (as ((storage.foldername(name))[n])::uuid)
-- raises an exception — not a false/deny — for any non-uuid segment,
-- which would abort the whole query for a legitimate user listing
-- unrelated objects. This safe-cast avoids that failure mode.
create or replace function public.try_cast_uuid(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-logos', 'school-logos', true, 5 * 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notice-attachments', 'notice-attachments', false, 20 * 1024 * 1024, array['application/pdf'])
on conflict (id) do nothing;

-- school-logos: path convention {school_id}/{filename}
drop policy if exists "school_logos_public_read" on storage.objects;
create policy "school_logos_public_read" on storage.objects for select to public
using (bucket_id = 'school-logos');

drop policy if exists "school_logos_admin_write" on storage.objects;
create policy "school_logos_admin_write" on storage.objects for insert to authenticated
with check (
  bucket_id = 'school-logos'
  and public.is_school_admin(public.try_cast_uuid((storage.foldername(name))[1]))
);

drop policy if exists "school_logos_admin_update" on storage.objects;
create policy "school_logos_admin_update" on storage.objects for update to authenticated
using (bucket_id = 'school-logos' and public.is_school_admin(public.try_cast_uuid((storage.foldername(name))[1])))
with check (bucket_id = 'school-logos' and public.is_school_admin(public.try_cast_uuid((storage.foldername(name))[1])));

drop policy if exists "school_logos_admin_delete" on storage.objects;
create policy "school_logos_admin_delete" on storage.objects for delete to authenticated
using (bucket_id = 'school-logos' and public.is_school_admin(public.try_cast_uuid((storage.foldername(name))[1])));

-- notice-attachments: path convention {school_id}/{notice_id}/{filename}.
-- Staff may also use a {school_id}/drafts/{filename} staging path while
-- composing a notice that doesn't have an id yet; try_cast_uuid makes
-- that a safe, non-throwing "no match" for the guardian branch below
-- rather than an aborted query.
drop policy if exists "notice_attachments_staff_write" on storage.objects;
create policy "notice_attachments_staff_write" on storage.objects for insert to authenticated
with check (
  bucket_id = 'notice-attachments'
  and public.is_school_staff(public.try_cast_uuid((storage.foldername(name))[1]))
);

drop policy if exists "notice_attachments_staff_delete" on storage.objects;
create policy "notice_attachments_staff_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'notice-attachments'
  and public.is_school_staff(public.try_cast_uuid((storage.foldername(name))[1]))
);

drop policy if exists "notice_attachments_object_select" on storage.objects;
create policy "notice_attachments_object_select" on storage.objects for select to authenticated
using (
  bucket_id = 'notice-attachments'
  and (
    public.is_school_staff(public.try_cast_uuid((storage.foldername(name))[1]))
    or (
      public.is_school_parent(public.try_cast_uuid((storage.foldername(name))[1]))
      and public.try_cast_uuid((storage.foldername(name))[2]) is not null
      and public.guardian_can_see_notice(public.try_cast_uuid((storage.foldername(name))[2]))
    )
  )
);
