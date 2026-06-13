-- Browsing history + push tokens + personalized-push opt-out.
-- Foundation for the weekly personalized recommendation push (1B). Should go
-- live early so browsing history accumulates before the digest engine ships.

create table if not exists shoe_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  shoe_id uuid not null references shoes(id) on delete cascade,
  last_viewed_at timestamptz not null default now(),
  view_count int not null default 1,
  unique (user_id, shoe_id)
);

create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios','android','web')),
  updated_at timestamptz not null default now()
);

-- Personalized push is opt-out (default on), stored on the profile.
alter table profiles add column if not exists personalized_push_enabled boolean not null default true;

create index if not exists shoe_views_user_idx on shoe_views(user_id, last_viewed_at desc);
create index if not exists push_tokens_user_idx on push_tokens(user_id);

alter table shoe_views enable row level security;
alter table push_tokens enable row level security;

create policy "Views manage own" on shoe_views
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Push tokens manage own" on push_tokens
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Atomic upsert + increment for a view, run as the calling user (RLS applies).
create or replace function record_shoe_view(p_shoe_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into shoe_views (user_id, shoe_id, last_viewed_at, view_count)
  values (auth.uid(), p_shoe_id, now(), 1)
  on conflict (user_id, shoe_id)
  do update set last_viewed_at = now(), view_count = shoe_views.view_count + 1;
end;
$$;
