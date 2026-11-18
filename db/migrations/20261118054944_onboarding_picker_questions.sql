-- Pause the introductory picker for visitor answers without spending a second
-- attempt. Existing completed recommendations remain immutable and readable.
alter table onboarding_private.picker_demos drop constraint picker_demos_status_check;
alter table onboarding_private.picker_demos add constraint picker_demos_status_check
  check (status in ('running','awaiting_answers','complete','failed'));

create or replace function public.onboarding_picker_read(p_visitor text) returns jsonb
language sql security invoker set search_path = '' as $$
  select jsonb_build_object('runId', run_id, 'status', case when status='running' and expires_at < now() then 'failed' else status end,
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
    if existing.status in ('complete','awaiting_answers') or (existing.status='running' and existing.expires_at>now()) then
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
  if p_status not in ('running','awaiting_answers','complete','failed') or octet_length(p_payload::text)>180000 then raise exception 'invalid_demo'; end if;
  update onboarding_private.picker_demos set status=p_status,payload=p_payload
    where visitor_hash=p_visitor and run_id=p_run and status='running' and expires_at>now();
  return found;
end;
$$;

-- Only the server can resume. The opaque visitor token, exact run id and row
-- lock make concurrent/replayed answer submissions claim at most one AI run.
create function public.onboarding_picker_resume(p_visitor text, p_run uuid, p_network text, p_answers jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare existing onboarding_private.picker_demos;
begin
  if p_visitor !~ '^[a-f0-9]{64}$' or p_network !~ '^[a-f0-9]{64}$'
    or p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text)>12000
    then raise exception 'invalid_demo'; end if;
  perform pg_advisory_xact_lock(7053102026);
  select * into existing from onboarding_private.picker_demos
    where visitor_hash=p_visitor and created_at>now()-interval '30 days' for update;
  if not found or existing.run_id<>p_run then raise exception 'demo_stale'; end if;
  if existing.status<>'awaiting_answers' then
    return jsonb_build_object('claimed',false,'snapshot',public.onboarding_picker_read(p_visitor));
  end if;
  -- Count this run on the day generation resumes too. Reuse its admission row,
  -- so answering questions neither consumes an extra attempt nor bypasses caps.
  if (select count(*) from onboarding_private.picker_demo_attempts where run_id<>p_run and started_at>now()-interval '24 hours')>=200
    or (select count(*) from onboarding_private.picker_demo_attempts where run_id<>p_run and network_hash=p_network and started_at>now()-interval '24 hours')>=10
    or exists(select 1 from onboarding_private.picker_demos where visitor_hash<>p_visitor and network_hash=p_network and status='running' and expires_at>now())
    then raise exception 'demo_rate_limited'; end if;
  update onboarding_private.picker_demos set status='running', network_hash=p_network,
    started_at=now(), expires_at=now()+interval '150 seconds',
    payload=payload || jsonb_build_object('answers',p_answers,'phase','recommendations')
    where visitor_hash=p_visitor;
  insert into onboarding_private.picker_demo_attempts(run_id,network_hash,started_at) values(p_run,p_network,now())
    on conflict(run_id) do update set network_hash=excluded.network_hash,started_at=excluded.started_at;
  return jsonb_build_object('claimed',true,'runId',p_run,'snapshot',public.onboarding_picker_read(p_visitor));
end;
$$;
revoke all on function public.onboarding_picker_resume(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.onboarding_picker_resume(text,uuid,text,jsonb) to service_role;
