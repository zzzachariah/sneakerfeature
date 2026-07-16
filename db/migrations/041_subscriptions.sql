-- 041_subscriptions.sql
--
-- Premium membership: two paid tiers (pro / max) on top of the free tier, each
-- purchasable for 1 month / 3 months / 1 year / permanent. The billing model is
-- "mixed": the tier's BASE model runs unlimited (no per-query charge) for paid
-- members, while the premium model (claude-fable-5) is metered from a MONTHLY
-- allowance that refreshes every period — so even a "permanent" membership has a
-- bounded monthly API cost.
--
-- Free users keep the existing ai_credits metering (daily check-in), just on a
-- lighter base model (claude-haiku-4-5).

-- --- Subscription state, stored on the profile (mirrors persona/foot_profile) --
alter table profiles
  add column if not exists subscription_tier text not null default 'free'
    check (subscription_tier in ('free', 'pro', 'max')),
  add column if not exists subscription_started_at timestamptz,
  -- NULL expiry + a paid tier means "permanent" (see subscription_is_permanent).
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists subscription_is_permanent boolean not null default false,
  -- Member-only UI prefs: chosen skin, home-section order, menu customization,
  -- default model preference. One flexible column, like persona/foot_profile.
  add column if not exists member_prefs jsonb not null default '{}'::jsonb;

comment on column profiles.subscription_tier is 'free | pro | max';
comment on column profiles.subscription_expires_at is 'NULL + paid tier = permanent; otherwise access ends at this instant';
comment on column profiles.member_prefs is 'Pro/Max UI prefs: { skin, home_order[], menu[], model_pref }';

create index if not exists idx_profiles_subscription
  on profiles (subscription_tier, subscription_expires_at);

-- --- Monthly premium-model allowance ---------------------------------------
-- Separate from ai_credits so the free-tier credit economy and the paid
-- premium-model economy never interfere. Refreshed lazily (see spend_allowance /
-- claim_allowance): the first request after a period boundary tops the balance
-- back up to monthly_grant.
create table if not exists subscription_allowances (
  user_id uuid primary key references profiles(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  monthly_grant int not null default 0 check (monthly_grant >= 0),
  period_start timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table subscription_allowances enable row level security;

drop policy if exists "User reads own allowance" on subscription_allowances;
create policy "User reads own allowance" on subscription_allowances
  for select using (auth.uid() = user_id);

drop policy if exists "Admin reads all allowances" on subscription_allowances;
create policy "Admin reads all allowances" on subscription_allowances
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
-- All writes go through the service-role client; no user INSERT/UPDATE policy.

-- Refresh-then-read: if the period has elapsed, reset balance to monthly_grant
-- and restart the clock. Returns the current (post-refresh) balance. Used for
-- display and pre-checks. p_period_seconds is the length of one allowance cycle.
create or replace function refresh_allowance(
  p_user_id uuid,
  p_monthly_grant int,
  p_period_seconds bigint
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
  v_period interval := (p_period_seconds || ' seconds')::interval;
begin
  insert into subscription_allowances (user_id, balance, monthly_grant, period_start, updated_at)
    values (p_user_id, p_monthly_grant, p_monthly_grant, now(), now())
  on conflict (user_id) do update
    set monthly_grant = p_monthly_grant,
        balance = case
          when subscription_allowances.period_start <= now() - v_period then p_monthly_grant
          else subscription_allowances.balance
        end,
        period_start = case
          when subscription_allowances.period_start <= now() - v_period then now()
          else subscription_allowances.period_start
        end,
        updated_at = now()
  returning balance into v_balance;

  return v_balance;
end;
$$;

-- Atomic spend with the same lazy refresh. Raises 'insufficient_allowance' if
-- the balance (after any period refresh) can't cover p_amount. Returns the new
-- balance on success.
create or replace function spend_allowance(
  p_user_id uuid,
  p_amount int,
  p_monthly_grant int,
  p_period_seconds bigint
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
  v_period interval := (p_period_seconds || ' seconds')::interval;
begin
  -- Ensure a row exists and is refreshed for the current period first.
  perform refresh_allowance(p_user_id, p_monthly_grant, p_period_seconds);

  update subscription_allowances
    set balance = balance - p_amount,
        updated_at = now()
    where user_id = p_user_id
      and balance >= p_amount
  returning balance into v_balance;

  if v_balance is null then
    raise exception 'insufficient_allowance' using errcode = 'check_violation';
  end if;

  return v_balance;
end;
$$;

grant execute on function refresh_allowance(uuid, int, bigint) to service_role;
grant execute on function spend_allowance(uuid, int, int, bigint) to service_role;
