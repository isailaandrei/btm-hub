-- Create community-images storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-images',
  'community-images',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Allow authenticated users to upload images
create policy "Authenticated users can upload community images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'community-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- Allow anyone to view community images (public bucket)
create policy "Anyone can view community images"
  on storage.objects for select
  to public
  using (bucket_id = 'community-images');

-- Allow users to delete their own uploads (path starts with their user id)
create policy "Users can delete own community images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'community-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
