import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;
create table shoe_ratings(shoe_id uuid,cushioning_feel numeric,court_feel numeric,bounce numeric,stability numeric,traction numeric,fit numeric);
insert into shoe_ratings select '00000000-0000-4000-8000-000000000001',4,null,2,3,5,1 from generate_series(1,1257);
insert into shoe_ratings values ('00000000-0000-4000-8000-000000000001',null,0,null,null,null,null);
grant usage on schema public to anon;
grant select on shoe_ratings to anon;
`);
try {
  await db.exec(await readFile(new URL('../db/migrations/20261011124039_catalog_rating_summary.sql',import.meta.url),'utf8'));
  await db.exec('set role anon');
  const rows=(await db.query<{rating_count:number;sums:Record<string,number>;dim_counts:Record<string,number>}>('select * from catalog_rating_summary()')).rows;
  assert.equal(Number(rows[0].rating_count),1257);
  assert.equal(rows[0].sums.cushioning_feel,5028);
  assert.equal(rows[0].dim_counts.court_feel,0,'Missing and invalid votes are excluded');
  assert.equal(rows[0].sums.fit/rows[0].dim_counts.fit,1);
  assert.deepEqual(Object.keys(rows[0]).sort(),['dim_counts','rating_count','shoe_id','sums']);
  console.log('Complete aggregate ratings verified beyond the API row limit; no individual voter data returned.');
} finally {await db.close();}
