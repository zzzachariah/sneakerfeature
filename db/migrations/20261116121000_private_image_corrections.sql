-- Pending user image corrections live in a PRIVATE bucket until an admin
-- approves them; only then is the file copied to the public shoe-images bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('image-corrections', 'image-corrections', false, 6291456, array['image/webp'])
on conflict (id) do update set public = false;

alter table public.image_corrections alter column public_url drop not null;
alter table public.image_corrections add column if not exists storage_bucket text not null default 'shoe-images';
