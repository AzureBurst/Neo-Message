-- =====================================================================
--  Stop anyone from listing uploaded files
--  The avatars, attachments and ig_media buckets stay public, so every
--  image and file link the app shows keeps working exactly as before.
--  What changes: nobody can ask Supabase for a LIST of what's in them
--  any more (before, anyone holding the site's public key could).
--  People can still see the files in their own folder, which is all
--  the app ever needs.
--  Safe to run more than once.
-- =====================================================================

drop policy if exists "neo read media" on storage.objects;
drop policy if exists ig_media_read   on storage.objects;
drop policy if exists "neo read own media" on storage.objects;

create policy "neo read own media" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('avatars', 'attachments', 'ig_media')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
