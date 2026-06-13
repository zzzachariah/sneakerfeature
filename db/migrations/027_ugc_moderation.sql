-- UGC moderation: comment reports + user blocks.
-- Required for App Store review (Guideline 1.2): a way to report objectionable
-- content, block abusive users, and an admin queue to act within 24 hours.

create table if not exists comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references comments(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at timestamptz not null default now(),
  unique (comment_id, reporter_id)
);

create table if not exists user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists comment_reports_status_idx on comment_reports(status, created_at desc);
create index if not exists user_blocks_blocker_idx on user_blocks(blocker_id);

alter table comment_reports enable row level security;
alter table user_blocks enable row level security;

-- Reporters can file a report and read their own; admin reads via service role.
create policy "Report own insert" on comment_reports
  for insert to authenticated with check (auth.uid() = reporter_id);
create policy "Report own read" on comment_reports
  for select to authenticated using (auth.uid() = reporter_id);

-- Users fully manage their own block list.
create policy "Blocks manage own" on user_blocks
  for all to authenticated using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);
