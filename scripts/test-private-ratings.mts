import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Private rating/vote rows: aggregates stay public, individual rows do not.
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
create table public.shoe_ratings(shoe_id uuid, user_id uuid, cushioning_feel numeric, court_feel numeric, bounce numeric, stability numeric, traction numeric, fit numeric);
create table public.comment_votes(comment_id uuid, user_id uuid, vote_type text);
alter table public.shoe_ratings enable row level security; alter table public.comment_votes enable row level security;
create policy "Public read shoe ratings" on public.shoe_ratings for select using (true);
create policy "Public read comment votes" on public.comment_votes for select using (true);
grant select on public.shoe_ratings, public.comment_votes to anon, authenticated;
create function public.catalog_rating_summary() returns table(shoe_id uuid, n bigint) language sql stable security invoker set search_path = '' as $$ select shoe_id, count(*) from public.shoe_ratings group by shoe_id $$;
insert into public.shoe_ratings values
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a1',4,2,null,3,5,1),
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a2',2,4,2,3,1,5);
insert into public.comment_votes values
  ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000a1','like'),
  ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000a2','dislike'),
  ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000a3','like');
`);
for (const f of ["20261116120000_private_rating_vote_rows_functions.sql", "20261116120100_private_rating_vote_rows.sql"]) {
  await db.exec(readFileSync(new URL(`../db/migrations/${f}`, import.meta.url), "utf8"));
}

await db.exec(`set role anon`);
const anonRows = await db.query(`select * from public.shoe_ratings`);
assert.equal(anonRows.rows.length, 0, "anon cannot list individual ratings");
assert.equal((await db.query(`select * from public.comment_votes`)).rows.length, 0, "anon cannot list votes");
const summary = (await db.query<{ rating_count: number; avgs: Record<string, number> }>(`select * from public.shoe_rating_summary('00000000-0000-4000-8000-000000000001')`)).rows[0];
assert.equal(Number(summary.rating_count), 2);
assert.equal(Number(summary.avgs.bounce), 1, "null dims count as 0, matching the old route");
assert.equal(Number(summary.avgs.cushioning_feel), 3);
const totals = (await db.query<{ likes: number; dislikes: number }>(`select * from public.comment_vote_totals(array['00000000-0000-4000-8000-0000000000c1']::uuid[])`)).rows[0];
assert.deepEqual([Number(totals.likes), Number(totals.dislikes)], [2, 1]);
assert.equal((await db.query(`select * from public.catalog_rating_summary()`)).rows.length, 1, "catalog summary still aggregates");

await db.exec(`reset role; set request.uid = '00000000-0000-4000-8000-0000000000a1'; set role authenticated`);
assert.equal((await db.query(`select * from public.shoe_ratings`)).rows.length, 1, "a user sees only their own rating");
assert.equal((await db.query(`select * from public.comment_votes`)).rows.length, 1, "a user sees only their own votes");
console.log("Private ratings/votes: aggregates public, individual rows owner-only.");
