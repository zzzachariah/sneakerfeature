-- Server-only reservations: shared limits and funds are claimed before AI I/O.
create table if not exists public.ai_request_reservations (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check(scope in ('chat','advisor','scan')),
  billing text not null check(billing in ('credits','allowance','unlimited')),
  reserved int not null check(reserved between 0 and 10),
  charged int not null default 0,
  status text not null default 'pending' check(status in ('pending','settled','refunded')),
  allowance_period timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 minutes',
  final_balance int
);
create index if not exists ai_reservations_user_created on public.ai_request_reservations(user_id, created_at desc);
alter table public.ai_request_reservations enable row level security;
revoke all on public.ai_request_reservations from public, anon, authenticated;
grant all on public.ai_request_reservations to service_role;

create or replace function public.finish_ai_request(p_id uuid, p_user_id uuid, p_charge int)
returns int language plpgsql security invoker set search_path = '' as $$
declare r public.ai_request_reservations%rowtype; v_refund int; v_balance int := 0;
begin
  select * into r from public.ai_request_reservations where id=p_id and user_id=p_user_id for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if p_charge is null or p_charge < 0 or p_charge > r.reserved then raise exception 'invalid_charge'; end if;
  if r.status <> 'pending' then
    if p_charge <> r.charged then raise exception 'reservation_already_finalized'; end if;
    return r.final_balance;
  end if;
  if p_charge > 0 and r.expires_at <= now() then raise exception 'reservation_expired'; end if;
  v_refund := r.reserved-p_charge;
  if r.billing='credits' then
    update public.ai_credits set balance=balance+v_refund, updated_at=now() where user_id=p_user_id returning balance into v_balance;
    if v_refund > 0 then
      insert into public.ai_credit_transactions(user_id,delta,reason,package_label)
        values(p_user_id,v_refund,'grant','AI reservation refund');
    end if;
  elsif r.billing='allowance' then
    -- Never add an old-period refund to a newly refreshed monthly allowance.
    update public.subscription_allowances set balance=balance+v_refund, updated_at=now()
      where user_id=p_user_id and period_start=r.allowance_period returning balance into v_balance;
    if not found then select balance into v_balance from public.subscription_allowances where user_id=p_user_id; end if;
  end if;
  update public.ai_request_reservations set status=case when p_charge=0 then 'refunded' else 'settled' end,
    charged=p_charge, final_balance=coalesce(v_balance,0) where id=p_id;
  return coalesce(v_balance,0);
end; $$;

create or replace function public.reserve_ai_request(p_id uuid,p_user_id uuid,p_scope text,p_billing text,p_amount int)
returns int language plpgsql security invoker set search_path = '' as $$
declare v_balance int := 0; v_period timestamptz; stale record;
begin
  if p_id is null or p_user_id is null or p_scope is null or p_scope not in ('chat','advisor','scan') or
    p_billing is null or p_billing not in ('credits','allowance','unlimited') or p_amount is null or p_amount not between 0 and 10 or
    (p_billing='unlimited' and p_amount<>0) or (p_billing<>'unlimited' and p_amount=0)
    then raise exception 'invalid_reservation'; end if;
  -- Lock by account across all server instances and all three expensive routes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 731));
  for stale in select id from public.ai_request_reservations where user_id=p_user_id and status='pending' and expires_at<=now()
    loop perform public.finish_ai_request(stale.id,p_user_id,0); end loop;
  if exists(select 1 from public.ai_request_reservations where id=p_id) then raise exception 'duplicate_request'; end if;
  if exists(select 1 from public.ai_request_reservations where user_id=p_user_id and status='pending') then raise exception 'request_in_progress'; end if;
  if (select count(*) from public.ai_request_reservations where user_id=p_user_id and scope=p_scope and
    created_at>now()-case when p_scope='scan' then interval '1 hour' else interval '1 minute' end) >=
    (case when p_scope='scan' then 10 when p_scope='advisor' then 20 else 30 end) then raise exception 'rate_limited'; end if;
  if p_scope='scan' and exists(select 1 from public.ai_request_reservations where user_id=p_user_id and scope='scan' and created_at>now()-interval '1 minute') then raise exception 'rate_limited'; end if;
  if p_billing='credits' then
    update public.ai_credits set balance=balance-p_amount,updated_at=now() where user_id=p_user_id and balance>=p_amount returning balance into v_balance;
    if not found then raise exception 'insufficient_credits'; end if;
    insert into public.ai_credit_transactions(user_id,delta,reason,package_label) values(p_user_id,-p_amount,'spend','AI reservation');
  elsif p_billing='allowance' then
    update public.subscription_allowances set balance=balance-p_amount,updated_at=now() where user_id=p_user_id and balance>=p_amount returning balance,period_start into v_balance,v_period;
    if not found then raise exception 'insufficient_allowance'; end if;
  end if;
  insert into public.ai_request_reservations(id,user_id,scope,billing,reserved,allowance_period)
    values(p_id,p_user_id,p_scope,p_billing,p_amount,v_period);
  return v_balance;
