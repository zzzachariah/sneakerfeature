-- Admin-editable site-wide announcements.
--
-- Until now, the only way to publish an announcement was the "Publish
-- Announcement" GitHub Action (.github/workflows/announcement.yml), which
-- wrote public/announcement.json + appended to public/announcements-history.json
-- and required a commit + deploy. This table lets admins edit and publish
-- straight from the /admin/announcements console: a new row is the new live
-- popup, updates land instantly, and flipping `enabled` off is a takedown.
--
-- The static JSON files remain as a back-compat fallback for the existing
-- workflow + cached visitors; the runtime API prefers DB rows when present.

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default true,
  -- "1 day" | "3 days" | "1 week" | "2 weeks" | "1 month" | "forever"
  duration text not null default 'forever',
  -- "once" | "session" | "always" — how often a single visitor sees the popup.
  frequency text not null default 'once' check (frequency in ('once','session','always')),
  dismissible boolean not null default true,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  title text not null default '',
  body text not null default '',
  button_label text not null default '',
  button_url text not null default '',
  title_zh text not null default '',
  body_zh text not null default '',
  button_label_zh text not null default '',
  created_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);

create index if not exists announcements_published_idx on announcements(published_at desc);
create index if not exists announcements_active_idx on announcements(enabled, published_at desc);

alter table announcements enable row level security;

-- Public read: the modal on every visitor's browser polls the active row, so
-- read has to be open. Writes go through the service-role client behind the
-- admin auth gate, so no INSERT/UPDATE/DELETE policy is required.
drop policy if exists "Public read announcements" on announcements;
create policy "Public read announcements" on announcements
  for select using (true);
