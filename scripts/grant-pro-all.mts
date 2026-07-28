// One-time bulk gift: hand every existing member a Pro membership.
//
// CLI twin of the "Gift a membership to every member" panel in /admin/users —
// both are thin wrappers around giftAllMembers() in lib/subscription/entitlements.ts,
// so the policy can't drift between them. Use this when you'd rather not do it
// from a browser (a big member table, a flaky connection, or a scripted rollout).
//
// Policy (identical to the console, and to setSubscription's stacking rule):
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
//   npx tsx scripts/grant-pro-all.mts --limit 5 --apply      # try it on 5 members first
//   npx tsx scripts/grant-pro-all.mts --tier max --apply     # gift Max instead
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

import { giftAllMembers } from "@/lib/subscription/entitlements";
import { DURATIONS, TIERS, type Duration } from "@/lib/subscription/tiers";

// --- env (standalone tsx does NOT auto-load .env like Next) -------------------
const loadEnvFile = (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile;
for (const file of [".env.local", ".env"]) {
  try {
    loadEnvFile?.(file);
  } catch {
    /* file missing — ignore */
  }
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local, and run from the repo root."
  );
}

// --- args --------------------------------------------------------------------
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const TIER = (flag("--tier") ?? "pro") as "pro" | "max";
if (TIER !== "pro" && TIER !== "max") throw new Error(`Unknown --tier "${TIER}". Use: pro | max`);

const DURATION = (flag("--duration") ?? "monthly") as Duration;
if (!DURATIONS.some((d) => d.id === DURATION)) {
  throw new Error(`Unknown --duration "${DURATION}". Use: ${DURATIONS.map((d) => d.id).join(" | ")}`);
}

const LIMIT = Number(flag("--limit") ?? 0) || null;

async function main() {
  const label = DURATIONS.find((d) => d.id === DURATION)?.label ?? DURATION;
  const name = TIERS[TIER].name;
  console.log(`\n🎁 Gift ${name} to every member — ${DURATION} (${label})${APPLY ? "" : "   [DRY RUN]"}`);
  console.log(`   Allowance: ${TIERS[TIER].capabilities.monthlyAllowance} premium credits / 30d\n`);

  const plan = await giftAllMembers(TIER, DURATION, { apply: APPLY, actorAdminId: null, limit: LIMIT });

  console.log(`   members scanned  : ${plan.scanned}`);
  console.log(`   new term         : ${plan.granted}`);
  console.log(`   time extended    : ${plan.extended}`);
  console.log(`   skipped (higher) : ${plan.skippedHigherTier}`);
  console.log(`   skipped (永久)    : ${plan.skippedPermanent}`);
  // Buyers keep subscription_source = 'paid' and stay refundable; everyone else
  // is stamped 'gift', which the admin refund flow refuses outright.
  console.log(`   keep paid status : ${plan.keptPaid}`);
  for (const s of plan.sample) console.log(`   · @${s.username} (${s.action})`);

  if (!plan.applied) {
    console.log(`\n   Dry run — nothing written. Re-run with --apply to grant.\n`);
    return;
  }
  const until = plan.permanent ? " (永久)" : ` until ${plan.expiresAt}`;
  console.log(`\n✅ Done — ${plan.granted + plan.extended} member(s) now on ${name}${until}.\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
