-- 048_outreach_console.sql
--
-- Creator + growth-channel outreach tracking, moved out of a spreadsheet and a
-- standalone HTML file into the admin console.
--
-- THESE TABLES HOLD REAL PEOPLE'S PERSONAL DATA — email addresses and WeChat
-- IDs for eleven named creators. Leaking them is the worst outcome this feature
-- can produce, so the access rules are deliberately stricter than the rest of
-- the schema:
--
--   * RLS on all four tables, deny by default. There is NO policy granting
--     `anon` anything, so a sessionless client reads zero rows.
--   * Table privileges are additionally REVOKEd from `anon`, so even a future
--     policy mistake can't expose a row — the grant isn't there either.
--   * Reads and writes go through the *authenticated user's* session (the
--     anon key + their cookie), NOT the service-role client used by the
--     sibling admin pages. Service role bypasses RLS entirely, which would
--     make every policy below decorative.
--   * Both views are `security_invoker = true`. Without it a view runs with
--     its owner's rights and silently bypasses the RLS on its base tables —
--     the single easiest way to leak this data. (Requires Postgres 15+; on an
--     older server this migration fails loudly rather than creating a leaky
--     view, which is the correct failure mode.)
--
-- Admin identity reuses the existing `profiles.role = 'admin'` concept — same
-- inline `exists (...)` predicate every other admin policy in this schema uses
-- (see 005_admin_system.sql). No new role table, no email allowlist in env.
--
-- Four values are deliberately NOT stored as columns: score, commission_owed,
-- days_since_* and is_parked. Hand-typed copies of exactly these drifted in the
-- spreadsheet (one row carried a hardcoded score of 3.45 where the formula
-- gives 3.70). They are computed in the views below and nowhere else.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Single-row config. `id` is pinned to 1 by a check constraint so a second
-- settings row can't exist and quietly change which rules apply.
create table if not exists outreach_settings (
  id integer primary key default 1 check (id = 1),
  commission_rate numeric(4,3) not null default 0.35 check (commission_rate >= 0 and commission_rate <= 1),
  follow_up_days integer not null default 5 check (follow_up_days > 0),
  attribution_months integer not null default 12 check (attribution_months > 0),
  audience_trial_days integer not null default 30 check (audience_trial_days > 0),
  tracking_prefix text not null default '',
  -- The gate on who may be contacted at all. A creator whose wave is not in
  -- this array produces no send action, however verified they are.
  sending_waves text[] not null default array['A'],
  -- The six operating rules, rendered read-only at the bottom of the console.
  house_rules text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- `id` is a plain integer, not an identity column: the eleven ids are fixed
-- (1–11) and creators are added or removed in a migration, never in the UI.
create table if not exists outreach_creators (
  id integer primary key,
  wave text not null check (wave in ('A', 'B', 'C')),
  name text not null,
  market text not null default '',
  identity text not null default '',
  positioning text not null default '',
  -- Personal data: an email address or a WeChat ID for a real person.
  contact text not null default '',
  channel text not null check (channel in ('email', 'wechat', 'dm')),
  -- Verification gates sending. Every contact here was CONSTRUCTED from public
  -- pages rather than confirmed on them, so 'no' is the only safe default: a
  -- wrong email bounces, a wrong WeChat ID means adding a stranger.
  verified text not null default 'no' check (verified in ('no', 'partial', 'yes')),
  verify_note text,
  partnership text not null default '',
  fit integer not null check (fit between 1 and 5),
  reply_odds integer not null check (reply_odds between 1 and 5),
  paid_odds integer not null check (paid_odds between 1 and 5),
  -- Live in tracking URLs. Changing one silently breaks affiliate attribution.
  ref_code text not null unique,
  stage text not null default 'new'
    check (stage in ('new', 'sent', 'replied', 'talking', 'live', 'closed', 'hold')),
  -- House rule: exactly one follow-up, ever. Once this is true with no reply
  -- the record is parked and surfaces no further action.
  followed_up boolean not null default false,
  first_sent date,
  reply_date date,
  last_touch date,
  outcome text,
  notes text,
  clicks integer not null default 0 check (clicks >= 0),
  registrations integer not null default 0 check (registrations >= 0),
  paid_count integer not null default 0 check (paid_count >= 0),
  revenue_usd numeric(10,2) not null default 0 check (revenue_usd >= 0),
  sources text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists outreach_channels (
  id text primary key,
  name text not null,
  kind text not null default '',
  first_action text not null default '',
  why text not null default '',
  expected text not null default '',
  cost text not null default '',
  ref_code text not null unique,
  status text not null default 'not started'
    check (status in ('not started', 'running', 'done', 'dropped')),
  clicks integer not null default 0 check (clicks >= 0),
  registrations integer not null default 0 check (registrations >= 0),
  paid_count integer not null default 0 check (paid_count >= 0),
  revenue_usd numeric(10,2) not null default 0 check (revenue_usd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only history. A log row belongs to exactly one creator OR one
-- channel — never both, never neither — so every entry has an unambiguous
-- owner to render it under.
create table if not exists outreach_log (
  id bigserial primary key,
  creator_id integer references outreach_creators(id) on delete cascade,
  channel_id text references outreach_channels(id) on delete cascade,
  entry_date date not null default current_date,
  action text,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint outreach_log_one_owner check (
    (creator_id is not null and channel_id is null)
    or (creator_id is null and channel_id is not null)
  )
);

create index if not exists idx_outreach_creators_wave_stage on outreach_creators (wave, stage);
create index if not exists idx_outreach_creators_verified on outreach_creators (verified);
create index if not exists idx_outreach_log_creator on outreach_log (creator_id, entry_date desc, id desc);
create index if not exists idx_outreach_log_channel on outreach_log (channel_id, entry_date desc, id desc);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function outreach_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_outreach_creators_updated_at on outreach_creators;
create trigger trg_outreach_creators_updated_at
  before update on outreach_creators
  for each row execute function outreach_touch_updated_at();

drop trigger if exists trg_outreach_channels_updated_at on outreach_channels;
create trigger trg_outreach_channels_updated_at
  before update on outreach_channels
  for each row execute function outreach_touch_updated_at();

drop trigger if exists trg_outreach_settings_updated_at on outreach_settings;
create trigger trg_outreach_settings_updated_at
  before update on outreach_settings
  for each row execute function outreach_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — deny by default, admins only, no anon policy anywhere
-- ---------------------------------------------------------------------------

alter table outreach_creators enable row level security;
alter table outreach_channels enable row level security;
alter table outreach_log enable row level security;
alter table outreach_settings enable row level security;

-- Belt and braces: Supabase's default grants hand `anon` SELECT on new public
-- tables. RLS already blocks it (no policy names `anon`), but revoking the
-- privilege means a future policy mistake still can't expose a row.
revoke all on outreach_creators from anon;
revoke all on outreach_channels from anon;
revoke all on outreach_log from anon;
revoke all on outreach_settings from anon;
revoke all on sequence outreach_log_id_seq from anon;

-- Narrow `authenticated` down to the verbs the console actually uses, so the
-- shape of the API is enforced by privileges as well as by policy. Creators and
-- channels are never inserted or deleted through the app (that's a migration),
-- and the log is append-only.
grant select, update on outreach_creators to authenticated;
grant select, update on outreach_channels to authenticated;
grant select, update on outreach_settings to authenticated;
grant select, insert on outreach_log to authenticated;
revoke insert, delete on outreach_creators from authenticated;
revoke insert, delete on outreach_channels from authenticated;
revoke insert, delete on outreach_settings from authenticated;
revoke update, delete on outreach_log from authenticated;
-- bigserial: without USAGE on the sequence every log insert fails.
grant usage, select on sequence outreach_log_id_seq to authenticated;

drop policy if exists "Admin reads outreach creators" on outreach_creators;
create policy "Admin reads outreach creators" on outreach_creators
for select to authenticated
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admin writes outreach creators" on outreach_creators;
create policy "Admin writes outreach creators" on outreach_creators
for update to authenticated
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admin reads outreach channels" on outreach_channels;
create policy "Admin reads outreach channels" on outreach_channels
for select to authenticated
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admin writes outreach channels" on outreach_channels;
create policy "Admin writes outreach channels" on outreach_channels
for update to authenticated
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admin reads outreach log" on outreach_log;
create policy "Admin reads outreach log" on outreach_log
for select to authenticated
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admin appends outreach log" on outreach_log;
create policy "Admin appends outreach log" on outreach_log
for insert to authenticated
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admin reads outreach settings" on outreach_settings;
create policy "Admin reads outreach settings" on outreach_settings
for select to authenticated
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admin writes outreach settings" on outreach_settings;
create policy "Admin writes outreach settings" on outreach_settings
for update to authenticated
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Deliberately absent: INSERT on creators/channels (added in migrations only)
-- and DELETE anywhere (the log is append-only; nothing here is ever removed
-- through the app).

-- ---------------------------------------------------------------------------
-- Computed values — views, never columns
-- ---------------------------------------------------------------------------

-- score        0.45*fit + 0.25*reply_odds + 0.30*paid_odds
-- is_parked    followed the house rule once, got no reply → no action ever again
--
-- `security_invoker = true` is load-bearing: without it these views run as
-- their owner and hand every base-table row to any caller.
create or replace view outreach_creators_view
with (security_invoker = true) as
select
  c.*,
  round(0.45 * c.fit + 0.25 * c.reply_odds + 0.30 * c.paid_odds, 2) as score,
  round(c.revenue_usd * s.commission_rate, 2) as commission_owed,
  (current_date - c.last_touch) as days_since_last_touch,
  (current_date - c.first_sent) as days_since_first_sent,
  (
    c.followed_up
    and c.reply_date is null
    and c.stage not in ('replied', 'talking', 'live', 'closed')
  ) as is_parked
from outreach_creators c
cross join outreach_settings s
where s.id = 1;

create or replace view outreach_channels_view
with (security_invoker = true) as
select
  ch.*,
  round(ch.revenue_usd * s.commission_rate, 2) as commission_owed
from outreach_channels ch
cross join outreach_settings s
where s.id = 1;

revoke all on outreach_creators_view from anon;
revoke all on outreach_channels_view from anon;
grant select on outreach_creators_view to authenticated;
grant select on outreach_channels_view to authenticated;

-- ---------------------------------------------------------------------------
-- Quick actions — one transaction each
-- ---------------------------------------------------------------------------
--
-- Each of these writes several fields AND a log row. They exist as functions
-- so there is no code path where the stage advances but the date doesn't:
-- a half-applied "mark sent" would leave first_sent null and silently disable
-- the follow-up timer forever.
--
-- All are `security invoker`, so RLS applies inside them exactly as it does
-- outside: a non-admin caller sees no row to update and gets the not-found
-- error below. Domain rules are enforced HERE, not only in the UI — the
-- verification gate and the wave gate are the two things standing between the
-- operator and emailing a guessed address, so they are checked server-side on
-- every call.

create or replace function outreach_mark_sent(p_creator_id integer, p_note text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_creator outreach_creators%rowtype;
  v_waves text[];
begin
  select * into v_creator from outreach_creators where id = p_creator_id for update;
  if not found then
    raise exception 'Creator % not found', p_creator_id using errcode = 'no_data_found';
  end if;

  if v_creator.verified <> 'yes' then
    raise exception 'Creator % is not verified — contact must be confirmed on a public page before sending', p_creator_id
      using errcode = 'check_violation';
  end if;

  select sending_waves into v_waves from outreach_settings where id = 1;
  if not (v_creator.wave = any(v_waves)) then
    raise exception 'Wave % is not in the active sending waves', v_creator.wave
      using errcode = 'check_violation';
  end if;

  update outreach_creators
  set stage = 'sent',
      -- coalesce: re-sending never rewrites the original send date, which is
      -- what the follow-up timer counts from.
      first_sent = coalesce(first_sent, current_date),
      last_touch = current_date
  where id = p_creator_id;

  insert into outreach_log (creator_id, entry_date, action, note)
  values (p_creator_id, current_date, 'sent', coalesce(p_note, ''));
end;
$$;

create or replace function outreach_mark_followed_up(p_creator_id integer, p_note text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_creator outreach_creators%rowtype;
begin
  select * into v_creator from outreach_creators where id = p_creator_id for update;
  if not found then
    raise exception 'Creator % not found', p_creator_id using errcode = 'no_data_found';
  end if;

  if v_creator.first_sent is null then
    raise exception 'Creator % has not been sent to yet', p_creator_id using errcode = 'check_violation';
  end if;

  -- One follow-up, then stop. Never nag past one.
  if v_creator.followed_up then
    raise exception 'Creator % has already been followed up once', p_creator_id using errcode = 'check_violation';
  end if;

  update outreach_creators
  set followed_up = true,
      last_touch = current_date
  where id = p_creator_id;

  insert into outreach_log (creator_id, entry_date, action, note)
  values (p_creator_id, current_date, 'followed_up', coalesce(p_note, ''));
end;
$$;

create or replace function outreach_mark_replied(p_creator_id integer, p_note text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_creator outreach_creators%rowtype;
begin
  select * into v_creator from outreach_creators where id = p_creator_id for update;
  if not found then
    raise exception 'Creator % not found', p_creator_id using errcode = 'no_data_found';
  end if;

  if v_creator.first_sent is null then
    raise exception 'Creator % has not been sent to yet', p_creator_id using errcode = 'check_violation';
  end if;

  update outreach_creators
  set stage = case when stage in ('talking', 'live', 'closed') then stage else 'replied' end,
      reply_date = coalesce(reply_date, current_date),
      last_touch = current_date
  where id = p_creator_id;

  insert into outreach_log (creator_id, entry_date, action, note)
  values (p_creator_id, current_date, 'replied', coalesce(p_note, ''));
end;
$$;

-- Verification is the one field whose change is itself worth a log entry:
-- flipping to 'yes' is what unlocks sending, so it needs a paper trail.
create or replace function outreach_set_verified(
  p_creator_id integer,
  p_verified text,
  p_verify_note text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_verified not in ('no', 'partial', 'yes') then
    raise exception 'Invalid verification state %', p_verified using errcode = 'check_violation';
  end if;

  update outreach_creators
  set verified = p_verified,
      -- Confirmed on a public page → the reason it wasn't is now stale.
      verify_note = case when p_verified = 'yes' then null else p_verify_note end
  where id = p_creator_id;

  if not found then
    raise exception 'Creator % not found', p_creator_id using errcode = 'no_data_found';
  end if;

  insert into outreach_log (creator_id, entry_date, action, note)
  values (
    p_creator_id,
    current_date,
    'verified:' || p_verified,
    coalesce(p_verify_note, '')
  );
end;
$$;

revoke execute on function outreach_mark_sent(integer, text) from public, anon;
revoke execute on function outreach_mark_followed_up(integer, text) from public, anon;
revoke execute on function outreach_mark_replied(integer, text) from public, anon;
revoke execute on function outreach_set_verified(integer, text, text) from public, anon;

grant execute on function outreach_mark_sent(integer, text) to authenticated;
grant execute on function outreach_mark_followed_up(integer, text) to authenticated;
grant execute on function outreach_mark_replied(integer, text) to authenticated;
grant execute on function outreach_set_verified(integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed. Exported 2026-07-31 from SNKRFeature_Outreach_Targets_v4_1.xlsx
-- (waves resolved to 联系人总表). Generated from the JSON export, not retyped.
--
-- Every insert is `on conflict do nothing` so re-running this migration can
-- never overwrite live tracking stats or stage progress. Editing prose here
-- after the fact does nothing — write a follow-up migration instead.
-- ---------------------------------------------------------------------------

insert into outreach_settings (
  id, commission_rate, follow_up_days, attribution_months, audience_trial_days,
  tracking_prefix, sending_waves, house_rules
) values (
  1,
  0.35,
  5,
  12,
  30,
  'https://snkrfeature.com/?utm_source=creator&utm_medium=affiliate&utm_campaign=outreach&utm_content=',
  array['A'],
  array['Every contact in this file was constructed from public pages, not confirmed on them. Open the person''s own page and check before sending. A wrong email bounces; a wrong WeChat ID means adding a stranger.', 'WeChat Pay and Alipay through Stripe are one-time payment methods and generally don''t auto-renew. Sell Chinese audiences an annual buyout, not a monthly subscription. Confirm in the Stripe docs before launch.', '35% of first-year revenue is worth a few dollars a month to a creator with a few thousand subscribers. The real leverage is an attributed page, a backlink on every citation, and a say in the ratings. Commission is a closing line, not an opening offer.', 'This list buys trust, not traffic. All eleven converting is still only a few thousand UV. Volume lives in the growth channels — run both, and don''t mistake this table for the plan.', 'Follower counts here are approximations from public pages, for sizing the relationship. Never put them in an outreach message.', 'Where an employer, team or agency relationship isn''t confirmed in public sources, write 独立创作者 or 未确认. Never guess.']
)
on conflict (id) do nothing;

insert into outreach_creators (
  id, wave, name, market, identity, positioning, contact, channel, verified, verify_note, partnership, fit, reply_odds, paid_odds, ref_code, stage, followed_up, first_sent, reply_date, last_touch, outcome, notes, clicks, registrations, paid_count, revenue_usd, sources
) values
  (
    1,
    'A',
    'Kicks Contest World',
    'Global / English',
    'Independent basketball-shoe review team; public sources say testing since 2011, no confirmed footwear-brand affiliation.',
    'YouTube ~11.6k subs. Instagram claims 700+ hoop shoes tested. Known for systematic performance testing and rankings.',
    'kickscontestads@gmail.com',
    'email',
    'no',
    null,
    'Review-data / video source partnership + creator page + subscription revenue share',
    5,
    4,
    4,
    'kickscontest',
    'new',
    false,
    null,
    null,
    null,
    null,
    null,
    0,
    0,
    0,
    0,
    array['https://www.instagram.com/kickscontestworld/', 'https://www.youtube.com/c/kickscontestworld']
  ),
  (
    2,
    'A',
    'Juss Anderson',
    'US / English',
    'Independent basketball and sneaker creator; no fixed footwear-company employer in public sources.',
    'YouTube ~6.4k subs, 700+ videos. Steady 2026 performance tests and buying advice.',
    'jussanderson@outlook.com',
    'email',
    'no',
    'Channel is real and a good fit, but this address appears on no public page. Constructed, not confirmed.',
    'Smart Picker hands-on + dedicated landing page + subscription affiliate share',
    5,
    5,
    4,
    'jussanderson',
    'new',
    false,
    null,
    null,
    null,
    null,
    null,
    0,
    0,
    0,
    0,
    array['https://www.youtube.com/channel/UCOXDjcjpVB2jNLglmre8fhA', 'https://www.youtube.com/watch?v=mUID-8bgrJs']
  ),
  (
    3,
    'A',
    'The 3D Critic',
    'US / English',
    'Independent creator, David. Describes himself as an ordinary hoops fan; talks shoes from a shooting-guard perspective.',
    'YouTube ~2.6k subs, 1,700+ videos. Small audience but highly vertical — reply odds are good.',
    'YouTube About business email / channel DM',
    'email',
    'no',
    'Address not yet pulled from the About page.',
    'SG-specific recommendation page + early product advisor + affiliate share',
    4,
    5,
    3,
    '3dcritic',
    'new',
    false,
    null,
    null,
    null,
    null,
    '执行追踪 had this as Wave B — resolved to A per 联系人总表.',
    0,
    0,
    0,
    0,
    array['https://www.youtube.com/channel/UCtbFV6HjC7uhT-XLLtBBwLA']
  ),
  (
    4,
    'B',
    '鹄途道长 / HUTU DAO',
    'China + Global / Bilingual',
    'Independent cross-platform basketball and sneaker creator. English page positions as “Helping the World Discover Chinese Sneakers”.',
    'Douyin ~592k followers, Instagram ~4.1k. Also runs Bilibili, YouTube and REDNOTE.',
    '微信 hutu609 · IG @hutu609',
    'wechat',
    'no',
    'WeChat ID unconfirmed.',
    'Bilingual “Chinese sneakers, global gateway” hub + attributed backlinks + subscription share',
    5,
    3,
    4,
    'hutudao',
    'new',
    false,
    null,
    null,
    null,
    null,
    '执行追踪 had this as Wave A — resolved to B per 联系人总表. Recent Douyin bio suggests his positioning is shifting; re-check before writing.',
    0,
    0,
    0,
    0,
    array['https://www.instagram.com/hutu609/', 'https://www.douyin.com/user/MS4wLjABAAAAGt7CjvN_BpJsvH8m01-wzLepllWDcmqBRTH_J_e5c1s']
  ),
  (
    5,
    'A',
    '队长球鞋测评邹运',
    'China / Chinese',
    'Pro basketball player and shoe reviewer. Current club not confirmed in verified public sources — do not state one.',
    'Built on 「强度即真理」 and pro-level high-intensity on-court testing. Posts across Bilibili, 识货 and others.',
    '微信 houlanghuyu6',
    'wechat',
    'no',
    'WeChat ID unconfirmed. A wrong ID means adding a stranger.',
    'Pro-standard rating calibration + high-intensity on-court tag + subscription share',
    5,
    4,
    4,
    'zouyun',
    'new',
    false,
    null,
    null,
    null,
    null,
    null,
    0,
    0,
    0,
    0,
    array['https://space.bilibili.com/691978912/', 'https://m.shihuo.cn/page/findCommunityDetail?id=5930804']
  ),
  (
    6,
    'A',
    'Snkr Tech Talk',
    'Canada + Global / English',
    'Independent Canadian creator, Steve. Long-running performance, tech and history content.',
    'YouTube ~17.5k subs, 1,600+ videos. Frequently cited as a credible review source in the hoops community.',
    '23mj88@gmail.com · IG @snkrtechtalk',
    'email',
    'no',
    null,
    'Performance-tech content index + obscure-model discovery + affiliate share',
    5,
    4,
    4,
    'snkrtechtalk',
    'new',
    false,
    null,
    null,
    null,
    null,
    '执行追踪 had this as Wave B — resolved to A per 联系人总表.',
    0,
    0,
    0,
    0,
    array['https://www.youtube.com/channel/UCRZe0TnLQ662pe-a-3czJvg', 'https://www.instagram.com/snkrtechtalk/']
  ),
  (
    7,
    'B',
    'Jasonn杰森教练',
    'China / Chinese',
    'Independent basketball S&C coach and creator. Public bio lists ACE and CSCS credentials.',
    'Covers conditioning, shoe reviews, alignment and ankle topics. Audience skews training-led.',
    'jasonqiu2012 (state your purpose)',
    'wechat',
    'no',
    'ID unconfirmed.',
    'Coach-view shoe-selection logic + student member codes + attributed source links',
    4,
    4,
    4,
    'jasoncoach',
    'new',
    false,
    null,
    null,
    null,
    null,
    'Never render ACE/CSCS as medical credentials. No injury-prevention or foot-diagnosis claims anywhere near this one.',
    0,
    0,
    0,
    0,
    array['https://space.bilibili.com/403385437/', 'https://www.bilibili.com/video/BV1wU4y1U7zW/']
  ),
  (
    8,
    'B',
    'Tommy Liu',
    'North America + Global / English',
    'Independent sneaker reviewer; no fixed footwear-company employer in public sources.',
    'YouTube ~75.3k subs, 890+ videos. Known for short, direct, buying-decision reviews.',
    'IG @tommy_liu_4 · YouTube About business email',
    'dm',
    'no',
    'Business email prefix not yet pulled.',
    'Quick Picker demo + high-intent affiliate share + topic rankings',
    5,
    3,
    5,
    'tommyliu',
    'new',
    false,
    null,
    null,
    null,
    null,
    '75k-sub tier. If no answer, do not sweeten — wait until the site has traffic and come back.',
    0,
    0,
    0,
    0,
    array['https://www.youtube.com/@TommyLiu4', 'https://www.instagram.com/tommy_liu_4/']
  ),
  (
    9,
    'C',
    'ENZO1204',
    'China + Global Chinese / Chinese',
    'Independent performance review creator and content team. Mirinda Studio is a public business contact channel — not evidence of an employer.',
    'Bilibili historically ~500k followers. Still shipping 2026 H1 top-10 performance lists and long-term tests.',
    'Mirindastudio@163.com · 微博 @崔恩泽Enzo · IG @slimcez',
    'email',
    'no',
    null,
    'Rating-methodology collaboration + creator feature page + paid rate OR revenue share',
    5,
    2,
    5,
    'enzo1204',
    'hold',
    false,
    null,
    null,
    null,
    null,
    '执行追踪 had this as Wave A, contradicting his own strategy row. Held at C. When the time comes, ask for a commercial rate — revenue share holds no appeal at this size.',
    0,
    0,
    0,
    0,
    array['https://www.bilibili.com/video/BV1irNR6hEYC/', 'https://www.youtube.com/channel/UCKr8f83OcRVsSlkExuLRZpg/videos']
  ),
  (
    10,
    'B',
    '周余翔Kyrie',
    'China / Chinese',
    'Founder of FutureBasketball, trainer and creator.',
    'Douyin ~188k followers, 4.25m+ likes. Weibo ~171k. Training, on-court play and basketball life.',
    '微信 FutureBasketball2017',
    'wechat',
    'no',
    'ID unconfirmed.',
    'Shoe-picking tool for his students + position/style co-content + member-code share',
    4,
    3,
    4,
    'futurebasketball',
    'new',
    false,
    null,
    null,
    null,
    null,
    '执行追踪 had this as Wave A — resolved to B per 联系人总表. Never confuse with Kyrie Irving. Don''t imply any FutureBasketball–brand tie-up.',
    0,
    0,
    0,
    0,
    array['https://www.douyin.com/user/MS4wLjABAAAAkGgJCwZz6YjNNbbTblyVsda2OQKIwrZcKt5cC_Li2Pk', 'https://space.bilibili.com/96088767/']
  ),
  (
    11,
    'C',
    'WearTesters',
    'Global / English',
    'The longest-running basketball performance review outlet (since 2009). Team-operated, category benchmark.',
    'YouTube ~941k subs. Invented the performance-review category. Active community and comments.',
    'Business email on the @weartesters.com domain — prefix from the About page',
    'email',
    'partial',
    'Domain confirmed. Exact prefix still unverified.',
    'Long game: data-citation partnership. First contact asks only for one line of feedback on a single shoe page — no promotion ask.',
    5,
    1,
    4,
    'weartesters',
    'hold',
    false,
    null,
    null,
    null,
    null,
    null,
    0,
    0,
    0,
    0,
    array['https://weartesters.com', 'https://www.youtube.com/user/weartesters']
  )
on conflict (id) do nothing;

insert into outreach_channels (
  id, name, kind, first_action, why, expected, cost, ref_code, status, clicks, registrations, paid_count, revenue_usd
) values
  (
    'C1',
    'r/BBallShoes (Reddit)',
    'Community',
    'Answer shoe-picking threads as a normal user for two weeks on a low-key account; DM the mods about a tool post. Then post the 540-shoe database with English data on Chinese brands.',
    'The densest concentration of global on-court buying decisions. A tool post that gets upvoted can carry thousands of UV on its own. English data on Chinese brands is exclusive here.',
    '1k–5k UV per post',
    '0',
    'reddit_bballshoes',
    'not started',
    0,
    0,
    0,
    0
  ),
  (
    'C2',
    '虎扑装备区',
    'Community',
    'Same play in Chinese: post spec-comparison charts (same-price domestic vs Nike), link at the end. Read the board rules first — direct ads get pulled.',
    'The highest-density Chinese on-court shoe community. These users are already doing pre-purchase research.',
    '500–3k UV per post',
    '0',
    'hupu',
    'not started',
    0,
    0,
    0,
    0
  ),
  (
    'C3',
    'BIBA League (owned)',
    'Owned',
    'Next game: courtside sign / scorer''s table QR — “look up the shoes on your feet”. One post in each team group. Player-only member codes.',
    'Hundreds of real people who buy shoes and hoop, in a league you run. Zero cost, same-day results, honest feedback. The most underrated row in the whole plan.',
    '100–300 signups cumulative',
    '0',
    'biba',
    'not started',
    0,
    0,
    0,
    0
  ),
  (
    'C4',
    'Bilibili (owned account)',
    'Owned',
    'Turn the database into content: one data-led short per week (“the 10 lightest guard shoes we''ve weighed”). Link in the description and a pinned comment.',
    'You already have the account and the editing chops. Ranking content suits the platform, and it doubles as proof of work for creator outreach.',
    '1k–10k views per video',
    'time',
    'bilibili_own',
    'not started',
    0,
    0,
    0,
    0
  ),
  (
    'C5',
    '小红书',
    'Owned',
    'One templated spec card per shoe, tagged #实战篮球鞋 #篮球鞋推荐.',
    'Card-format posts distribute efficiently here, and it reaches women and entry-level buyers the review channels miss entirely.',
    '500–5k impressions per post',
    'time',
    'xhs',
    'not started',
    0,
    0,
    0,
    0
  ),
  (
    'C6',
    'English long-tail SEO',
    'Compounding',
    'Make sure every shoe page title and H1 covers “<shoe> specs / weight / review”. Chinese-brand English pages first — terms like “Anta KAI 2 specs” are close to uncontested.',
    'English data on Chinese brands is a keyword space nobody is competing for. Do it once, it pays every month. The only channel here that compounds.',
    'thousands UV/month after 3–6 months',
    'time',
    'organic',
    'not started',
    0,
    0,
    0,
    0
  ),
  (
    'C7',
    'WearTesters community',
    'Community',
    'Add data to discussions in their comments — no links at first, just be useful. Site in the profile bio.',
    'The credibility high ground for performance-review readers. Dropping links reads as spam; being useful first doesn''t.',
    'slow, trust-building',
    'time',
    'wt_comm',
    'not started',
    0,
    0,
    0,
    0
  ),
  (
    'C8',
    'The Hoops Geek',
    'Benchmark',
    'Study their rating aggregation and affiliate model. In 1–2 months, if your data depth leads, discuss cross-linking or inclusion.',
    'Proof the aggregate-reviews-plus-affiliate model works, and the reference point for your differentiation: first-party structured data and Chinese brands.',
    '—',
    '0',
    'hoopsgeek',
    'not started',
    0,
    0,
    0,
    0
  )
on conflict (id) do nothing;
