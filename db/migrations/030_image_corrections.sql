-- User-submitted image corrections ("图片纠错").
-- A logged-in user uploads a photo they believe better represents a shoe; it
-- lands here as `pending`, the admin sees a notification + a review queue, and
-- approving it promotes the uploaded file to the shoe's live image.
--
-- The uploaded files reuse the existing public `shoe-images` storage bucket
-- (created in migration 010) under a `corrections/` prefix. Uploads are written
-- server-side with the service role, so no extra storage INSERT policy is needed.

create table if not exists image_corrections (
  id uuid primary key default gen_random_uuid(),
  shoe_id uuid not null references shoes(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason text,
  reviewed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists image_corrections_status_idx on image_corrections(status, created_at desc);
create index if not exists image_corrections_shoe_idx on image_corrections(shoe_id, created_at desc);

alter table image_corrections enable row level security;

-- Submitters can file a correction for themselves and read their own; the admin
-- queue + approve/reject run via the service role.
create policy "Image correction own insert" on image_corrections
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Image correction own read" on image_corrections
  for select to authenticated using (auth.uid() = user_id);
