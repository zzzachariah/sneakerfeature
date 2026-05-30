-- sneakerfeature initial schema
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  email text not null,
  avatar_url text,
  bio text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists shoes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  brand text not null,
  shoe_name text not null,
  model_line text,
  version_name text,
  release_year int,
  category text,
  player text,
  price numeric,
  weight text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists shoe_specs (
  id uuid primary key default gen_random_uuid(),
  shoe_id uuid not null references shoes(id) on delete cascade,
  forefoot_midsole_tech text,
  heel_midsole_tech text,
  outsole_tech text,
  upper_tech text,
  cushioning_feel text,
  court_feel text,
  bounce text,
  stability text,
  traction text,
  fit text,
  containment text,
  support text,
  torsional_rigidity text,
  playstyle_summary text,
  story_summary text,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists shoe_stories (
  id uuid primary key default gen_random_uuid(),
  shoe_id uuid not null references shoes(id) on delete cascade,
  title text not null,
  content text not null,
  source_label text,
  source_url text,
  created_at timestamptz not null default now()
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  shoe_id uuid not null references shoes(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  raw_payload jsonb not null,
  raw_text text,
  source_links text[] default '{}',
  status text not null default 'pending' check (status in ('pending','normalized','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists normalized_submission_results (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references user_submissions(id) on delete cascade,
  normalized_payload jsonb not null,
  confidence_score numeric,
  processing_notes text,
  created_at timestamptz not null default now()
);

create table if not exists saved_comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  shoe_ids jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  shoe_id uuid not null references shoes(id) on delete cascade,
  source_type text not null,
  source_label text,
  source_url text,
  note text,
  created_at timestamptz not null default now()
);

alter table shoes enable row level security;
alter table shoe_specs enable row level security;
alter table comments enable row level security;
alter table user_submissions enable row level security;
alter table saved_comparisons enable row level security;
alter table normalized_submission_results enable row level security;
alter table sources enable row level security;
alter table profiles enable row level security;

create policy "Public read shoes" on shoes for select using (true);
create policy "Public read specs" on shoe_specs for select using (true);
create policy "Public read comments" on comments for select using (true);
create policy "Auth add comment" on comments for insert to authenticated with check (auth.uid() = user_id);
create policy "Own comment update" on comments for update to authenticated using (auth.uid() = user_id);
create policy "Own comment delete" on comments for delete to authenticated using (auth.uid() = user_id);
create policy "Own profile" on profiles for select to authenticated using (auth.uid() = id);
create policy "Own submissions read" on user_submissions for select to authenticated using (auth.uid() = user_id);
create policy "Own submissions write" on user_submissions for insert to authenticated with check (auth.uid() = user_id);
create policy "Own saved compares" on saved_comparisons for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
