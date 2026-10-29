-- First-visit onboarding. Additive: no existing account, persona or catalogue
-- values are changed. Apply before enabling the new entry UI.
-- Numbering is NOT a historical registration rank: eligible retained accounts
-- are backfilled in auth.created_at, auth.id order, then receive permanent IDs.
-- Deleted IDs are never reused. Pageview ordinals start at this migration's
-- activation time and are deliberately NOT added to Vercel's delayed totals.

create schema if not exists onboarding_private;
revoke all on schema onboarding_private from public, anon, authenticated;
grant usage on schema onboarding_private to service_role;

create table if not exists onboarding_private.settings (
  singleton boolean primary key default true check (singleton),
  activated_at timestamptz not null default clock_timestamp(),
  backfilled boolean not null default false
);
create table if not exists onboarding_private.counters (
  name text primary key check (name in ('members', 'pageviews')),
  last_value bigint not null default 0 check (last_value >= 0),
  started_at timestamptz not null default clock_timestamp()
);
create table if not exists onboarding_private.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  member_number bigint not null unique check (member_number > 0),
  stage text not null check (stage in ('welcome', 'profile', 'complete')),
  site_tour_version integer not null default 1,
  site_tour_status text check (site_tour_status in ('skipped', 'completed')),
  ai_tour_version integer not null default 1,
  ai_tour_status text check (ai_tour_status in ('skipped', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists onboarding_private.pageview_events (
  event_id uuid primary key,
  ordinal bigint not null unique check (ordinal > 0),
  created_at timestamptz not null default now()
);
-- Only a short-lived, server-HMACed rate-limit key is kept; never a raw IP,
-- account identifier, page URL, user agent or other visitor profile.
create table if not exists onboarding_private.pageview_limits (
  bucket_key text not null,
  window_started_at timestamptz not null,
  events integer not null check (events > 0),
  primary key (bucket_key, window_started_at)
);
create index if not exists pageview_limits_expiry_idx
  on onboarding_private.pageview_limits(window_started_at);

alter table onboarding_private.settings enable row level security;
alter table onboarding_private.counters enable row level security;
alter table onboarding_private.members enable row level security;
alter table onboarding_private.pageview_events enable row level security;
alter table onboarding_private.pageview_limits enable row level security;
revoke all on all tables in schema onboarding_private from public, anon, authenticated, service_role;

insert into onboarding_private.settings(singleton) values (true) on conflict do nothing;
insert into onboarding_private.counters(name, started_at)
select name, s.activated_at from onboarding_private.settings s
cross join (values ('members'), ('pageviews')) as names(name)
on conflict do nothing;

-- Run only once, including if deployment tooling retries this SQL. Accounts
-- without a profile get their number only after successful profile recovery.
do $$
declare v_done boolean;
begin
  select backfilled into v_done from onboarding_private.settings where singleton for update;
  if not v_done then
    insert into onboarding_private.members(user_id, member_number, stage, completed_at)
    select a.id, row_number() over (order by a.created_at, a.id), 'complete', now()
    from auth.users a join public.profiles p on p.id = a.id
    where a.created_at < (select activated_at from onboarding_private.settings where singleton);
    update onboarding_private.counters
    set last_value = coalesce((select max(member_number) from onboarding_private.members), 0)
    where name = 'members';
    update onboarding_private.settings set backfilled = true where singleton;
  end if;
end $$;

create or replace function onboarding_private.valid_persona(p jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  if jsonb_typeof(p->'positions') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p->'positions') not between 1 and 2 then return false; end if;
  if exists (select 1 from jsonb_array_elements_text(p->'positions') x where x not in ('PG','SG','SF','PF','C')) then return false; end if;
  if (select count(distinct x) from jsonb_array_elements_text(p->'positions') x) <> jsonb_array_length(p->'positions') then return false; end if;
  if p->>'skill_level' is null or p->>'skill_level' not in ('beginner','amateur','semi_pro','pro') then return false; end if;
  if jsonb_typeof(p->'flat_foot') is distinct from 'boolean' then return false; end if;
  if jsonb_typeof(p->'height_cm') is distinct from 'number' or jsonb_typeof(p->'weight_kg') is distinct from 'number' then return false; end if;
  if (p->>'height_cm')::numeric not between 140 and 230 or (p->>'weight_kg')::numeric not between 35 and 160 then return false; end if;
  if p ? 'injuries' then
    if jsonb_typeof(p->'injuries') is distinct from 'array' then return false; end if;
    if jsonb_array_length(p->'injuries') > 4 then return false; end if;
    if exists (select 1 from jsonb_array_elements_text(p->'injuries') x where x not in ('ankle','knee','achilles','plantar')) then return false; end if;
    if (select count(distinct x) from jsonb_array_elements_text(p->'injuries') x) <> jsonb_array_length(p->'injuries') then return false; end if;
  end if;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;

-- These privileged functions live outside exposed schemas. The public RPC
-- wrappers are SECURITY INVOKER, and only service_role can execute either
-- layer. Next.js verifies the session with Auth before supplying a user ID.
create or replace function onboarding_private.repair_profile(p_user_id uuid, p_username text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text; v_metadata jsonb; v_name text;
begin
  select email, raw_user_meta_data into v_email, v_metadata from auth.users where id = p_user_id;
  if not found then raise exception 'onboarding_user_not_found'; end if;
  if exists(select 1 from public.profiles where id = p_user_id) then return; end if;
  -- Metadata is used only as the account owner's requested display name, never
  -- as an authorization or role claim. Recovery always creates role='user'.
  v_name := btrim(coalesce(p_username, v_metadata->>'username', ''));
  if char_length(v_name) < 3 or char_length(v_name) > 80 or v_email is null then
    raise exception 'onboarding_profile_recovery_required';
  end if;
  begin
    insert into public.profiles(id, username, email, role)
    values (p_user_id, v_name, v_email, 'user') on conflict (id) do nothing;
  exception when unique_violation then
    raise exception 'onboarding_profile_recovery_required';
  end;
end $$;

create or replace function onboarding_private.member_status(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_member onboarding_private.members%rowtype; v_created timestamptz; v_cutoff timestamptz; v_next bigint; v_username text;
begin
  if p_user_id is null then raise exception 'onboarding_user_not_found'; end if;
  perform onboarding_private.repair_profile(p_user_id);
  select created_at into v_created from auth.users where id = p_user_id;
  if not found then raise exception 'onboarding_user_not_found'; end if;
  select * into v_member from onboarding_private.members where user_id = p_user_id;
  if not found then
    -- Serialize only allocation, then re-read to make concurrent first requests
    -- idempotent. Failed transactions roll back both counter and assignment.
    perform 1 from onboarding_private.counters where name = 'members' for update;
    select * into v_member from onboarding_private.members where user_id = p_user_id;
    if not found then
      select activated_at into v_cutoff from onboarding_private.settings where singleton;
      update onboarding_private.counters set last_value = last_value + 1 where name = 'members' returning last_value into v_next;
      insert into onboarding_private.members(user_id, member_number, stage, completed_at)
      values (p_user_id, v_next, case when v_created < v_cutoff then 'complete' else 'welcome' end,
        case when v_created < v_cutoff then now() else null end) returning * into v_member;
    end if;
  end if;
  select username into v_username from public.profiles where id = p_user_id;
  return jsonb_build_object(
    'userId', p_user_id, 'username', v_username, 'memberNumber', v_member.member_number,
    'requiresOnboarding', v_member.stage <> 'complete', 'stage', v_member.stage,
    'tours', jsonb_build_object(
      'site', case when v_member.site_tour_version = 1 then v_member.site_tour_status end,
      'ai', case when v_member.ai_tour_version = 1 then v_member.ai_tour_status end));
end $$;

create or replace function onboarding_private.update_member(p_user_id uuid, p_stage text default null, p_tour text default null, p_status text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_stage text; v_persona jsonb;
begin
  if p_stage is not null and p_stage not in ('profile','complete') then raise exception 'onboarding_invalid_update'; end if;
  if (p_tour is null) <> (p_status is null) or
     (p_tour is not null and p_tour not in ('site','ai')) or
     (p_status is not null and p_status not in ('skipped','completed')) or
     (p_stage is null and p_tour is null) then raise exception 'onboarding_invalid_update'; end if;
  perform onboarding_private.member_status(p_user_id);
  select stage into v_stage from onboarding_private.members where user_id = p_user_id for update;
  if p_stage = 'complete' and v_stage <> 'complete' then
    if v_stage <> 'profile' then raise exception 'onboarding_stage_conflict'; end if;
    select persona into v_persona from public.profiles where id = p_user_id for share;
    if not onboarding_private.valid_persona(v_persona) then raise exception 'onboarding_persona_required'; end if;
  end if;
  update onboarding_private.members set
    stage = case when stage = 'complete' then 'complete' else coalesce(p_stage, stage) end,
    completed_at = case when p_stage = 'complete' then coalesce(completed_at, now()) else completed_at end,
    site_tour_version = case when p_tour = 'site' then 1 else site_tour_version end,
    site_tour_status = case when p_tour = 'site' then
      case when site_tour_version = 1 and site_tour_status = 'completed' then 'completed' else p_status end else site_tour_status end,
    ai_tour_version = case when p_tour = 'ai' then 1 else ai_tour_version end,
    ai_tour_status = case when p_tour = 'ai' then
      case when ai_tour_version = 1 and ai_tour_status = 'completed' then 'completed' else p_status end else ai_tour_status end,
    updated_at = now()
  where user_id = p_user_id;
  return onboarding_private.member_status(p_user_id);
end $$;

create or replace function onboarding_private.summary()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('registeredUsers', (select count(*) from auth.users),
    'activatedAt', s.activated_at, 'pageviewStartedAt', c.started_at,
    'livePageviews', c.last_value, 'countsAsOf', statement_timestamp())
  from onboarding_private.settings s join onboarding_private.counters c on c.name = 'pageviews'
  where s.singleton;
$$;

create or replace function onboarding_private.record_pageview(p_event_id uuid, p_rate_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ordinal bigint; v_started timestamptz; v_events integer; v_window timestamptz := date_trunc('minute', now());
begin
  if p_event_id is null or p_rate_key is null or p_rate_key !~ '^[a-f0-9]{64}$' then raise exception 'onboarding_invalid_event'; end if;
  select ordinal into v_ordinal from onboarding_private.pageview_events where event_id = p_event_id;
  select started_at into v_started from onboarding_private.counters where name = 'pageviews';
  if v_ordinal is not null then return jsonb_build_object('ordinal', v_ordinal, 'startedAt', v_started); end if;
  -- No raw visitor data is retained. On the next request, remove limit buckets
  -- older than five minutes; expired buckets never affect a new window.
  delete from onboarding_private.pageview_limits where window_started_at < now() - interval '5 minutes';
  insert into onboarding_private.pageview_limits(bucket_key, window_started_at, events)
    values (p_rate_key, v_window, 1)
    on conflict (bucket_key, window_started_at) do update set events = onboarding_private.pageview_limits.events + 1
    returning events into v_events;
  if v_events > 120 then raise exception 'onboarding_rate_limited'; end if;
  perform 1 from onboarding_private.counters where name = 'pageviews' for update;
  -- A retry may have waited behind the first request. It must not add a view.
  select ordinal into v_ordinal from onboarding_private.pageview_events where event_id = p_event_id;
  if v_ordinal is null then
    update onboarding_private.counters set last_value = last_value + 1 where name = 'pageviews' returning last_value into v_ordinal;
    insert into onboarding_private.pageview_events(event_id, ordinal) values (p_event_id, v_ordinal);
  end if;
  return jsonb_build_object('ordinal', v_ordinal, 'startedAt', v_started);
end $$;

create or replace function public.onboarding_get_status(p_user_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$ select onboarding_private.member_status(p_user_id); $$;
create or replace function public.onboarding_update_status(p_user_id uuid, p_stage text default null, p_tour text default null, p_status text default null)
returns jsonb language sql security invoker set search_path = '' as $$ select onboarding_private.update_member(p_user_id, p_stage, p_tour, p_status); $$;
create or replace function public.onboarding_get_summary()
returns jsonb language sql stable security invoker set search_path = '' as $$ select onboarding_private.summary(); $$;
-- Call this RPC with the anonymous public client, not service_role: existing
-- shoe RLS remains authoritative. Return only public brand values; displayBrand
-- is applied in TypeScript so the normalization exactly matches the catalogue.
create or replace function public.onboarding_catalog_counts()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('catalogCount', count(*),
    'brands', coalesce(jsonb_agg(brand), '[]'::jsonb), 'countsAsOf', statement_timestamp())
  from public.shoes;
$$;
revoke all on function public.onboarding_catalog_counts() from public;
grant execute on function public.onboarding_catalog_counts() to anon, authenticated, service_role;
create or replace function public.onboarding_record_pageview(p_event_id uuid, p_rate_key text)
returns jsonb language sql security invoker set search_path = '' as $$ select onboarding_private.record_pageview(p_event_id, p_rate_key); $$;
create or replace function public.onboarding_recover_profile(p_user_id uuid, p_username text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  perform onboarding_private.repair_profile(p_user_id, p_username);
  return onboarding_private.member_status(p_user_id);
end $$;

revoke all on all functions in schema onboarding_private from public, anon, authenticated, service_role;
grant execute on function onboarding_private.member_status(uuid),
  onboarding_private.update_member(uuid,text,text,text), onboarding_private.summary(),
  onboarding_private.record_pageview(uuid,text), onboarding_private.repair_profile(uuid,text) to service_role;
revoke all on function public.onboarding_get_status(uuid), public.onboarding_update_status(uuid,text,text,text),
  public.onboarding_get_summary(), public.onboarding_record_pageview(uuid,text),
  public.onboarding_recover_profile(uuid,text) from public, anon, authenticated;
grant execute on function public.onboarding_get_status(uuid), public.onboarding_update_status(uuid,text,text,text),
  public.onboarding_get_summary(), public.onboarding_record_pageview(uuid,text),
  public.onboarding_recover_profile(uuid,text) to service_role;

comment on table onboarding_private.members is 'Permanent player IDs, not historical registration ranks. Backfill eligible retained accounts by Auth creation time and UUID. Deleted numbers are not reused.';
comment on table onboarding_private.pageview_events is 'Consent-gated pageview event IDs and atomic ordinals since counters.started_at. Independent of Vercel historical analytics; never sum without a proven cutoff.';
notify pgrst, 'reload schema';