end; $$;
revoke all on function public.reserve_ai_request(uuid,uuid,text,text,int) from public,anon,authenticated;
revoke all on function public.finish_ai_request(uuid,uuid,int) from public,anon,authenticated;
grant execute on function public.reserve_ai_request(uuid,uuid,text,text,int) to service_role;
grant execute on function public.finish_ai_request(uuid,uuid,int) to service_role;

alter table public.ai_request_reservations add column if not exists result jsonb;
alter table public.ai_messages add column if not exists follow_up text;
-- Persist the reply and settle its charge in one transaction. A retry returns
-- the same receipt and never adds a second assistant message or second charge.
create or replace function public.complete_ai_request(p_id uuid,p_user_id uuid,p_chat_id uuid,p_content text,p_recommendations jsonb,p_follow_up text,p_charge int)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.ai_request_reservations%rowtype; v_balance int; v_id uuid; v_created timestamptz; receipt jsonb;
begin
  select * into r from public.ai_request_reservations where id=p_id and user_id=p_user_id for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if r.result is not null then return r.result; end if;
  if r.status<>'pending' or r.expires_at<=now() then raise exception 'reservation_expired'; end if;
  if p_content is null or length(p_content)=0 then raise exception 'empty_reply'; end if;
  if r.scope='chat' then
    if not exists(select 1 from public.ai_chats where id=p_chat_id and user_id=p_user_id) then raise exception 'chat_not_found'; end if;
  elsif r.scope='advisor' then
    if not exists(select 1 from public.advisor_chats where id=p_chat_id and user_id=p_user_id) then raise exception 'chat_not_found'; end if;
  else raise exception 'invalid_scope'; end if;
  v_balance := public.finish_ai_request(p_id,p_user_id,p_charge);
  if r.scope='chat' then
    insert into public.ai_messages(chat_id,role,content,recommendations,follow_up,credits_charged)
      values(p_chat_id,'assistant',p_content,p_recommendations,p_follow_up,p_charge) returning id,created_at into v_id,v_created;
  else
    insert into public.advisor_messages(chat_id,user_id,role,content,allowance_charged)
      values(p_chat_id,p_user_id,'assistant',p_content,p_charge) returning id,created_at into v_id,v_created;
  end if;
  receipt := jsonb_build_object('id',v_id,'created_at',v_created,'credits_charged',p_charge,'balance',v_balance);
  update public.ai_request_reservations set result=receipt where id=p_id;
  return receipt;
end; $$;
revoke all on function public.complete_ai_request(uuid,uuid,uuid,text,jsonb,text,int) from public,anon,authenticated;
grant execute on function public.complete_ai_request(uuid,uuid,uuid,text,jsonb,text,int) to service_role;

create or replace function public.recover_ai_requests(p_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare stale record;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,731));
  for stale in select id from public.ai_request_reservations where user_id=p_user_id and status='pending' and expires_at<=now()
    loop perform public.finish_ai_request(stale.id,p_user_id,0); end loop;
end; $$;
revoke all on function public.recover_ai_requests(uuid) from public,anon,authenticated;
grant execute on function public.recover_ai_requests(uuid) to service_role;
