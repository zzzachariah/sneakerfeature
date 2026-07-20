-- AI advisor — a multi-turn conversational sneaker concierge (Max flagship).
-- Separate from the Smart Picker's ai_chats / ai_messages: those threads carry
-- recommendation cards; advisor threads are plain conversation with memory of
-- the member's persona + foot scan. One row per message; allowance_charged
-- records what the monthly premium allowance was billed for that turn.

create table if not exists advisor_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists advisor_chats_user_idx on advisor_chats(user_id, updated_at desc);

alter table advisor_chats enable row level security;

create policy "Own advisor chats" on advisor_chats
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists advisor_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references advisor_chats(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  allowance_charged integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists advisor_messages_chat_idx on advisor_messages(chat_id, created_at);

alter table advisor_messages enable row level security;

create policy "Own advisor messages" on advisor_messages
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
