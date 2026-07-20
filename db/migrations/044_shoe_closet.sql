-- Shoe closet / rotation manager. One row per (user, shoe) the member actually
-- owns, carrying purchase info + accumulated wear so the app can show cushion
-- decay, retirement nudges and cost-per-wear. Individual wear entries live in
-- closet_wear_logs so Max analytics can chart usage over time; the closet row
-- keeps denormalized totals (play_hours / sessions) for cheap list reads.

create table if not exists shoe_closet (
  user_id uuid not null references profiles(id) on delete cascade,
  shoe_id uuid not null references shoes(id) on delete cascade,
  size_label text,
  purchase_price numeric check (purchase_price is null or (purchase_price >= 0 and purchase_price <= 100000)),
  purchased_at date,
  play_hours numeric not null default 0 check (play_hours >= 0),
  sessions integer not null default 0 check (sessions >= 0),
  retired boolean not null default false,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, shoe_id)
);

create index if not exists shoe_closet_user_idx on shoe_closet(user_id);

alter table shoe_closet enable row level security;

create policy "Own closet" on shoe_closet
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Individual wear entries (a session on court). Composite FK onto the closet
-- row so removing a shoe from the closet clears its history too.
create table if not exists closet_wear_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  shoe_id uuid not null,
  hours numeric not null check (hours > 0 and hours <= 24),
  note text check (note is null or char_length(note) <= 200),
  played_at date not null default current_date,
  created_at timestamptz not null default now(),
  foreign key (user_id, shoe_id) references shoe_closet(user_id, shoe_id) on delete cascade
);

create index if not exists closet_wear_logs_user_idx on closet_wear_logs(user_id, played_at desc);

alter table closet_wear_logs enable row level security;

create policy "Own wear logs" on closet_wear_logs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
