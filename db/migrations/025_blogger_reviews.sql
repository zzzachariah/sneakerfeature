-- Sneaker-blogger video reviews ("博主点评") shown as a featured band on each
-- shoe's comments slide. Content (pros/cons/summary) is AI-paraphrased (转述式)
-- from the video transcript for copyright safety — never verbatim quotes — and
-- stored in Chinese; the UI translates it at render time.
create table if not exists blogger_reviews (
  id uuid primary key default gen_random_uuid(),
  shoe_id uuid not null references shoes(id) on delete cascade,
  blogger_name text not null,
  platform text not null check (platform in ('youtube', 'bilibili')),
  video_url text not null,
  transcript text,                       -- raw subtitle text (admin re-summarize input; never sent to public)
  pros text[] not null default '{}',     -- exactly 2 paraphrased pros (Chinese), ~10 chars each
  cons text[] not null default '{}',     -- exactly 2 paraphrased cons (Chinese)
  summary text,                          -- one-line overall paraphrase (Chinese)
  pros_en text[] not null default '{}',  -- English version of pros (shown on the English UI)
  cons_en text[] not null default '{}',  -- English version of cons
  summary_en text,                       -- English version of summary
  status text not null default 'pending' check (status in ('pending', 'ready', 'error')),
  error_detail text,
  is_published boolean not null default false,
  source_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shoe_id, video_url)            -- idempotent re-ingest (dedupe per shoe + video)
);

alter table blogger_reviews enable row level security;

-- Public site only ever shows ready + published rows; pending/error never leak.
create policy "Public read published blogger reviews"
  on blogger_reviews for select
  using (is_published = true and status = 'ready');

-- Admins manage everything via the cookie-bound anon client (same shape as 007).
create policy "Admin manage blogger reviews"
  on blogger_reviews for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create index if not exists idx_blogger_reviews_shoe_id on blogger_reviews (shoe_id);
create index if not exists idx_blogger_reviews_shoe_pub
  on blogger_reviews (shoe_id, is_published, status, created_at desc);
