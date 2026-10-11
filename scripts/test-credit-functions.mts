import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const id = "00000000-0000-4000-8000-000000000001";
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create table ai_credits(user_id uuid primary key,balance int not null check(balance>=0),updated_at timestamptz);
  create table ai_credit_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,delta int,reason text constraint ai_credit_transactions_reason_check check(reason in ('grant','spend','recharge')),package_label text);
  alter table ai_credits enable row level security; alter table ai_credit_transactions enable row level security;`);
const sql = await readFile(new URL("../db/migrations/20261011125227_reconcile_atomic_credit_functions.sql",import.meta.url),"utf8");
await db.exec(sql); await db.exec(sql);
const balance = async () => (await db.query<{n:number}>(`select balance as n from ai_credits where user_id='${id}'`)).rows[0].n;
try {
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    for (const call of [`adjust_credits('${id}',100,'grant',null)`,`spend_credits('${id}',-10)`,`claim_daily_checkin('${id}',100,1)`]) await assert.rejects(db.query(`select ${call}`),/permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  await db.query(`select adjust_credits('${id}',10,'recharge','test')`);
  const claims = await Promise.all([1,2].map(()=>db.query(`select claim_daily_checkin('${id}',5,86400000) as n`)));
  assert.equal(claims.filter(r=>r.rows[0].n!==null).length,1);
  await db.query(`select spend_credits('${id}',3)`);
  assert.equal(await balance(),12);
  for (const call of [`spend_credits('${id}',-3)`,`spend_credits('${id}',999)`,`claim_daily_checkin('${id}',5,-1)`,`adjust_credits('${id}',null,'grant')`,`adjust_credits('${id}',2,'invalid')`]) await assert.rejects(db.query(`select ${call}`));
  assert.equal(await balance(),12);
  assert.equal((await db.query('select count(*)::int n from ai_credit_transactions')).rows[0].n,3);
  // A ledger failure must roll back the balance mutation too.
  await db.exec('reset role; revoke insert on ai_credit_transactions from service_role; set role service_role');
  await assert.rejects(db.query(`select adjust_credits('${id}',20,'recharge','test')`),/permission denied/);
  assert.equal(await balance(),12);
  console.log('Credit functions: service-only permissions, duplicate claims, balance/ledger atomicity and invalid amounts passed.');
} finally { await db.close(); }
