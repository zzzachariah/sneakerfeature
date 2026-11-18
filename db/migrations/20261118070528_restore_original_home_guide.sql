-- Restore the original homepage guide contract after the question-flow rollout.
-- Keep the applied question migration in history; this is a forward correction.
-- Run atomically so reservations/resumes cannot race the state transition.
select pg_advisory_xact_lock(7053102026);
lock table onboarding_private.picker_demos in access exclusive mode;

-- Preserve visitor rows, attempt accounting, question payloads and completed
-- results. Only the removed waiting state needs recovery. The original retry
-- limit remains authoritative; no visitor or network budget is reset.
update onboarding_private.picker_demos
  set status='failed', expires_at=least(expires_at, now()),
      payload=payload || jsonb_build_object('error','home_guide_restored','finishedAt',now())
  where status='awaiting_answers';

alter table onboarding_private.picker_demos drop constraint picker_demos_status_check;
alter table onboarding_private.picker_demos add constraint picker_demos_status_check
  check (status in ('running','complete','failed'));
drop function if exists public.onboarding_picker_resume(text,uuid,text,jsonb);

-- Definitions below are restored verbatim from 20261030204120, apart from
-- CREATE OR REPLACE, including service-role-only grants and the original caps.
create or replace function public.onboarding_picker_read(p_visitor text) returns jsonb
language sql security invoker set search_path = '' as $$
  select jsonb_build_object('status', case when status='running' and expires_at < now() then 'failed' else status end,
    'startedAt', started_at, 'retryable', attempts < 2, 'payload', payload,
    'error', case when status='running' and expires_at < now() then 'timeout' else null end)
  from onboarding_private.picker_demos where visitor_hash=p_visitor and created_at > now()-interval '30 days';
$$;
create or replace function public.onboarding_picker_reserve(p_visitor text, p_network text, p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare existing onboarding_private.picker_demos; new_run uuid := gen_random_uuid();
begin
  if p_visitor !~ '^[a-f0-9]{64}$' or p_network !~ '^[a-f0-9]{64}$' or octet_length(p_payload::text)>12000 then raise exception 'invalid_demo'; end if;
  -- Serializes the tiny reservation transaction, never the AI work itself.
  perform pg_advisory_xact_lock(7053102026);
  delete from onboarding_private.picker_demo_attempts where started_at < now()-interval '2 days';
  delete from onboarding_private.picker_demos where created_at < now()-interval '30 days';
  select * into existing from onboarding_private.picker_demos where visitor_hash=p_visitor for update;
  if found then
    if existing.status='complete' or (existing.status='running' and existing.expires_at>now()) then
      return jsonb_build_object('claimed',false,'snapshot',public.onboarding_picker_read(p_visitor));
    end if;
    if existing.attempts>=2 then return jsonb_build_object('claimed',false,'snapshot',public.onboarding_picker_read(p_visitor)); end if;
    if existing.started_at > now()-interval '30 seconds' then raise exception 'demo_cooldown'; end if;
  end if;
  if (select count(*) from onboarding_private.picker_demo_attempts where started_at > now()-interval '24 hours') >= 200
    or (select count(*) from onboarding_private.picker_demo_attempts where network_hash=p_network and started_at>now()-interval '24 hours')>=10
    or exists(select 1 from onboarding_private.picker_demos where network_hash=p_network and status='running' and expires_at>now())
    then raise exception 'demo_rate_limited'; end if;
  insert into onboarding_private.picker_demos(visitor_hash,run_id,network_hash,status,expires_at,payload)
    values(p_visitor,new_run,p_network,'running',now()+interval '150 seconds',p_payload)
    on conflict(visitor_hash) do update set run_id=new_run,network_hash=p_network,status='running',attempts=onboarding_private.picker_demos.attempts+1,
      started_at=now(),expires_at=now()+interval '150 seconds',payload=p_payload;
  insert into onboarding_private.picker_demo_attempts(run_id,network_hash) values(new_run,p_network);
  return jsonb_build_object('claimed',true,'runId',new_run,'snapshot',public.onboarding_picker_read(p_visitor));
end;
$$;
create or replace function public.onboarding_picker_write(p_visitor text,p_run uuid,p_status text,p_payload jsonb) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  if p_status not in ('running','complete','failed') or octet_length(p_payload::text)>180000 then raise exception 'invalid_demo'; end if;
  update onboarding_private.picker_demos set status=p_status,payload=p_payload
    where visitor_hash=p_visitor and run_id=p_run and status='running' and expires_at>now();
  return found;
end;
$$;
revoke all on function public.onboarding_picker_read(text), public.onboarding_picker_reserve(text,text,jsonb), public.onboarding_picker_write(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.onboarding_picker_read(text), public.onboarding_picker_reserve(text,text,jsonb), public.onboarding_picker_write(text,uuid,text,jsonb) to service_role;
