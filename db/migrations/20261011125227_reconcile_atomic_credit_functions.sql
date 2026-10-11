-- Reconcile the live schema with credit calls introduced in legacy migration 039.
-- Additive reason values and backend-only, validated atomic balance mutations.
begin;
alter table public.ai_credits add column if not exists last_checkin_at timestamptz;
alter table public.ai_credit_transactions drop constraint if exists ai_credit_transactions_reason_check;
alter table public.ai_credit_transactions add constraint ai_credit_transactions_reason_check
  check (reason in ('grant','spend','recharge','daily_checkin','admin_clear'));

create or replace function public.adjust_credits(p_user_id uuid, p_delta int, p_reason text, p_label text default null)
returns int language plpgsql security invoker set search_path = '' as $$
declare v_balance int;
begin
  if p_user_id is null or p_delta is null or p_delta = 0 or p_reason is null or p_reason not in ('grant','spend','recharge','daily_checkin','admin_clear') then
    raise exception 'invalid_credit_parameters' using errcode = '22023';
  end if;
  insert into public.ai_credits(user_id,balance,updated_at) values(p_user_id,0,now()) on conflict(user_id) do nothing;
  update public.ai_credits set balance = balance + p_delta, updated_at = now()
    where user_id=p_user_id and balance + p_delta >= 0 returning balance into v_balance;
  if v_balance is null then raise exception 'insufficient_credits' using errcode = '23514'; end if;
  insert into public.ai_credit_transactions(user_id,delta,reason,package_label) values(p_user_id,p_delta,p_reason,p_label);
  return v_balance;
end; $$;

create or replace function public.spend_credits(p_user_id uuid, p_amount int)
returns int language plpgsql security invoker set search_path = '' as $$
begin
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_credit_amount' using errcode = '22023'; end if;
  return public.adjust_credits(p_user_id,-p_amount,'spend',null);
end; $$;

create or replace function public.claim_daily_checkin(p_user_id uuid, p_amount int, p_interval_ms bigint)
returns int language plpgsql security invoker set search_path = '' as $$
declare v_balance int; v_interval interval;
begin
  if p_user_id is null or p_amount is null or p_amount <= 0 or p_interval_ms is null or p_interval_ms <= 0 then
    raise exception 'invalid_checkin_parameters' using errcode = '22023';
  end if;
  v_interval := make_interval(secs => p_interval_ms::double precision / 1000);
  insert into public.ai_credits(user_id,balance,updated_at) values(p_user_id,0,now()) on conflict(user_id) do nothing;
  update public.ai_credits set balance=balance+p_amount,last_checkin_at=now(),updated_at=now()
    where user_id=p_user_id and (last_checkin_at is null or last_checkin_at <= now()-v_interval)
    returning balance into v_balance;
  if v_balance is null then return null; end if;
  insert into public.ai_credit_transactions(user_id,delta,reason) values(p_user_id,p_amount,'daily_checkin');
  return v_balance;
end; $$;
revoke all on function public.adjust_credits(uuid,int,text,text),public.spend_credits(uuid,int),public.claim_daily_checkin(uuid,int,bigint) from public,anon,authenticated;
grant execute on function public.adjust_credits(uuid,int,text,text),public.spend_credits(uuid,int),public.claim_daily_checkin(uuid,int,bigint) to service_role;
grant all on public.ai_credits,public.ai_credit_transactions to service_role;
commit;
