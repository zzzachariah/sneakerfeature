import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Deleting an account keeps (anonymized) payment records and is never blocked
// by catalogue rows the user created.
const db = new PGlite();
await db.exec(`
create table public.profiles(id uuid primary key);
create table public.stripe_payments(session_id text primary key, user_id uuid not null references public.profiles(id) on delete cascade);
create table public.ai_payment_orders(id serial primary key, user_id uuid not null references public.profiles(id) on delete cascade);
create table public.shoes(id serial primary key, created_by uuid references public.profiles(id));
insert into public.profiles values ('00000000-0000-4000-8000-0000000000a1');
insert into public.stripe_payments values ('cs_1', '00000000-0000-4000-8000-0000000000a1');
insert into public.ai_payment_orders(user_id) values ('00000000-0000-4000-8000-0000000000a1');
insert into public.shoes(created_by) values ('00000000-0000-4000-8000-0000000000a1');
`);
await assert.rejects(db.exec(`begin; delete from public.profiles; rollback;`), "before: shoes.created_by blocks deletion");
await db.exec(`rollback`).catch(() => undefined);
await db.exec(readFileSync(new URL("../db/migrations/20261116122000_account_deletion_retention.sql", import.meta.url), "utf8"));
await db.exec(`delete from public.profiles`);
const pay = await db.query<{ user_id: string | null }>(`select user_id from public.stripe_payments`);
assert.deepEqual(pay.rows, [{ user_id: null }], "payment kept, anonymized");
assert.equal((await db.query(`select * from public.ai_payment_orders where user_id is null`)).rows.length, 1);
assert.equal((await db.query(`select * from public.shoes where created_by is null`)).rows.length, 1);
await db.exec(readFileSync(new URL("../db/migrations/20261116122000_account_deletion_retention.sql", import.meta.url), "utf8"));
console.log("Account deletion retention: payments anonymized, catalogue rows no longer block deletion; migration is re-runnable.");
