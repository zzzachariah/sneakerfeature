import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

// Runs only against an explicitly configured local Unix socket and a dedicated
// disposable database. No production URL, credentials or remote host is accepted.
const binary = process.env.SF_TEST_PSQL;
const socket = process.env.SF_TEST_PGSOCKET;
const port = process.env.SF_TEST_PGPORT ?? "55439";
const user = process.env.SF_TEST_PGUSER ?? "onboarding_test";
const database = process.env.SF_TEST_PGDATABASE ?? "onboarding_test";
assert.ok(binary?.startsWith("/"), "Set SF_TEST_PSQL to a local psql binary");
assert.ok(socket?.startsWith("/") && socket.includes("onboarding-postgres"), "A dedicated local test socket is required");
assert.match(database, /^onboarding_test(?:_[a-z0-9]+)?$/);
const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", port, "-U", user, "-d", database];
const sqlLiteral = (value: unknown) => value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const migration = await readFile(new URL("../db/migrations/20261029071527_first_visit_onboarding.sql", import.meta.url), "utf8");
const evidence: Record<string, unknown> = { testedAt: new Date().toISOString(), migrationSha256: createHash("sha256").update(migration).digest("hex"), transport: "local Unix socket; independent psql/backend connections" };

async function query(sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary!, args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "", errors = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { errors += data; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(errors.trim())));
    child.stdin.end(`set statement_timeout='30s';\n${sql}`);
  });
}
async function json<T = Record<string, unknown>>(sql: string) { return JSON.parse(await query(sql)) as T; }
async function call(fn: string, values: unknown[] = [], role = "service_role") {
  return json(`set role ${role}; select public.${fn}(${values.map(sqlLiteral).join(",")});`);
}
async function heldBatch<T>(counter: "members" | "pageviews", label: string, jobs: string[]): Promise<T[]> {
  const blocker = spawn(binary!, args, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Could not hold counter lock")), 10_000);
    blocker.stdout.on("data", (data) => { output += data; if (output.includes("LOCK_READY")) { clearTimeout(timeout); resolve(); } });
    blocker.once("error", reject);
    blocker.once("close", (code) => { if (code && code !== 0) reject(new Error("Counter lock process exited")); });
  });
  const closed = new Promise<void>((resolve) => blocker.once("close", () => resolve()));
  blocker.stdin.write(`begin; select 1 from onboarding_private.counters where name='${counter}' for update; select 'LOCK_READY';\n`);
  await ready;
  const results = Promise.all(jobs.map((sql) => json<T>(`set application_name=${sqlLiteral(label)}; set role service_role; ${sql}`)));
  // Attach rejection handling immediately while the monitoring connection waits.
  void results.catch(() => {});
  let waiting = 0;
  try {
    for (let i = 0; i < 100; i++) {
      waiting = Number(await query(`select count(*) from pg_stat_activity where application_name=${sqlLiteral(label)} and wait_event_type='Lock';`));
      if (waiting === jobs.length) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(waiting, jobs.length, "Every independent connection must actually contend on a database lock");
    evidence[label] = { independentConnections: jobs.length, observedLockWaiters: waiting };
  } finally {
    blocker.stdin.end("commit;\n");
    await closed;
  }
  return results;
}

const ids = Array.from({ length: 8 }, () => randomUUID());
const persona = { positions: ["PG"], skill_level: "amateur", flat_foot: false, height_cm: 180, weight_kg: 75 };
const rateKey = (label: string) => createHash("sha256").update(label).digest("hex");
const rpcSql = (fn: string, values: unknown[]) => `select public.${fn}(${values.map(sqlLiteral).join(",")});`;
const addUser = (id: string, name: string, profile = true) => query(`
  insert into auth.users(id,email,created_at,raw_user_meta_data)
    values(${sqlLiteral(id)},${sqlLiteral(name + "@example.test")},clock_timestamp(),${sqlLiteral(JSON.stringify({username:name,role:"admin"}))}::jsonb);
  ${profile ? `insert into profiles(id,username,email) values(${sqlLiteral(id)},${sqlLiteral(name)},${sqlLiteral(name + "@example.test")});` : ""}
`);

