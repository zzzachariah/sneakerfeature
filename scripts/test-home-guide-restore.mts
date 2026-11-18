import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

const db = new PGlite();
const migration = async (name: string) => db.exec(await readFile(new URL(`../db/migrations/${name}.sql`, import.meta.url), "utf8"));
type Snapshot = {status: string; retryable: boolean; payload: Record<string, unknown>};
type Reservation = {claimed: boolean; runId?: string; snapshot: Snapshot};
const call = async <T>(name: string, values: unknown[]) => (await db.query<{data: T}>(`select public.${name}(${values.map((_, i) => `$${i + 1}`).join(",")}) as data`, values)).rows[0].data;
const definitions = async () => (await db.query<{name: string; definition: string}>("select proname as name, pg_get_functiondef(oid) as definition from pg_proc where pronamespace='public'::regnamespace and proname in ('onboarding_picker_read','onboarding_picker_reserve','onboarding_picker_write') order by proname")).rows;
const rows = async () => (await db.query<Record<string, unknown>>("select * from onboarding_private.picker_demos order by visitor_hash")).rows;

try {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema onboarding_private; grant usage on schema onboarding_private to service_role; grant usage on schema public to service_role,anon,authenticated;");
  await migration("20261030204120_onboarding_picker_demo");
  const originalDefinitions = await definitions();
  const originalConstraint = (await db.query<{definition: string}>("select pg_get_constraintdef(oid) as definition from pg_constraint where conname='picker_demos_status_check'")).rows[0].definition;
  // Include original completed/running/failed rows as well as newer completed
  // results. None of those rows should be changed by the corrective migration.
  for (const [index, status] of ["complete", "running", "failed"].entries()) {
    await db.query("insert into onboarding_private.picker_demos(visitor_hash,run_id,network_hash,status,expires_at,payload) values($1,gen_random_uuid(),$2,$3,now()+interval '2 minutes',$4)", [String(index).repeat(64), String(index + 3).repeat(64), status, {marker:`original-${status}`,shoes:status === "complete" ? ["Original One", "Original Two"] : []}]);
  }
  await migration("20261118054944_onboarding_picker_questions");
  const waiting = "a".repeat(64), exhausted = "b".repeat(64), network = "c".repeat(64);
  for (const [visitor, attempts] of [[waiting, 1], [exhausted, 2]] as const) {
    await db.query("insert into onboarding_private.picker_demos(visitor_hash,run_id,network_hash,status,attempts,started_at,expires_at,payload) values($1,gen_random_uuid(),$2,'awaiting_answers',$3,now()-interval '1 minute',now()+interval '2 minutes',$4)", [visitor,network,attempts,{phase:"questions",questions:["preserve original data"],events:[],marker:visitor[0]}]);
  }
  await db.query("insert into onboarding_private.picker_demos(visitor_hash,run_id,network_hash,status,expires_at,payload) values($1,gen_random_uuid(),$2,'complete',now()+interval '2 minutes',$3)", ["d".repeat(64),"e".repeat(64),{phase:"recommendations",questions:["keep"],answers:{fit:"wide"},shoes:["New One","New Two"]}]);
  await db.exec("insert into onboarding_private.picker_demo_attempts(run_id,network_hash,started_at) select run_id,network_hash,started_at from onboarding_private.picker_demos");
  const before = await rows();
  const beforeAttempts = (await db.query("select * from onboarding_private.picker_demo_attempts order by run_id")).rows;
  await migration("20261118070528_restore_original_home_guide");
  assert.deepEqual(await definitions(), originalDefinitions, "Restore the exact original RPC bodies, signatures and security mode");
  assert.equal((await db.query<{definition: string}>("select pg_get_constraintdef(oid) as definition from pg_constraint where conname='picker_demos_status_check'")).rows[0].definition, originalConstraint);
  const after = await rows();
  assert.equal(after.length, before.length, "Never delete visitor history during restoration");
  for (const original of before) {
    const restored = after.find(row => row.visitor_hash === original.visitor_hash)!;
    if (original.status !== "awaiting_answers") assert.deepEqual(restored, original, "Completed, running and failed rows remain byte-for-byte unchanged");
    else {
      assert.equal(restored.status, "failed");
      assert.equal(restored.attempts, original.attempts, "Do not reset visitor spending limits");
      const payload = restored.payload as Record<string, unknown>;
      assert.equal(payload.error, "home_guide_restored");
      assert(payload.finishedAt);
      const {error: _error, finishedAt: _finishedAt, ...saved} = payload;
      assert.deepEqual(saved, original.payload, "Preserve questions and all existing payload data");
    }
  }
  assert.deepEqual((await db.query("select * from onboarding_private.picker_demo_attempts order by run_id")).rows, beforeAttempts, "Network and global admission history is preserved");
  assert.equal((await db.query<{fn: string | null}>("select to_regprocedure('public.onboarding_picker_resume(text,uuid,text,jsonb)')::text as fn")).rows[0].fn, null);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(() => call("onboarding_picker_read", [waiting]), /permission denied/);
    await assert.rejects(() => call("onboarding_picker_reserve", [waiting, network, {}]), /permission denied/);
    await assert.rejects(() => db.query("select * from onboarding_private.picker_demos"), /permission denied/);
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  const failed = await call<Snapshot>("onboarding_picker_read", [waiting]);
  assert.equal(failed.status, "failed");
  assert.equal(failed.retryable, true);
  assert.equal(failed.payload.error, "home_guide_restored");
  const capped = await call<Reservation>("onboarding_picker_reserve", [exhausted, network, {events:[]}]);
  assert.equal(capped.claimed, false);
  assert.equal(capped.snapshot.retryable, false, "Two used attempts remain exhausted");
  const retry = await call<Reservation>("onboarding_picker_reserve", [waiting, network, {events:[],prompt:"original guide"}]);
  assert.equal(retry.claimed, true);
  assert.equal(await call("onboarding_picker_write", [waiting,retry.runId,"complete",{events:[],shoes:["A","B"]}]), true, "The restored app can reserve and complete with the original contract");
  await assert.rejects(() => call("onboarding_picker_write", [waiting,retry.runId,"awaiting_answers",{}]), /invalid_demo/);
  console.log("PASS exact original RPC restoration, waiting-state recovery, unchanged completed/history rows, original attempt caps, service-only permissions, and original reserve/write flow.");
} finally {
  await db.close();
}
