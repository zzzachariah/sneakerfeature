// One-time bulk gift: hand every existing member a Pro membership.
//
// This is the "全站送 Pro" tool. It writes the same profile columns the admin
// grant (lib/subscription/entitlements.ts → setSubscription) writes, so the
// gifted membership behaves exactly like a comped one: it shows the Pro badge,
// unlocks the Pro capabilities in lib/subscription/tiers.ts, and expires on its
// own (resolveTier falls back to `free` once subscription_expires_at passes —
// no cleanup job needed).
//
// Policy baked in (matches setSubscription's stacking rule):
//   - ACTIVE Max members are SKIPPED — a gift must never downgrade someone who
//     paid for more. An EXPIRED Max is effectively free, so it does get the gift.
//   - ACTIVE Pro members STACK: the gift is added on top of their remaining time.
//   - PERMANENT Pro members are skipped (nothing to add).
//   - Everyone else (free / expired) starts a fresh Pro term from now.
//
// Run from the repo root (so .env.local + node_modules resolve):
//   npx tsx scripts/grant-pro-all.mts                        # DRY RUN, prints the plan
//   npx tsx scripts/grant-pro-all.mts --duration quarterly   # dry run, 3 months
//   npx tsx scripts/grant-pro-all.mts --apply                # really grant (1 month)
//   npx tsx scripts/grant-pro-all.mts --apply --duration permanent
//   npx tsx scripts/grant-pro-all.mts --limit 5 --apply      # try it on 5 users first
//
// Durations come from DURATIONS in lib/subscription/tiers.ts:
//   monthly (30d) | quarterly (90d) | yearly (365d) | permanent
//
// Prereqs: .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// (the service-role client bypasses RLS — profiles has no user-facing write
// policy for subscription columns, so this MUST run with the service key).
//
// Re-running is additive, not idempotent: a second --apply stacks another term
// onto everyone. Dry-run first and read the summary.
//
// The monthly premium allowance is NOT seeded here on purpose — refresh_allowance
// upserts the row on first read/spend (see 041_subscriptions.sql), so gifted
// members get their 300 credits the moment they open Smart Picker, without this
// script writing a row per user.

import { createClient } from "@supabase/supabase-js";
import { DURATIONS, TIERS, type Duration } from "../lib/subscription/tiers";

// --- env + client (standalone tsx does NOT auto-load .env like Next) ----------
const loadEnvFile = (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile;
for (const file of [".env.local", ".env"]) {
  try {
    loadEnvFile?.(file);
  } catch {
    /* file missing — ignore */
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local, and run from the repo root."
  );
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// --- args --------------------------------------------------------------------
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const DURATION = (flag("--duration") ?? "monthly") as Duration;
if (!DURATIONS.some((d) => d.id === DURATION)) {
  throw new Error(`Unknown --duration "${DURATION}". Use: ${DURATIONS.map((d) => d.id).join(" | ")}`);
}
const DAYS = DURATIONS.find((d) => d.id === DURATION)?.days ?? null;
const PERMANENT = DAYS == null;
const LIMIT = Number(flag("--limit") ?? 0) || null;

const PAGE = 1000; // profiles fetched per request
const CHUNK = 500; // ids per bulk UPDATE

type ProfileRow = {
  id: string;
  username: string | null;
  subscription_tier: string | null;
  subscription_expires_at: string | null;
  subscription_is_permanent: boolean | null;
};

type Plan =
  | { kind: "skip"; reason: "active-max" | "permanent-pro" }
  | { kind: "fresh" } // start a new Pro term from now
  | { kind: "stack"; from: string }; // extend an active Pro from its current expiry

const now = Date.now();

/** Is this row's paid tier still in effect? Mirrors resolveTier in lib/subscription/resolve.ts. */
function isActivePaid(row: ProfileRow): boolean {
  if (row.subscription_tier !== "pro" && row.subscription_tier !== "max") return false;
  if (row.subscription_is_permanent) return true;
  const expires = row.subscription_expires_at ? new Date(row.subscription_expires_at).getTime() : NaN;
  return Number.isFinite(expires) && expires > now;
}

function planFor(row: ProfileRow): Plan {
  const active = isActivePaid(row);
  if (active && row.subscription_tier === "max") return { kind: "skip", reason: "active-max" };
  if (active && row.subscription_tier === "pro") {
    if (row.subscription_is_permanent) return { kind: "skip", reason: "permanent-pro" };
    return { kind: "stack", from: row.subscription_expires_at! };
  }
  return { kind: "fresh" };
}

function addDuration(fromMs: number): string | null {
  if (PERMANENT) return null;
  return new Date(fromMs + DAYS! * 24 * 60 * 60 * 1000).toISOString();
}

// --- load every profile ------------------------------------------------------
async function loadProfiles(): Promise<ProfileRow[]> {
  const rows: ProfileRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("profiles")
      .select("id, username, subscription_tier, subscription_expires_at, subscription_is_permanent")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to read profiles: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as ProfileRow[]));
    if (data.length < PAGE) break;
    if (LIMIT && rows.length >= LIMIT) break;
  }
  return LIMIT ? rows.slice(0, LIMIT) : rows;
}