evidence.postgres = await query("select version();");
assert.equal(await query("select count(*) from information_schema.tables where table_schema in ('public','auth','onboarding_private');"), "0", "Use a fresh disposable test database");
await query(`
  create role anon; create role authenticated; create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  create table auth.users(id uuid primary key, email text, created_at timestamptz not null, raw_user_meta_data jsonb not null default '{}');
  create table profiles(id uuid primary key references auth.users(id) on delete cascade,
    username text unique not null, email text not null, role text not null default 'user' check(role in('user','admin')), persona jsonb);
  create table shoes(id uuid primary key, brand text not null, is_published boolean not null default true);
  alter table shoes enable row level security;
  grant select on shoes to anon, authenticated;
  create policy public_shoes on shoes for select to anon, authenticated using(is_published);
  insert into shoes values(gen_random_uuid(),'Nike',true),(gen_random_uuid(),'Adidas',true),(gen_random_uuid(),'hidden',false);
  insert into auth.users values
    (${sqlLiteral(ids[0])},'old1@example.test',now()-interval '2 days','{"username":"old1"}'),
    (${sqlLiteral(ids[1])},'old2@example.test',now()-interval '1 day','{"username":"old2"}'),
    (${sqlLiteral(ids[2])},'orphan@example.test',now()-interval '1 day','{"username":"orphan","role":"admin"}');
  insert into profiles(id,username,email) values(${sqlLiteral(ids[0])},'old1','old1@example.test'),(${sqlLiteral(ids[1])},'old2','old2@example.test');
`);
await query(`begin; ${migration} commit;`);
const initialSummary = await call("onboarding_get_summary");
assert.equal(initialSummary.registeredUsers, 3);
const initialMembers = await json("select jsonb_agg(jsonb_build_object('number',member_number,'stage',stage) order by member_number) from onboarding_private.members;");
assert.deepEqual(initialMembers, [{number:1,stage:"complete"},{number:2,stage:"complete"}]);
await query(`begin; ${migration} commit;`);
assert.equal((await call("onboarding_get_summary")).pageviewStartedAt, initialSummary.pageviewStartedAt);

for (const role of ["anon", "authenticated"]) {
  for (const [fn,values] of [["onboarding_get_summary",[]],["onboarding_get_status",[ids[0]]],["onboarding_update_status",[ids[0],"complete",null,null]],["onboarding_record_pageview",[randomUUID(),rateKey("deny")]],["onboarding_recover_profile",[ids[2],"orphan"]]] as [string,unknown[]][]) {
    await assert.rejects(call(fn,values,role), /permission denied/);
  }
  await assert.rejects(query(`set role ${role}; select * from onboarding_private.members;`), /permission denied/);
  await assert.rejects(query(`set role ${role}; select onboarding_private.member_status(${sqlLiteral(ids[0])});`), /permission denied/);
  assert.equal((await call("onboarding_catalog_counts",[],role)).catalogCount,2);
}
await assert.rejects(query("set role service_role; update onboarding_private.counters set last_value=99999;"),/permission denied/);
assert.equal(await query("select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='onboarding_private' and c.relkind='r';"),"t");
assert.equal(await query("select bool_and(not prosecdef) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'onboarding_%';"),"t");
evidence.permissions = "anon/auth private RPC, schema and tables denied; service direct table mutation denied; public aggregate respects RLS; public wrappers invoker";

const recovered = await call("onboarding_get_status",[ids[2]]);
assert.equal(recovered.stage,"complete");
assert.equal(await query(`select role from profiles where id=${sqlLiteral(ids[2])};`),"user");
await addUser(ids[3],"new1");
const sameMember = await heldBatch<{memberNumber:number;stage:string}>("members","same_member_20",Array.from({length:20},()=>rpcSql("onboarding_get_status",[ids[3]])));
assert.equal(new Set(sameMember.map(m=>m.memberNumber)).size,1);
assert.equal(sameMember[0].stage,"welcome");
const permanent = sameMember[0].memberNumber;
const manyIds = Array.from({length:32},()=>randomUUID());
await query(manyIds.map((id,i)=>`insert into auth.users values(${sqlLiteral(id)},'batch${i}@example.test',clock_timestamp(),'{}'); insert into profiles(id,username,email) values(${sqlLiteral(id)},'batch${i}','batch${i}@example.test');`).join("\n"));
const manyMembers = await heldBatch<{memberNumber:number;stage:string}>("members","different_members_32",manyIds.map(id=>rpcSql("onboarding_get_status",[id])));
assert.equal(new Set(manyMembers.map(m=>m.memberNumber)).size,32);
assert.ok(manyMembers.every(m=>m.stage==='welcome'));
await assert.rejects(call("onboarding_update_status",[ids[3],"complete",null,null]),/onboarding_stage_conflict/);
await call("onboarding_update_status",[ids[3],"profile","site","skipped"]);
await assert.rejects(call("onboarding_update_status",[ids[3],"complete",null,null]),/onboarding_persona_required/);
await query(`update profiles set persona=${sqlLiteral(JSON.stringify({...persona,positions:['PG','PG']}))}::jsonb where id=${sqlLiteral(ids[3])};`);
await assert.rejects(call("onboarding_update_status",[ids[3],"complete",null,null]),/onboarding_persona_required/);
await query(`update profiles set persona=${sqlLiteral(JSON.stringify(persona))}::jsonb where id=${sqlLiteral(ids[3])};`);
assert.equal((await call("onboarding_update_status",[ids[3],"complete","site","completed"])).stage,"complete");
const replay = await call("onboarding_update_status",[ids[3],"profile","site","skipped"]);
assert.equal(replay.stage,"complete");
assert.equal((replay.tours as Record<string,string>).site,"completed");
assert.equal(replay.memberNumber,permanent);
await addUser(ids[4],"old1",false);
await assert.rejects(call("onboarding_get_status",[ids[4]]),/onboarding_profile_recovery_required/);
assert.equal(await query(`select count(*) from onboarding_private.members where user_id=${sqlLiteral(ids[4])};`),"0");
const explicit = await call("onboarding_recover_profile",[ids[4],"repaired"]);
assert.equal(explicit.stage,"welcome");
assert.equal(await query(`select role from profiles where id=${sqlLiteral(ids[4])};`),"user");
await query(`delete from auth.users where id=${sqlLiteral(ids[4])};`);
await addUser(ids[5],"afterdelete");
assert.ok(Number((await call("onboarding_get_status",[ids[5]])).memberNumber)>Number(explicit.memberNumber));
evidence.members = "legacy completed/new welcome; missing profile recovered as user; collision requires explicit recovery; saved persona required; fixed ID across replay; deleted ID never reused";

