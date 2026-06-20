-- User favorites (saved shoes), synced to the account. One row per (user, shoe).
create table if not exists favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  shoe_id uuid not null references shoes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, shoe_id)
);

create index if not exists favorites_user_idx on favorites(user_id);

alter table favorites enable row level security;

create policy "Own favorites" on favorites
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
