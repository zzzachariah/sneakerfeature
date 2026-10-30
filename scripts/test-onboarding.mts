import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { buildOnboardingCatalog } from "../lib/onboarding/server-catalog.ts";
import { displayBrand } from "../lib/data/catalog-quality.ts";
import type { Shoe } from "../lib/types.ts";
import { PGlite } from "@electric-sql/pglite";
import {
  isExcludedPageview, isSameOriginMutation, onboardingPageviewSchema,
  onboardingPatchSchema, safeCount, safePositiveInteger
} from "../lib/onboarding/server-contract.ts";

// These tests execute the real migration and stored functions in an isolated
// PostgreSQL engine. Promise.all exercises concurrent callers at the API level;
// PGlite itself serializes its connection, so multi-connection lock contention
// still needs the documented staging/Postgres concurrency check before rollout.
const db = new PGlite();
const ids = Array.from({ length: 12 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const sql = await readFile(new URL("../db/migrations/20261029071527_first_visit_onboarding.sql", import.meta.url), "utf8");
const persona = { positions: ["PG"], skill_level: "amateur", flat_foot: false, height_cm: 180, weight_kg: 75 };
const rateKey = "a".repeat(64);

await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  create table auth.users(id uuid primary key, email text, created_at timestamptz not null, raw_user_meta_data jsonb not null default '{}');
  create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,
    username text unique not null, email text not null, role text not null default 'user', persona jsonb);
  create table public.shoes(id uuid primary key, brand text not null, is_published boolean not null default true);
  alter table public.shoes enable row level security;
  grant select on public.shoes to anon, authenticated;
  create policy public_shoes on public.shoes for select to anon, authenticated using (is_published);
  insert into public.shoes(id,brand,is_published) values
    (gen_random_uuid(),'Nike',true), (gen_random_uuid(),'361 degrees',true),
    (gen_random_uuid(),'361°',true), (gen_random_uuid(),'Internal brand',false);
  insert into auth.users(id,email,created_at,raw_user_meta_data) values
    ('${ids[0]}','first@example.test',now()-interval '2 days','{"username":"first"}'),
    ('${ids[1]}','second@example.test',now()-interval '1 day','{"username":"second"}'),
    ('${ids[2]}','recover@example.test',now()-interval '1 day','{"username":"recover"}');
  insert into public.profiles(id,username,email) values
    ('${ids[0]}','first','first@example.test'), ('${ids[1]}','second','second@example.test');
`);

const call = async <T = Record<string, unknown>>(fn: string, args: unknown[] = []) => {
  const params = args.map((_, i) => `$${i + 1}`).join(",");
  const result = await db.query<{ result: T }>(`select public.${fn}(${params}) as result`, args);
  return result.rows[0].result;
};
const as = async (role: string, work: () => Promise<unknown>) => {
  await db.exec(`set role ${role}`);
  try { return await work(); } finally { await db.exec("reset role"); }
};
const addUser = async (id: string, name: string, withProfile = true) => {
  await db.query("insert into auth.users(id,email,created_at,raw_user_meta_data) values($1,$2,clock_timestamp(),$3)", [id, `${name}@example.test`, JSON.stringify({ username: name })]);
  if (withProfile) await db.query("insert into public.profiles(id,username,email) values($1,$2,$3)", [id, name, `${name}@example.test`]);
};

try {
  await db.exec(sql);
  const firstBoundary = (await call("onboarding_get_summary")).pageviewStartedAt;
  await db.exec(sql);
  assert.equal((await call("onboarding_get_summary")).pageviewStartedAt, firstBoundary, "migration replay must not reset counters/boundaries");
  const rls = await db.query<{ enabled: boolean }>("select bool_and(c.relrowsecurity) as enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='onboarding_private' and c.relkind='r'");
  assert.equal(rls.rows[0].enabled, true);
  for (const role of ["anon", "authenticated"]) {
    for (const [fn,args] of [
      ["onboarding_get_summary", []], ["onboarding_get_status", [ids[0]]],
      ["onboarding_update_status", [ids[0], "complete", null, null]],
      ["onboarding_record_pageview", [randomUUID(), rateKey]],
      ["onboarding_recover_profile", [ids[2], "recover"]]
    ] as const) {
      await assert.rejects(as(role, () => call(fn, [...args])), /permission denied/);
    }
    await assert.rejects(as(role, () => db.query("select * from onboarding_private.members")), /permission denied/);
  }
  await assert.rejects(as("service_role", () => db.query("update onboarding_private.counters set last_value=99999")), /permission denied/);
  const summary = await as("service_role", () => call("onboarding_get_summary")) as { registeredUsers: number };
  assert.equal(summary.registeredUsers, 3, "registered count comes from Auth, not profiles");
  const publicCounts = await as("anon", () => call("onboarding_catalog_counts")) as { catalogCount: number; brands: string[] };
  assert.equal(publicCounts.catalogCount, 3, "live public count respects existing shoe RLS");
  assert.equal(new Set(publicCounts.brands.map(displayBrand)).size, 2, "brands use the same displayBrand normalization as the catalogue");
  await db.query("insert into public.shoes(id,brand) values(gen_random_uuid(),'Adidas')");
  assert.equal((await as("anon", () => call("onboarding_catalog_counts")) as {catalogCount:number}).catalogCount, 4, "counts are fresh after a new public shoe");

  const existing = await as("service_role", () => call("onboarding_get_status", [ids[0]])) as Record<string, unknown>;
  assert.equal(existing.stage, "complete");
  assert.equal(existing.memberNumber, 1);
  assert.deepEqual(existing.tours, { site: null, ai: null });
  const recovered = await as("service_role", () => call("onboarding_get_status", [ids[2]])) as Record<string, unknown>;
  assert.equal(recovered.stage, "complete", "legacy missing-profile account must not become a fresh signup");
  assert.equal((await db.query("select role from profiles where id=$1", [ids[2]])).rows[0].role, "user");

  await addUser(ids[3], "newplayer");
  await db.exec("set role service_role");
  const duplicateMembers = await Promise.all(Array.from({length: 10}, () => call("onboarding_get_status", [ids[3]])));
  assert.equal(new Set(duplicateMembers.map((m) => m.memberNumber)).size, 1);
  assert.equal(duplicateMembers[0].stage, "welcome");
  const newMemberNumber = duplicateMembers[0].memberNumber;
  await assert.rejects(call("onboarding_update_status", [ids[3], "complete", null, null]), /onboarding_stage_conflict/);
  await call("onboarding_update_status", [ids[3], "profile", "site", "skipped"]);
  await assert.rejects(call("onboarding_update_status", [ids[3], "complete", null, null]), /onboarding_persona_required/);
  await assert.rejects(call("onboarding_update_status", [ids[3], "complete", "other", "completed"]), /onboarding_invalid_update/);
  await assert.rejects(call("onboarding_update_status", [ids[3], null, "ai", null]), /onboarding_invalid_update/);
  await db.exec("reset role");
  await db.query("update profiles set persona=$2 where id=$1", [ids[3], JSON.stringify({ ...persona, positions: ["PG", "PG"] })]);
  await assert.rejects(as("service_role", () => call("onboarding_update_status", [ids[3], "complete", null, null])), /onboarding_persona_required/);
  await db.query("update profiles set persona=$2 where id=$1", [ids[3], JSON.stringify(persona)]);
  const completed = await as("service_role", () => call("onboarding_update_status", [ids[3], "complete", "site", "completed"])) as Record<string, unknown>;
  assert.equal(completed.stage, "complete");
  assert.equal(completed.memberNumber, newMemberNumber);
  await db.exec("set role service_role");
  await call("onboarding_update_status", [ids[3], "profile", "ai", "completed"]);
  const replaySkipped = await call("onboarding_update_status", [ids[3], null, "ai", "skipped"]);
  assert.equal(replaySkipped.stage, "complete", "replay cannot restart required onboarding");
  assert.deepEqual(replaySkipped.tours, { site: "completed", ai: "completed" }, "replay skip cannot erase completion");
  await db.exec("reset role");

  await addUser(ids[4], "first", false); // username conflicts with existing owner
  await assert.rejects(as("service_role", () => call("onboarding_get_status", [ids[4]])), /onboarding_profile_recovery_required/);
  assert.equal((await db.query("select count(*)::int n from onboarding_private.members where user_id=$1", [ids[4]])).rows[0].n, 0, "failed profile cannot receive a number");
  const explicitRecovery = await as("service_role", () => call("onboarding_recover_profile", [ids[4], "recoverednew"])) as Record<string, unknown>;
  assert.equal(explicitRecovery.username, "recoverednew");
  assert.equal(explicitRecovery.stage, "welcome");
  await as("service_role", () => call("onboarding_recover_profile", [ids[4], "shouldnotrename"]));
  assert.equal((await db.query("select username from profiles where id=$1", [ids[4]])).rows[0].username, "recoverednew");
  await db.query("delete from auth.users where id=$1", [ids[4]]);
  await addUser(ids[5], "later");
  const later = await as("service_role", () => call("onboarding_get_status", [ids[5]])) as Record<string, unknown>;
  assert.ok(Number(later.memberNumber) > Number(explicitRecovery.memberNumber), "deleted number cannot be reused");
  await db.exec(sql);
  assert.equal((await call("onboarding_get_status", [ids[3]])).memberNumber, newMemberNumber, "migration replay never renumbers existing members");

  await db.exec("set role service_role");
  const uniqueEvents = await Promise.all(Array.from({length:100}, () => call("onboarding_record_pageview", [randomUUID(), rateKey])));
  assert.equal(new Set(uniqueEvents.map((e) => e.ordinal)).size, 100);
  const repeatedId = randomUUID();
  const repeated = await Promise.all(Array.from({length:10}, () => call("onboarding_record_pageview", [repeatedId, rateKey])));
  assert.equal(new Set(repeated.map((e) => e.ordinal)).size, 1);
  assert.equal(repeated[0].startedAt, firstBoundary);
  await assert.rejects(call("onboarding_record_pageview", [null, rateKey]), /onboarding_invalid_event/);
  await assert.rejects(call("onboarding_record_pageview", [randomUUID(), "fake-ip-key"]), /onboarding_invalid_event/);
  for (let i=0; i<19; i++) await call("onboarding_record_pageview", [randomUUID(), rateKey]);
  await assert.rejects(call("onboarding_record_pageview", [randomUUID(), rateKey]), /onboarding_rate_limited/);
  await db.exec("reset role");
  assert.equal((await db.query("select last_value from onboarding_private.counters where name='pageviews'")).rows[0].last_value, 120);
  assert.equal((await db.query("select count(*)::int n from onboarding_private.pageview_events")).rows[0].n, 120);
  assert.equal((await call("onboarding_get_summary")).livePageviews, 120, "live total comes from the current atomic counter");
  // An event-ledger failure must roll back the count and limiter write too.
  await db.exec(`create function onboarding_private.test_fail_event() returns trigger language plpgsql as $$
    begin raise exception 'test_event_write_failed'; end $$;
    create trigger test_fail_event before insert on onboarding_private.pageview_events
      for each row execute function onboarding_private.test_fail_event();`);
  await assert.rejects(as("service_role", () => call("onboarding_record_pageview", [randomUUID(), "b".repeat(64)])), /test_event_write_failed/);
  assert.equal((await db.query("select last_value from onboarding_private.counters where name='pageviews'")).rows[0].last_value, 120);
  assert.equal((await db.query("select count(*)::int n from onboarding_private.pageview_limits where bucket_key=$1", ["b".repeat(64)])).rows[0].n, 0);
  await db.exec("drop trigger test_fail_event on onboarding_private.pageview_events; drop function onboarding_private.test_fail_event();");
  const originalFirst = uniqueEvents[0].ordinal;
  await db.exec(sql);
  assert.equal((await db.query("select last_value from onboarding_private.counters where name='pageviews'")).rows[0].last_value, 120);
  assert.ok(Number(originalFirst) >= 1);

  const request = (headers: Record<string,string> = {}) => new Request("https://snkrfeature.com/api/onboarding/pageview", { method: "POST", headers });
  assert.equal(isSameOriginMutation(request({ origin: "https://snkrfeature.com", "sec-fetch-site": "same-origin" })), true);
  assert.equal(isSameOriginMutation(request({ origin: "https://evil.example", "sec-fetch-site": "cross-site" })), false);
  assert.equal(isSameOriginMutation(request({ origin: "https://sub.snkrfeature.com", "sec-fetch-site": "same-site" })), false);
  assert.equal(isSameOriginMutation(request()), false);
  assert.equal(isExcludedPageview(request({ purpose: "prefetch" })), true);
  assert.equal(isExcludedPageview(request({ "user-agent": "Googlebot" })), true);
  assert.equal(isExcludedPageview(request({ "x-sf-platform": "ios" })), true);
  assert.equal(isExcludedPageview(request({ "user-agent": "Mozilla/5.0 Safari/605.1.15" })), false);
  assert.equal(onboardingPageviewSchema.safeParse({ eventId: randomUUID() }).success, false);
  assert.equal(onboardingPageviewSchema.safeParse({ eventId: randomUUID(), consent: "rejected" }).success, false);
  assert.equal(onboardingPageviewSchema.safeParse({ eventId: randomUUID(), consent: "accepted", ordinal: 999 }).success, false);
  assert.equal(onboardingPatchSchema.safeParse({ stage: "complete", userId: ids[0] }).success, false);
  assert.equal(onboardingPatchSchema.safeParse({}).success, false);
  assert.equal(onboardingPatchSchema.safeParse({ tour: "ai" }).success, false);
  assert.equal(onboardingPatchSchema.safeParse({ tour: "ai", status: "skipped" }).success, true);
  assert.equal(safeCount(0), 0); assert.equal(safeCount(-1), null);
  assert.equal(safePositiveInteger(0), null); assert.equal(safePositiveInteger(Number.MAX_SAFE_INTEGER+1), null);
  const completeSpec = { cushioning_feel: "soft and plush", court_feel: "good", bounce: "good", stability: "excellent", traction: "good", fit: "secure" };
  const sourceShoes: Shoe[] = Array.from({length:35}, (_, i) => ({
    id: `shoe-${i}`, slug: `shoe-${String(i).padStart(2,"0")}`, shoe_name: `Shoe ${i}`,
    brand: i < 26 ? "Nike" : i < 30 ? "Adidas" : "Li-Ning",
    image_url: `https://example.test/${i}${i % 2 === 0 ? "-nobg" : ""}.png`,
    spec: i === 0 ? {} : completeSpec, price: 999,
    myDimRatings: {fit:5}, story: {title:"Private irrelevant story"},
    weight: "350 g", release_year: 2026
  }));
  sourceShoes.push({id:"no-image",slug:"no-image",shoe_name:"No Image",brand:"Other",spec:{}});
  (sourceShoes[2].spec as unknown as Record<string, unknown>).shoe_id = "internal-shoe-id";
  const wall = buildOnboardingCatalog(sourceShoes);
  assert.equal(wall.shoes.length, 25);
  assert.equal(wall.shoeCount, 36, "wall illustration filter does not change catalogue total");
  assert.equal(wall.brandCount, 4);
  assert.equal(new Set(wall.shoes.map((s)=>s.brand)).size, 3, "random order retains brand variety");
  assert.equal(wall.shoes.some(s => s.slug === "shoe-00"), false, "complete performance facts take priority within each sampling pool");
  assert.equal(new Set(wall.shoes.map((s)=>s.shoe.id)).size, 25);
  for (const item of wall.shoes) {
    assert.equal("price" in item.shoe, false);
    assert.equal("myDimRatings" in item.shoe, false);
    assert.equal("story" in item.shoe, false);
    assert.equal("shoe_id" in item.shoe.spec, false);
  }
  assert.equal(buildOnboardingCatalog(sourceShoes.slice(0,2)).shoes.length, 2, "small catalogue still returns both selectable shoes");
  console.log("Onboarding PGlite checks passed: migration replay, service-only permissions/RLS, fresh public catalogue/Auth/counter aggregates, 25-shoe public payload, legacy/new boundaries, profile recovery, saved-persona completion, stable IDs, deletion non-reuse, 100 event uniqueness, retry dedup, rate limiting, origin/consent contracts. Real PostgreSQL multi-connection contention remains unverified.");
} finally {
  await db.close();
}
