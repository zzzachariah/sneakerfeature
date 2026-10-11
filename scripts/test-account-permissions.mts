import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL RLS/grants, isolated from production and without credentials.
const db = new PGlite();
const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  grant usage on schema public, auth to anon, authenticated, service_role;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table profiles (
    id uuid primary key, username text not null, email text, role text default 'user',
    avatar_url text, bio text, persona jsonb, rating_focus jsonb,
    personalized_push_enabled boolean, foot_profile jsonb,
    subscription_tier text default 'free', subscription_is_permanent boolean default false,
    member_prefs jsonb default '{}', created_at timestamptz default now()
  );
  alter table profiles enable row level security;
  create policy "Public read profiles" on profiles for select using (true);
  create policy "Own profile insert" on profiles for insert to authenticated with check (auth.uid() = id);
  create policy "Own profile update" on profiles for update to authenticated using (auth.uid() = id);
  grant all on profiles to anon, authenticated, service_role;
  revoke select on profiles from anon, authenticated;
  grant select(id, username, persona, foot_profile, role) on profiles to anon, authenticated;
  insert into profiles(id,username,email,persona,foot_profile) values
    ('${alice}','alice','alice@example.invalid','{"private":true}','{"private":true}'),
    ('${bob}','bob','bob@example.invalid','{"private":true}','{"private":true}');
  create table subscription_allowances (
    user_id uuid primary key references profiles(id), balance int not null check(balance>=0),
    monthly_grant int not null, period_start timestamptz not null, updated_at timestamptz not null
  );
  alter table subscription_allowances enable row level security;
`);
const preparation = await readFile(new URL('../db/migrations/20261011125026_prepare_public_profile_cards.sql', import.meta.url), 'utf8');
await db.exec(preparation);
await db.exec(preparation);
assert.equal((await db.query('select count(*)::int as n from public_profile_cards')).rows[0].n, 2);
const migration = await readFile(new URL('../db/migrations/20261010034930_harden_profile_and_allowance_permissions.sql', import.meta.url), 'utf8');
await db.exec(migration);
await db.exec(migration); // Safe migration replay.
async function as(role: string, sql: string, uid = alice) {
  await db.exec(`set role ${role}; set request.jwt.claim.sub = '${uid}';`);
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
}
async function denied(role: string, sql: string) {
  await assert.rejects(as(role, sql), /permission denied/);
}
try {
  await denied('anon', 'select persona from profiles');
  await denied('anon', 'select username from profiles'); // Old column grants are gone.
  assert.equal((await as('anon', 'select username from public_profile_cards')).rows.length, 2);
  assert.equal((await as('authenticated', 'select id,email,persona,foot_profile from profiles')).rows.length, 1);
  assert.equal((await as('authenticated', `select id from profiles where id='${bob}'`)).rows.length, 0);
  for (const patch of ["role='admin'", "subscription_tier='max'", "subscription_is_permanent=true", "member_prefs='{}'", "email='forged@example.invalid'"]) {
    await denied('authenticated', `update profiles set ${patch} where id='${alice}'`);
  }
  await denied('authenticated', `insert into profiles(id,username,role) values ('00000000-0000-4000-8000-000000000003','forged','admin')`);
  await denied('authenticated', "update public_profile_cards set username='forged'");
  await denied('authenticated', 'select private.sync_public_profile_card()');
  await as('authenticated', `update profiles set username='alice-renamed', persona='{"position":"guard"}' where id='${alice}'`);
  assert.deepEqual((await as('anon', `select username from public_profile_cards where id='${alice}'`)).rows, [{username:'alice-renamed'}]);
  await as('authenticated', `update profiles set username='stolen' where id='${bob}'`);
  assert.deepEqual((await as('anon', `select username from public_profile_cards where id='${bob}'`)).rows, [{username:'bob'}]);
  await as('service_role', `update profiles set subscription_tier='max' where id='${alice}'`);
  for (const role of ['anon','authenticated']) {
    await denied(role, `select refresh_allowance('${alice}',9999,1)`);
    await denied(role, `select spend_allowance('${alice}',-10,9999,1)`);
  }
  assert.deepEqual((await as('service_role', `select spend_allowance('${alice}',3,10,2592000) as balance`)).rows, [{balance:7}]);
  await assert.rejects(as('service_role', `select spend_allowance('${alice}',-10,10,2592000)`), /invalid_allowance_amount/);
  await assert.rejects(as('service_role', `select spend_allowance('${alice}',8,10,2592000)`), /insufficient_allowance/);
  await assert.rejects(as('service_role', `select refresh_allowance('${alice}',10,0)`), /invalid_allowance_parameters/);
  assert.deepEqual((await as('service_role', `select balance from subscription_allowances where user_id='${alice}'`)).rows, [{balance:7}]);
  console.log('Account permissions: anonymous, own/other account, privilege escalation, public comments, service role and allowance tests passed.');
} finally { await db.close(); }