async function main() {
  const label = DURATIONS.find((d) => d.id === DURATION)?.label ?? DURATION;
  console.log(`\n🎁 Gift Pro to every member — ${DURATION} (${label})${APPLY ? "" : "   [DRY RUN]"}`);
  console.log(`   Pro allowance: ${TIERS.pro.capabilities.monthlyAllowance} premium credits / 30d\n`);

  const profiles = await loadProfiles();
  const fresh: ProfileRow[] = [];
  const stack: { row: ProfileRow; expiresAt: string | null }[] = [];
  const skipped: Record<string, number> = {};

  for (const row of profiles) {
    const plan = planFor(row);
    if (plan.kind === "skip") {
      skipped[plan.reason] = (skipped[plan.reason] ?? 0) + 1;
      continue;
    }
    if (plan.kind === "fresh") fresh.push(row);
    else stack.push({ row, expiresAt: addDuration(new Date(plan.from).getTime()) });
  }

  console.log(`   profiles scanned : ${profiles.length}`);
  console.log(`   new Pro term     : ${fresh.length}`);
  console.log(`   extended Pro     : ${stack.length}`);
  console.log(`   skipped (Max)    : ${skipped["active-max"] ?? 0}`);
  console.log(`   skipped (永久Pro) : ${skipped["permanent-pro"] ?? 0}\n`);

  if (!APPLY) {
    const sample = [...fresh.slice(0, 5), ...stack.slice(0, 5).map((s) => s.row)];
    for (const row of sample) console.log(`   · @${row.username ?? row.id} (${row.subscription_tier ?? "free"})`);
    console.log(`\n   Dry run — nothing written. Re-run with --apply to grant.\n`);
    return;
  }

  const startedAt = new Date(now).toISOString();
  const freshExpiry = addDuration(now);
  let updated = 0;

  // Everyone starting a fresh term shares one expiry → bulk UPDATE by id chunks.
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const ids = fresh.slice(i, i + CHUNK).map((r) => r.id);
    const { error } = await sb
      .from("profiles")
      .update({
        subscription_tier: "pro",
        subscription_started_at: startedAt,
        subscription_expires_at: freshExpiry,
        subscription_is_permanent: PERMANENT,
        updated_at: startedAt
      })
      .in("id", ids);
    if (error) throw new Error(`Bulk grant failed at offset ${i}: ${error.message}`);
    updated += ids.length;
    console.log(`   granted ${updated}/${fresh.length}…`);
  }

  // Extensions each land on their own expiry → one UPDATE per member.
  for (const { row, expiresAt } of stack) {
    const { error } = await sb
      .from("profiles")
      .update({
        subscription_tier: "pro",
        subscription_expires_at: expiresAt,
        subscription_is_permanent: PERMANENT,
        updated_at: startedAt
      })
      .eq("id", row.id);
    if (error) throw new Error(`Extend failed for @${row.username ?? row.id}: ${error.message}`);
  }
  if (stack.length) console.log(`   extended ${stack.length} active Pro member(s)`);

  // Best-effort audit trail: ONE summary row, not one per member.
  const { error: auditError } = await sb.from("admin_audit_logs").insert({
    actor_admin_id: null,
    target_type: "profile",
    action: `subscription:gift-all->pro`,
    note: `Bulk gift: Pro (${DURATION}) to ${fresh.length + stack.length} member(s) via scripts/grant-pro-all.mts`,
    before_payload: { scanned: profiles.length, skipped },
    after_payload: {
      tier: "pro",
      duration: DURATION,
      expiresAt: freshExpiry,
      permanent: PERMANENT,
      granted: fresh.length,
      extended: stack.length
    }
  });
  if (auditError) console.warn(`   audit log skipped: ${auditError.message}`);

  console.log(`\n✅ Done — ${fresh.length + stack.length} member(s) now on Pro${PERMANENT ? " (永久)" : ` until ${freshExpiry}`}.\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