const views = await heldBatch<{ordinal:number;startedAt:string}>("pageviews","different_events_100",Array.from({length:100},(_,i)=>rpcSql("onboarding_record_pageview",[randomUUID(),rateKey(`view${i}`)])));
assert.equal(new Set(views.map(v=>v.ordinal)).size,100);
assert.deepEqual(views.map(v=>v.ordinal).sort((a,b)=>a-b),Array.from({length:100},(_,i)=>i+1));
const repeatedId=randomUUID();
const repeats=await heldBatch<{ordinal:number}>("pageviews","same_event_10",Array.from({length:10},(_,i)=>rpcSql("onboarding_record_pageview",[repeatedId,rateKey(`retry${i}`)])));
assert.equal(new Set(repeats.map(v=>v.ordinal)).size,1);
assert.equal(repeats[0].ordinal,101);
assert.equal((await call("onboarding_get_summary")).livePageviews,101);
assert.equal(await query("select count(*) from onboarding_private.pageview_events;"),"101");
await query(`create function onboarding_private.test_event_failure() returns trigger language plpgsql as $$ begin raise exception 'intentional_test_failure'; end $$;
 create trigger test_event_failure before insert on onboarding_private.pageview_events for each row execute function onboarding_private.test_event_failure();`);
await assert.rejects(call("onboarding_record_pageview",[randomUUID(),rateKey('failure')]),/intentional_test_failure/);
assert.equal((await call("onboarding_get_summary")).livePageviews,101);
assert.equal(await query(`select count(*) from onboarding_private.pageview_limits where bucket_key=${sqlLiteral(rateKey('failure'))};`),"0");
await query("drop trigger test_event_failure on onboarding_private.pageview_events; drop function onboarding_private.test_event_failure();");
const retryAfterRollback=randomUUID();
await query(`begin; set local role service_role; ${rpcSql('onboarding_record_pageview',[retryAfterRollback,rateKey('rollback')])} rollback;`);
assert.equal((await call("onboarding_get_summary")).livePageviews,101);
assert.equal((await call("onboarding_record_pageview",[retryAfterRollback,rateKey('rollback')])).ordinal,102);
await query(`insert into onboarding_private.pageview_limits values(${sqlLiteral(rateKey('limited'))},date_trunc('minute',now()),120);`);
await assert.rejects(call("onboarding_record_pageview",[randomUUID(),rateKey('limited')]),/onboarding_rate_limited/);
assert.equal((await call("onboarding_get_summary")).livePageviews,102);
await query(`begin; ${migration} commit;`);
assert.equal((await call("onboarding_get_summary")).livePageviews,102);
assert.equal((await call("onboarding_get_status",[ids[3]])).memberNumber,permanent);
evidence.pageviews = "100 unique ordinals; 10 simultaneous repeats allocate one; rollback restores ledger/counter/rate bucket; rate limit rejects; migration replay preserves counters and IDs";
evidence.finalPageviews=102;
evidence.passed=true;
if(process.env.SF_TEST_EVIDENCE_PATH) await writeFile(process.env.SF_TEST_EVIDENCE_PATH,JSON.stringify(evidence,null,2)+"\n");
console.log(JSON.stringify(evidence,null,2));
