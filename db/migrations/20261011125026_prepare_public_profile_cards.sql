-- Expansion step: compatible with the old site; deploy new public-name readers next.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.public_profile_cards (
  id uuid primary key references public.profiles(id) on delete cascade,
  username text not null,
  avatar_url text,
  bio text
);
alter table public.public_profile_cards enable row level security;
revoke all on public.public_profile_cards from public, anon, authenticated;
grant select on public.public_profile_cards to anon, authenticated;
grant all on public.public_profile_cards to service_role;
drop policy if exists "Public profile cards" on public.public_profile_cards;
create policy "Public profile cards" on public.public_profile_cards
  for select to anon, authenticated using (true);

-- Only a trigger can write the public projection. No RPC accepts another user's id.
create or replace function private.sync_public_profile_card()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.public_profile_cards (id, username, avatar_url, bio)
  values (new.id, new.username, new.avatar_url, new.bio)
  on conflict (id) do update set username = excluded.username,
    avatar_url = excluded.avatar_url, bio = excluded.bio;
  return new;
end;
$$;
revoke all on function private.sync_public_profile_card() from public, anon, authenticated;
drop trigger if exists sync_public_profile_card on public.profiles;
create trigger sync_public_profile_card after insert or update of username, avatar_url, bio
  on public.profiles for each row execute function private.sync_public_profile_card();
insert into public.public_profile_cards (id, username, avatar_url, bio)
select id, username, avatar_url, bio from public.profiles
on conflict (id) do update set username = excluded.username,
  avatar_url = excluded.avatar_url, bio = excluded.bio;

commit;
