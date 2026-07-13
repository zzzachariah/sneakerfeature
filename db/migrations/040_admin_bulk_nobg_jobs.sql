-- Admin "bulk background removal" job queue.
--
-- Mirrors admin_bulk_image_jobs (migrations 015 + 016) but drives a DIFFERENT
-- kind of work: instead of the SERVER importing an image per tick, the admin's
-- BROWSER cuts the background out of each shoe's current approved image with
-- @imgly/background-removal (Vercel's serverless runtime can't host the model),
-- then hands the transparent PNG to /api/admin/shoes/images/bulk-nobg/commit,
-- which swaps it in as the new approved image (the old one is demoted to
-- rejected, so it stays reversible in shoe_images history).
--
-- Same status machine, counters, cancel support and RLS as the image-import
-- job so the admin UI/behaviour matches "bulk image import" exactly.

create table if not exists admin_bulk_nobg_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running', 'cancel_requested', 'cancelled', 'completed', 'failed')),
  total_count integer not null default 0,
  processed_count integer not null default 0,
  success_count integer not null default 0,
  skip_count integer not null default 0,
  failure_count integer not null default 0,
  started_by uuid references profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancel_requested_at timestamptz,
  cancelled_at timestamptz,
  current_shoe_id uuid references shoes(id) on delete set null,
  current_shoe_label text,
  failure_summary jsonb
);

-- Only one active (running/cancel_requested) job at a time.
create unique index if not exists uq_admin_bulk_nobg_jobs_active
on admin_bulk_nobg_jobs ((1))
where status in ('running', 'cancel_requested');

create index if not exists idx_admin_bulk_nobg_jobs_started_at
on admin_bulk_nobg_jobs (started_at desc);

create table if not exists admin_bulk_nobg_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references admin_bulk_nobg_jobs(id) on delete cascade,
  shoe_id uuid not null references shoes(id) on delete cascade,
  shoe_label text not null,
  status text not null check (status in ('pending', 'processing', 'success', 'skipped', 'failed')),
  error_message text,
  source_image_url text,
  selection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_bulk_nobg_job_items_job_status
on admin_bulk_nobg_job_items (job_id, status, created_at);

alter table admin_bulk_nobg_jobs enable row level security;
alter table admin_bulk_nobg_job_items enable row level security;

create policy if not exists "Admin read bulk nobg jobs" on admin_bulk_nobg_jobs
for select
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy if not exists "Admin insert bulk nobg jobs" on admin_bulk_nobg_jobs
for insert
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy if not exists "Admin update bulk nobg jobs" on admin_bulk_nobg_jobs
for update
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy if not exists "Admin read bulk nobg job items" on admin_bulk_nobg_job_items
for select
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy if not exists "Admin insert bulk nobg job items" on admin_bulk_nobg_job_items
for insert
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy if not exists "Admin update bulk nobg job items" on admin_bulk_nobg_job_items
for update
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
