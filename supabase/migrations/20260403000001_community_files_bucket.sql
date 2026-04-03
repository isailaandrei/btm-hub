-- Create community-files storage bucket for general file attachments (DMs)
insert into storage.buckets (id, name, public, file_size_limit)
values (
  'community-files',
  'community-files',
  true,
  20971520 -- 20 MB
)
on conflict (id) do nothing;

-- Allow authenticated users to upload files
create policy "Authenticated users can upload community files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'community-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- Allow anyone to view/download community files (public bucket)
create policy "Anyone can view community files"
  on storage.objects for select
  to public
  using (bucket_id = 'community-files');

-- Allow users to delete their own uploads
create policy "Users can delete own community files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'community-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
