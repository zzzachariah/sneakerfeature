-- 1-5 star rating with 0.5 granularity, one rating per (shoe, user)
create table if not exists shoe_ratings (
  id uuid primary key default gen_random_uuid(),
  shoe_id uuid not null references shoes(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  rating numeric(2,1) not null check (
    rating >= 0.5 and rating <= 5.0 and (rating * 2) = floor(rating * 2)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shoe_id, user_id)
);

alter table shoe_ratings enable row level security;

create policy "Public read shoe ratings"
  on shoe_ratings for select using (true);

create policy "Own rating insert"
  on shoe_ratings for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Own rating update"
  on shoe_ratings for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Own rating delete"
  on shoe_ratings for delete to authenticated
  using (auth.uid() = user_id);

create index if not exists idx_shoe_ratings_shoe_id on shoe_ratings (shoe_id);
create index if not exists idx_shoe_ratings_user_id on shoe_ratings (user_id);
