-- Per-announcement read tracking.
--
-- Every time the site-wide announcement popup mounts on a visitor's device it
-- POSTs to /api/announcements/[id]/view. We dedupe per "viewer" so the count
-- shown in /admin/announcements is "unique reach", not raw impressions:
--
--   - Logged-in visitors are deduped by `user_id`.
--   - Anonymous visitors are deduped by a stable uuid stored in their
--     browser's localStorage (`client_id`).
--
-- `announcement_id` is plain text (no FK) so legacy GitHub-Action-published
-- announcements — which live in static JSON files and never get inserted
-- into `announcements` — can also accumulate reads alongside DB rows.

create table if not exists announcement_views (
  id uuid primary key default gen_random_uuid(),
  announcement_id text not null,
  user_id uuid references profiles(id) on delete cascade,
  client_id text,
  viewed_at timestamptz not null default now(),
  -- At least one identifier must be present, otherwise the row tells us
  -- nothing about who saw it.
  check (user_id is not null or client_id is not null)
);

create index if not exists announcement_views_id_idx
  on announcement_views (announcement_id);

-- Partial unique indexes so each viewer counts once per announcement. Two
-- separate indexes (one per identifier) keep the "logged-in dedupe" and
-- "anon dedupe" enforced independently without forcing a single CONFLICT
-- target on inserts.
create unique index if not exists announcement_views_uid_uniq
  on announcement_views (announcement_id, user_id)
  where user_id is not null;

create unique index if not exists announcement_views_cid_uniq
  on announcement_views (announcement_id, client_id)
  where client_id is not null;

alter table announcement_views enable row level security;

-- Anyone (anon or logged-in) can POST a view of an announcement they just
-- saw. We don't expose reads to non-admins.
drop policy if exists "Public insert announcement views" on announcement_views;
create policy "Public insert announcement views" on announcement_views
  for insert with check (true);

drop policy if exists "Admin reads all announcement views" on announcement_views;
create policy "Admin reads all announcement views" on announcement_views
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
