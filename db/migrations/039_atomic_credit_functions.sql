-- 039_atomic_credit_functions.sql
--
-- Fix: credit balance mutations were done as read-then-write from application
-- code. Because the daily check-in guarded its UPDATE on last_checkin_at while
-- deductCredits guarded on balance, a check-in racing a spend could overwrite
-- the deduction (lost update) — a user could end a concurrent request with MORE
-- credits than they started with, i.e. unlimited free AI. grantCredits had no
-- guard at all.
--
-- These functions perform the balance change and the ledger insert atomically
-- inside a single statement/transaction using `balance = balance + delta`, so
-- concurrent writers serialize on the row lock instead of clobbering each other.
-- SECURITY DEFINER so they run with the owner's rights; only the service role
-- is granted EXECUTE (application already funnels all writes through the
-- service-role client).

-- Grant / recharge / admin adjustment. Positive or negative delta.
create or replace function adjust_credits(
  p_user_id uuid,
  p_delta int,
  p_reason text,
  p_label text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  insert into ai_credits (user_id, balance, updated_at)
    values (p_user_id, greatest(p_delta, 0), now())
  on conflict (user_id) do update
    set balance = ai_credits.balance + p_delta,
        updated_at = now()
  returning balance into v_balance;

  insert into ai_credit_transactions (user_id, delta, reason, package_label)
    values (p_user_id, p_delta, p_reason, p_label);

  return v_balance;
end;
$$;

-- Spend. Raises 'insufficient_credits' if the balance would go negative; the
-- WHERE guard makes the check-and-decrement atomic under concurrency.
create or replace function spend_credits(
  p_user_id uuid,
  p_amount int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  update ai_credits
    set balance = balance - p_amount,
        updated_at = now()
    where user_id = p_user_id
      and balance >= p_amount
  returning balance into v_balance;

  if v_balance is null then
    raise exception 'insufficient_credits' using errcode = 'check_violation';
  end if;

  insert into ai_credit_transactions (user_id, delta, reason)
    values (p_user_id, -p_amount, 'spend');

  return v_balance;
end;
$$;

-- Daily check-in. Atomically grants p_amount only if the interval has elapsed;
-- the WHERE clause on last_checkin_at makes a double-click a no-op. Returns the
-- new balance on success, or NULL if the claim was rejected (already claimed).
create or replace function claim_daily_checkin(
  p_user_id uuid,
  p_amount int,
  p_interval_ms bigint
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
  v_interval interval := (p_interval_ms || ' milliseconds')::interval;
begin
  if p_amount <= 0 then
    return null;
  end if;

  -- Ensure a row exists so the UPDATE below has something to lock.
  insert into ai_credits (user_id, balance, updated_at)
    values (p_user_id, 0, now())
  on conflict (user_id) do nothing;

  update ai_credits
    set balance = balance + p_amount,
        last_checkin_at = now(),
        updated_at = now()
    where user_id = p_user_id
      and (last_checkin_at is null or last_checkin_at <= now() - v_interval)
  returning balance into v_balance;

  if v_balance is null then
    return null;
  end if;

  insert into ai_credit_transactions (user_id, delta, reason)
    values (p_user_id, p_amount, 'daily_checkin');

  return v_balance;
end;
$$;

revoke all on function adjust_credits(uuid, int, text, text) from public, anon, authenticated;
revoke all on function spend_credits(uuid, int) from public, anon, authenticated;
revoke all on function claim_daily_checkin(uuid, int, bigint) from public, anon, authenticated;
grant execute on function adjust_credits(uuid, int, text, text) to service_role;
grant execute on function spend_credits(uuid, int) to service_role;
grant execute on function claim_daily_checkin(uuid, int, bigint) to service_role;
