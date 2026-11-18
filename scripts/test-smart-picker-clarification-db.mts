import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const user = randomUUID(), other = randomUUID(), chat = randomUUID(), oldChat = randomUUID();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create table profiles(id uuid primary key);
create table ai_credits(user_id uuid primary key, balance int check(balance>=0), updated_at timestamptz);
create table ai_credit_transactions(user_id uuid,delta int,reason text check(reason in ('grant','spend','recharge')),package_label text);
create table subscription_allowances(user_id uuid primary key,balance int check(balance>=0),period_start timestamptz,updated_at timestamptz);
create table ai_chats(id uuid primary key,user_id uuid,title text,updated_at timestamptz);
create table advisor_chats(id uuid primary key,user_id uuid);
create table ai_messages(id uuid default gen_random_uuid(),chat_id uuid,role text,content text not null check(content<>'FAIL'),recommendations jsonb,credits_charged int,created_at timestamptz default now());
create table advisor_messages(id uuid default gen_random_uuid(),chat_id uuid,user_id uuid,role text,content text,allowance_charged int,created_at timestamptz default now());
insert into profiles values('${user}'),('${other}');
insert into ai_credits values('${user}',0,now());
insert into subscription_allowances values('${user}',0,now(),now());
insert into ai_chats(id,user_id) values('${chat}','${user}'),('${oldChat}','${user}');
insert into ai_messages(chat_id,role,content,recommendations,credits_charged) values('${oldChat}','assistant','Existing recommendations','[{"shoe_id":"existing-shoe"}]',1);
grant usage on schema public to service_role,anon,authenticated;
grant all on all tables in schema public to service_role;
`);
for (const file of ["20261011123631_reserve_ai_requests.sql", "20261118071103_smart_picker_clarifications.sql"]) {
  await db.exec(await readFile(new URL(`../db/migrations/${file}`, import.meta.url), "utf8"));
}
type Row = { id: string; status: string; requested_count: number; model: string; assistant_message_id: string; answers: unknown };
const query = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query<T>(sql, args)).rows[0];
const reserve = (id: string, billing = "unlimited", count = 0) => query("select reserve_ai_request($1,$2,'chat',$3,$4) as balance", [id, user, billing, count]);
const finish = (id: string, charge = 0) => query("select finish_ai_request($1,$2,$3) as balance", [id, user, charge]);
const begin = async (request: string, target = chat, owner = user) => (await query<{ result: { claimed: boolean; row: Row } }>("select begin_ai_chat_clarification($1,$2,$3,$4,$5,5,'sonnet-slot','en') as result", [target, owner, request, "Outdoor shoes, please", { persona: null, footProfile: null, ratingFocus: null }])).result;
const questions = { intro: { en: "Confirm your needs", zh: "确认需求" }, questions: ["profile", "age", "fit", "budget"].map(id => ({ id, prompt: { en: "Question", zh: "问题" }, reason: { en: "Reason", zh: "原因" } })) };
const answers = { choices: { profile: "confirm", age: "any", fit: "wide", budget: "limit" }, note: "800 CNY" };
const claim = async (id: string, request: string, owner = user, target = chat) => (await query<{ result: { claimed: boolean; row: Row } }>("select claim_ai_chat_clarification_answer($1,$2,$3,$4,$5,'My answers') as result", [id, target, owner, request, answers])).result;
try {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(query("select * from ai_chat_clarifications"), /permission denied/);
    await assert.rejects(begin(randomUUID()), /permission denied/);
    await assert.rejects(claim(randomUUID(), randomUUID()), /permission denied/);
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  await assert.rejects(begin(randomUUID()), /invalid_reservation/);
  const questionRequest = randomUUID();
  await reserve(questionRequest);
  await assert.rejects(begin(questionRequest, chat, other), /chat_not_found/);
  await assert.rejects(begin(questionRequest, oldChat), /existing_recommendations/);
  const first = await begin(questionRequest);
  assert.equal(first.claimed, true);
  assert.equal(first.row.status, "generating");
  assert.equal(first.row.requested_count, 5);
  assert.equal(first.row.model, "sonnet-slot");
  assert.equal((await query("select balance from ai_credits")).balance, 0, "Question round works at zero credits");
  assert.equal((await begin(questionRequest)).claimed, false, "Repeated initial requests reuse the same round");
  assert.equal((await query("select count(*)::int as n from ai_messages where chat_id=$1", [chat])).n, 2);
  await assert.rejects(query("select finish_ai_chat_clarification($1,$2,$3,$4)", [first.row.id, user, randomUUID(), questions]), /stale_clarification/);
  const ready = await query<{ result: Row }>("select finish_ai_chat_clarification($1,$2,$3,$4) as result", [first.row.id, user, questionRequest, questions]);
  assert.equal(ready.result.status, "awaiting_answers");
  await finish(questionRequest);
  assert.equal((await query("select content from ai_messages where id=$1", [first.row.assistant_message_id])).content, questions.intro.en);
  await assert.rejects(reserve(randomUUID(), "credits", 5), /insufficient_credits/);
  assert.equal((await query("select status from ai_chat_clarifications where id=$1", [first.row.id])).status, "awaiting_answers");

  await db.exec("update ai_credits set balance=8");
  const answerRequest = randomUUID();
  await reserve(answerRequest, "credits", 5);
  await assert.rejects(claim(first.row.id, answerRequest, other), /clarification_not_found/);
  await assert.rejects(claim(first.row.id, answerRequest, user, oldChat), /clarification_not_found/);
  const submissions = await Promise.all([claim(first.row.id, answerRequest), claim(first.row.id, answerRequest)]);
  assert.equal(submissions.filter(s => s.claimed).length, 1, "Answer claim is atomic");
  assert.deepEqual(submissions[0].row.answers, answers);
  assert.equal((await query("select count(*)::int as n from ai_messages where chat_id=$1", [chat])).n, 3, "Duplicate submission adds no duplicate answer message");
  await assert.rejects(query("select complete_ai_request($1,$2,$3,'FAIL',null,null,5)", [answerRequest, user, chat]), /check constraint/);
  await finish(answerRequest);
  assert.equal((await query("select balance from ai_credits")).balance, 8, "Failed recommendation is refunded");
  await db.query("update ai_chat_clarifications set status='awaiting_answers' where id=$1", [first.row.id]);
  const retry = randomUUID();
  await reserve(retry, "credits", 5);
  assert.equal((await claim(first.row.id, retry)).claimed, true, "Saved answers remain retryable");
  const complete = () => query("select complete_ai_request($1,$2,$3,'Verified recommendations',$4,null,5) as receipt", [retry, user, chat, [{ shoe_id: "verified" }]]);
  const receipt = await complete();
  assert.deepEqual(await complete(), receipt, "Unknown transport outcome can settle only once");
  await assert.rejects(finish(retry), /reservation_already_finalized/, "A settled paid reply cannot be refunded by a late retry");
  assert.equal((await query("select balance from ai_credits")).balance, 3, "Questions charged zero, final recommendations charged once");
  assert.equal((await query("select count(*)::int as n from ai_messages where chat_id=$1 and recommendations is not null", [chat])).n, 1);
  assert.ok((await query("select result from ai_request_reservations where id=$1", [retry])).result, "GET can repair completion from the settlement receipt");
  // Simulate two lost settlement responses and stale failure metadata.
  await db.query("update ai_chat_clarifications set status='awaiting_answers' where id=$1", [first.row.id]);
  const uncertainRetry = randomUUID();
  await reserve(uncertainRetry, "credits", 3);
  const settledClaim = await claim(first.row.id, uncertainRetry);
  assert.equal(settledClaim.claimed, false, "Existing settlement blocks a second paid run even if metadata was reopened");
  assert.equal(settledClaim.row.status, "complete");
  await finish(uncertainRetry);
  assert.equal((await query("select balance from ai_credits")).balance, 3);
  assert.equal((await query("select count(*)::int as n from ai_messages where chat_id=$1 and recommendations is not null", [chat])).n, 1);
  await db.query("delete from ai_chats where id=$1", [chat]);
  assert.equal((await query("select count(*)::int as n from ai_chat_clarifications")).n, 0, "Deleting chat removes private answers");
  console.log("Smart Picker DB: service-only state, ownership, free questions, single answer claim, retry/refund, once-only settlement and deletion passed.");
} finally { await db.close(); }
