// Acceptance test: an ANONYMOUS Supabase client can read nothing from the
// outreach tables.
//
//   npx tsx scripts/test-outreach-rls.mts
//
// These four tables hold eleven real people's email addresses and WeChat IDs.
// Migration 048 protects them two ways — RLS with no policy naming `anon`, and
// table privileges revoked from `anon` outright — and this asserts the result
// rather than the intent. It runs against the live project with the publishable
// (anon) key and no session, which is exactly what a stranger with the key from
// the JS bundle holds.
//
// "Zero rows" is the assertion. A permission-denied error also satisfies it:
// both mean nothing came back. What would FAIL is a 200 with rows in it.

import { createClient } from "@supabase/supabase-js";

// --- env (standalone tsx does NOT auto-load .env like Next) -------------------
const loadEnvFile = (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile;
for (const file of [".env.local", ".env"]) {
  try {
    loadEnvFile?.(file);
  } catch {
    /* file missing — ignore */
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, and run from the repo root."
  );
}

const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`, extra ?? "");
  }
}

const RELATIONS = [
  "outreach_creators",
  "outreach_channels",
  "outreach_log",
  "outreach_settings",
  // The views are the likelier leak: a view without security_invoker runs with
  // its owner's rights and hands over every base-table row.
  "outreach_creators_view",
  "outreach_channels_view"
];

console.log(`Anonymous client → ${url}\n`);
console.log("SELECT returns zero rows:");
for (const relation of RELATIONS) {
  const { data, error } = await anon.from(relation).select("*");
  const rows = data ?? [];
  check(
    `${relation}: 0 rows${error ? ` (${error.code ?? "error"})` : ""}`,
    rows.length === 0,
    rows.length > 0 ? `LEAKED ${rows.length} rows` : undefined
  );
}

console.log("\nNo personal data reachable by column:");
{
  // Ask for exactly the sensitive columns — a policy that leaks only some
  // columns would still be a leak.
  const { data } = await anon.from("outreach_creators").select("name, contact, verify_note");
  check("contact / verify_note unreadable", (data ?? []).length === 0, data);
}
{
  const { count } = await anon
    .from("outreach_creators")
    .select("id", { count: "exact", head: true });
  check("count() also reports nothing", !count, count);
}

console.log("\nWrites are refused:");
{
  const { error } = await anon.from("outreach_creators").update({ verified: "yes" }).eq("id", 1);
  const { data: after } = await anon.from("outreach_creators").select("id").eq("id", 1);
  check("UPDATE changes nothing", (after ?? []).length === 0, error?.code);
}
{
  const { error } = await anon
    .from("outreach_log")
    .insert({ creator_id: 1, entry_date: "2026-07-31", note: "rls probe" });
  check("INSERT into the log is refused", Boolean(error), error);
}

console.log("\nQuick-action functions are not callable anonymously:");
for (const fn of ["outreach_mark_sent", "outreach_mark_followed_up", "outreach_mark_replied"]) {
  const { error } = await anon.rpc(fn, { p_creator_id: 1, p_note: "rls probe" });
  check(`${fn} refused`, Boolean(error), error?.message);
}
{
  const { error } = await anon.rpc("outreach_set_verified", {
    p_creator_id: 1,
    p_verified: "yes",
    p_verify_note: null
  });
  check("outreach_set_verified refused", Boolean(error), error?.message);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nA FAILURE HERE IS A DATA LEAK. Do not deploy until it passes.");
}
process.exit(fail === 0 ? 0 : 1);
