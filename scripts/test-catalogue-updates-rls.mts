import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;");
await db.exec(await readFile(new URL("../db/migrations/20261026065034_catalogue_maintenance_runs.sql", import.meta.url), "utf8"));
const report = JSON.stringify({ version: 1, title: { en: "Report", zh: "记录" }, summary: { en: "Checked", zh: "已检查" }, counts: {}, entries: [] });
await db.query(`insert into catalogue_maintenance_runs(id, scheduled_for, completed_at, status, report, is_published) values
  ('00000000-0000-4000-8000-000000000001',current_date,now()-interval '1 hour','completed',$1,true),
  ('00000000-0000-4000-8000-000000000002',current_date,now()-interval '1 hour','completed',$1,false),
  ('00000000-0000-4000-8000-000000000003',current_date,now()+interval '1 day','completed',$1,true)`, [report]);
async function as(role: string, sql: string) {
  await db.exec(`set role ${role}`);
  try { return await db.query(sql); } finally { await db.exec("reset role"); }
}
for (const role of ["anon", "authenticated"]) {
  assert.deepEqual((await as(role, "select id from catalogue_maintenance_runs order by id")).rows, [{ id: "00000000-0000-4000-8000-000000000001" }]);
  await assert.rejects(as(role, "delete from catalogue_maintenance_runs"), /permission denied/);
  await assert.rejects(as(role, "update catalogue_maintenance_runs set is_published=true"), /permission denied/);
  await assert.rejects(as(role, "insert into catalogue_maintenance_runs(id) values(gen_random_uuid())"), /permission denied/);
}
assert.equal((await as("service_role", "select id from catalogue_maintenance_runs")).rows.length, 3);
assert.equal((await db.query("select relrowsecurity from pg_class where oid='catalogue_maintenance_runs'::regclass")).rows[0].relrowsecurity, true);
await db.close();
console.log("catalogue update RLS: published past runs only; drafts/future rows hidden; public writes denied");
