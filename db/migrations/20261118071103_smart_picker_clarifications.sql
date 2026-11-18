-- One authenticated Smart Picker clarification round per chat. Service routes
-- verify ownership; ordinary clients cannot read/write the admission state.
create table public.ai_chat_clarifications (
 id uuid primary key default gen_random_uuid(),
 chat_id uuid not null unique references public.ai_chats(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 status text not null check(status in ('generating','awaiting_answers','answering','complete','failed')),
 original_message text not null, context jsonb not null,
 requested_count int not null check(requested_count between 1 and 10), model text not null,
 lang text not null check(lang in ('zh','en')), questions jsonb, answers jsonb,
 user_message_id uuid not null, assistant_message_id uuid not null, answer_message_id uuid,
 request_id uuid not null, expires_at timestamptz not null,
 created_at timestamptz not null default now(), error text
);
alter table public.ai_chat_clarifications enable row level security;
revoke all on public.ai_chat_clarifications from public,anon,authenticated;
grant select,insert,update,delete on public.ai_chat_clarifications to service_role;

create function public.begin_ai_chat_clarification(p_chat_id uuid,p_user_id uuid,p_request_id uuid,p_message text,p_context jsonb,p_count int,p_model text,p_lang text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.ai_chat_clarifications; u uuid; a uuid;
begin
 perform 1 from public.ai_chats where id=p_chat_id and user_id=p_user_id for update;
 if not found then raise exception 'chat_not_found'; end if;
 if not exists(select 1 from public.ai_request_reservations where id=p_request_id and user_id=p_user_id and scope='chat' and billing='unlimited' and reserved=0 and status='pending' and expires_at>now()) then raise exception 'invalid_reservation'; end if;
 select * into c from public.ai_chat_clarifications where chat_id=p_chat_id for update;
 if found and c.status<>'failed' then return jsonb_build_object('claimed',false,'row',to_jsonb(c)); end if;
 if exists(select 1 from public.ai_messages where chat_id=p_chat_id and role='assistant' and jsonb_array_length(coalesce(recommendations,'[]'::jsonb))>0) then raise exception 'existing_recommendations'; end if;
 if p_message is null or length(p_message) not between 1 and 2000 or octet_length(p_context::text)>18000 or p_count not between 1 and 10 or p_lang not in ('zh','en') then raise exception 'invalid_clarification'; end if;
 if c.id is null then
  insert into public.ai_messages(chat_id,role,content,credits_charged) values(p_chat_id,'user',p_message,0) returning id into u;
  insert into public.ai_messages(chat_id,role,content,credits_charged) values(p_chat_id,'assistant',case when p_lang='zh' then '先确认几个影响选鞋的细节。' else 'Let’s confirm a few details before choosing shoes.' end,0) returning id into a;
  insert into public.ai_chat_clarifications(chat_id,user_id,status,original_message,context,requested_count,model,lang,user_message_id,assistant_message_id,request_id,expires_at)
   values(p_chat_id,p_user_id,'generating',p_message,p_context,p_count,p_model,p_lang,u,a,p_request_id,now()+interval '2 minutes') returning * into c;
 else
  update public.ai_chat_clarifications set status='generating',request_id=p_request_id,expires_at=now()+interval '2 minutes',error=null where id=c.id returning * into c;
 end if;
 update public.ai_chats set updated_at=now(),title=coalesce(title,left(p_message,30)) where id=p_chat_id;
 return jsonb_build_object('claimed',true,'row',to_jsonb(c));
end;$$;

create function public.finish_ai_chat_clarification(p_id uuid,p_user_id uuid,p_request_id uuid,p_questions jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.ai_chat_clarifications;
begin
 select * into c from public.ai_chat_clarifications where id=p_id and user_id=p_user_id and request_id=p_request_id for update;
 if not found or c.status<>'generating' or c.expires_at<=now() then raise exception 'stale_clarification'; end if;
 if jsonb_typeof(p_questions->'questions')<>'array' or jsonb_array_length(p_questions->'questions')<>4 or octet_length(p_questions::text)>16000 then raise exception 'invalid_questions'; end if;
 update public.ai_chat_clarifications set status='awaiting_answers',questions=p_questions,error=null where id=c.id returning * into c;
 update public.ai_messages set content=p_questions->'intro'->>c.lang where id=c.assistant_message_id;
 return to_jsonb(c);
end;$$;

create function public.claim_ai_chat_clarification_answer(p_id uuid,p_chat_id uuid,p_user_id uuid,p_request_id uuid,p_answers jsonb,p_content text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.ai_chat_clarifications; a uuid;
begin
 select * into c from public.ai_chat_clarifications where id=p_id and chat_id=p_chat_id and user_id=p_user_id for update;
 if not found then raise exception 'clarification_not_found'; end if;
 if not exists(select 1 from public.ai_chats where id=p_chat_id and user_id=p_user_id) then raise exception 'chat_not_found'; end if;
 if not exists(select 1 from public.ai_request_reservations where id=p_request_id and user_id=p_user_id and scope='chat' and status='pending' and expires_at>now()) then raise exception 'invalid_reservation'; end if;
 -- A paid reply may have committed even when both settlement responses were
 -- lost. Its receipt is authoritative; reopening metadata never authorizes a
 -- second paid recommendation for the same confirmation round.
 if exists(select 1 from public.ai_request_reservations where id=c.request_id and user_id=p_user_id and result is not null) then
  update public.ai_chat_clarifications set status='complete',error=null where id=c.id returning * into c;
  return jsonb_build_object('claimed',false,'row',to_jsonb(c));
 end if;
 if c.status<>'awaiting_answers' then return jsonb_build_object('claimed',false,'row',to_jsonb(c)); end if;
 if p_answers is null or jsonb_typeof(p_answers->'choices')<>'object' or octet_length(p_answers::text)>6000 or p_content is null or length(p_content)=0 then raise exception 'invalid_answers'; end if;
 insert into public.ai_messages(chat_id,role,content,credits_charged) values(p_chat_id,'user',p_content,0) returning id into a;
 update public.ai_chat_clarifications set status='answering',answers=p_answers,answer_message_id=a,request_id=p_request_id,expires_at=now()+interval '6 minutes',error=null where id=p_id returning * into c;
 return jsonb_build_object('claimed',true,'row',to_jsonb(c));
end;$$;
revoke all on function public.begin_ai_chat_clarification(uuid,uuid,uuid,text,jsonb,int,text,text),public.finish_ai_chat_clarification(uuid,uuid,uuid,jsonb),public.claim_ai_chat_clarification_answer(uuid,uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.begin_ai_chat_clarification(uuid,uuid,uuid,text,jsonb,int,text,text),public.finish_ai_chat_clarification(uuid,uuid,uuid,jsonb),public.claim_ai_chat_clarification_answer(uuid,uuid,uuid,uuid,jsonb,text) to service_role;
