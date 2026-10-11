-- Apply after legacy migrations 001–049, before deploying the matching comments API.
-- Private account fields must never share a publicly readable row.
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

alter table public.profiles enable row level security;
-- Table-level REVOKE alone does not clear the column grants from migration 038.
revoke all on public.profiles from public, anon, authenticated;
do $$ declare cols text; begin
  select string_agg(quote_ident(attname), ', ') into cols from pg_attribute
    where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke all (%s) on public.profiles from public, anon, authenticated', cols);
end $$;
grant select on public.profiles to authenticated;
grant update (username, avatar_url, bio, persona, rating_focus, personalized_push_enabled)
  on public.profiles to authenticated;
grant all on public.profiles to service_role;
drop policy if exists "Public read profiles" on public.profiles;
drop policy if exists "Own profile insert" on public.profiles;
drop policy if exists "Private profile read" on public.profiles;
create policy "Private profile read" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
-- A restrictive policy also limits any legacy permissive read policy.
drop policy if exists "Private profile boundary" on public.profiles;
create policy "Private profile boundary" on public.profiles as restrictive for select to authenticated
  using ((select auth.uid()) = id);
drop policy if exists "Own profile update" on public.profiles;
create policy "Own profile update" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create or replace function public.refresh_allowance(
  p_user_id uuid, p_monthly_grant int, p_period_seconds bigint
) returns int language plpgsql security invoker set search_path = '' as $$
declare v_balance int; v_period interval;
begin
  if p_user_id is null or p_monthly_grant is null or p_monthly_grant < 0
    or p_period_seconds is null or p_period_seconds <= 0 then
    raise exception 'invalid_allowance_parameters' using errcode = '22023';
  end if;
  v_period := make_interval(secs => p_period_seconds);
  insert into public.subscription_allowances (user_id, balance, monthly_grant, period_start, updated_at)
    values (p_user_id, p_monthly_grant, p_monthly_grant, now(), now())
  on conflict (user_id) do update set monthly_grant = p_monthly_grant,
    balance = case when subscription_allowances.period_start <= now() - v_period
      then p_monthly_grant else subscription_allowances.balance end,
    period_start = case when subscription_allowances.period_start <= now() - v_period
      then now() else subscription_allowances.period_start end,
    updated_at = now()
  returning balance into v_balance;
  return v_balance;
end;
$$;
create or replace function public.spend_allowance(
  p_user_id uuid, p_amount int, p_monthly_grant int, p_period_seconds bigint
) returns int language plpgsql security invoker set search_path = '' as $$
declare v_balance int;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_allowance_amount' using errcode = '22023';
  end if;
  perform public.refresh_allowance(p_user_id, p_monthly_grant, p_period_seconds);
  update public.subscription_allowances set balance = balance - p_amount, updated_at = now()
    where user_id = p_user_id and balance >= p_amount returning balance into v_balance;
  if v_balance is null then
    raise exception 'insufficient_allowance' using errcode = 'check_violation';
  end if;
  return v_balance;
end;
$$;
revoke all on function public.refresh_allowance(uuid, int, bigint) from public, anon, authenticated;
revoke all on function public.spend_allowance(uuid, int, int, bigint) from public, anon, authenticated;
grant execute on function public.refresh_allowance(uuid, int, bigint) to service_role;
grant execute on function public.spend_allowance(uuid, int, int, bigint) to service_role;
grant all on public.subscription_allowances to service_role;
revoke all on public.subscription_allowances from public, anon, authenticated;
grant select on public.subscription_allowances to authenticated;
drop policy if exists "Admin reads all allowances" on public.subscription_allowances;
drop policy if exists "User reads own allowance" on public.subscription_allowances;
create policy "User reads own allowance" on public.subscription_allowances
  for select to authenticated using ((select auth.uid()) = user_id);

-- Harden optional routines deployed outside the original migration history.
do $$ begin
  if to_regprocedure('public.record_shoe_view(uuid)') is not null then
    alter function public.record_shoe_view(uuid) set search_path = public, pg_temp;
  end if;
  if to_regprocedure('public.outreach_touch_updated_at()') is not null then
    alter function public.outreach_touch_updated_at() set search_path = '';
  end if;
  -- These maintenance procedures COMMIT internally, so adding a SET clause
  -- would break them. Keep their existing owner invocation and remove API access.
  if to_regprocedure('public.cleanup_spam_chunk()') is not null then
    revoke all on procedure public.cleanup_spam_chunk() from public, anon, authenticated;
  end if;
  if to_regprocedure('public.cleanup_spam_bot_signups()') is not null then
    revoke all on procedure public.cleanup_spam_bot_signups() from public, anon, authenticated;
  end if;
end $$;

commit;
