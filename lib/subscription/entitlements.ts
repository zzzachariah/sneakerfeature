// Server-side resolution of a member's effective entitlements: which tier is
// actually active (expiry-checked), the monthly premium allowance, and the
// admin grant flow. All writes go through the service-role client.

import { createAdminClient } from "@/lib/supabase/admin";
import { ALLOWANCE_PERIOD_SECONDS, DURATIONS, tierConfig, tierRank, type Duration, type Tier } from "@/lib/subscription/tiers";
import {
  memberContextFromRow,
  parseMemberPrefs,
  parseSubscriptionSource,
  resolveTier,
  type MemberContext,
  type MemberPrefs,
  type SubscriptionRow,
  type SubscriptionSource
} from "@/lib/subscription/resolve";

export type { MemberPrefs, MemberContext, SubscriptionRow, SubscriptionSource } from "@/lib/subscription/resolve";
export { resolveTier, parseMemberPrefs, memberContextFromRow } from "@/lib/subscription/resolve";

// --- subscription_source, tolerantly ----------------------------------------
// `subscription_source` lands with migration 047. A deployment that ships this
// code before the migration runs would otherwise fail EVERY membership read and
// write with 42703 (undefined_column) — silently demoting every paying member to
// free and breaking Stripe fulfilment. So each statement that mentions the
// column falls back to its pre-047 shape once, instead of erroring.

/** Columns getMemberContext needs, with and without the 047 column. */
export const MEMBER_COLUMNS =
  "subscription_tier, subscription_expires_at, subscription_is_permanent, subscription_source, member_prefs";
const MEMBER_COLUMNS_LEGACY =
  "subscription_tier, subscription_expires_at, subscription_is_permanent, member_prefs";

/** Columns the grant/revoke paths read before writing, with and without 047. */
const CURRENT_COLUMNS =
  "subscription_tier, subscription_expires_at, subscription_is_permanent, subscription_source, username";
const CURRENT_COLUMNS_LEGACY =
  "subscription_tier, subscription_expires_at, subscription_is_permanent, username";

type PgError = { code?: string; message?: string } | null;

/** True when the failure is "profiles.subscription_source doesn't exist yet". */
export function isMissingSourceColumn(error: PgError): boolean {
  if (!error) return false;
  return error.code === "42703" || /subscription_source/i.test(error.message ?? "");
}

/**
 * Run a profile UPDATE that sets `subscription_source`, retrying without it if
 * migration 047 hasn't been applied. `apply` is called with the patch to write,
 * so callers keep their own `.eq(...)` / `.in(...)` targeting.
 */
async function updateWithSource<T extends { error: PgError }>(
  patch: Record<string, unknown>,
  apply: (patch: Record<string, unknown>) => PromiseLike<T>
): Promise<T> {
  const first = await apply(patch);
  if (!isMissingSourceColumn(first.error)) return first;
  const legacy = { ...patch };
  delete legacy.subscription_source;
  return apply(legacy);
}

/**
 * Run a profiles SELECT that asks for `subscription_source`, retrying with the
 * pre-047 column list if the column isn't there yet. Returns the row (or null).
 */
async function selectWithSource<T extends { data: unknown; error: PgError }>(
  read: (columns: string) => PromiseLike<T>,
  columns: string,
  legacyColumns: string
): Promise<unknown> {
  const first = await read(columns);
  if (!isMissingSourceColumn(first.error)) return first.data;
  return (await read(legacyColumns)).data;
}

// Server read of a user's membership context straight from profiles.
export async function getMemberContext(userId: string): Promise<MemberContext> {
  const db = createAdminClient();
  if (!db) return memberContextFromRow({});
  const data = await selectWithSource(
    (columns: string) => db.from("profiles").select(columns).eq("id", userId).maybeSingle(),
    MEMBER_COLUMNS,
    MEMBER_COLUMNS_LEGACY
  );
  return memberContextFromRow((data as SubscriptionRow | null) ?? {});
}

/**
 * The source to write when granting/extending a membership that is NOT a
 * purchase (admin grant or bulk gift). Money is never downgraded: a member whose
 * ACTIVE membership was bought stays "paid" — and therefore stays refundable —
 * even when an admin stacks a gift on top of it. Everyone else becomes "gift".
 */
export function giftSourceFor(current: SubscriptionRow | null | undefined): SubscriptionSource {
  if (!current) return "gift";
  const { tier } = resolveTier(current);
  if (tier === "free") return "gift"; // expired / never paid — the old source is spent
  return parseSubscriptionSource(current.subscription_source) === "paid" ? "paid" : "gift";
}

// --- Monthly premium allowance ---------------------------------------------

export async function getAllowanceBalance(userId: string, tier: Tier): Promise<number> {
  const db = createAdminClient();
  if (!db) return 0;
  const grant = tierConfig(tier).capabilities.monthlyAllowance;
  const { data, error } = await db.rpc("refresh_allowance", {
    p_user_id: userId,
    p_monthly_grant: grant,
    p_period_seconds: ALLOWANCE_PERIOD_SECONDS
  });
  if (error) {
    console.error("[entitlements] refresh_allowance failed", error.message);
    return 0;
  }
  return (data as number) ?? 0;
}

export class InsufficientAllowanceError extends Error {
  constructor() {
    super("Insufficient premium allowance");
    this.name = "InsufficientAllowanceError";
  }
}

export async function spendAllowance(userId: string, amount: number, tier: Tier): Promise<number> {
  const db = createAdminClient();
  if (!db) throw new Error("Service-role client unavailable");
  const grant = tierConfig(tier).capabilities.monthlyAllowance;
  const { data, error } = await db.rpc("spend_allowance", {
    p_user_id: userId,
    p_amount: amount,
    p_monthly_grant: grant,
    p_period_seconds: ALLOWANCE_PERIOD_SECONDS
  });
  if (error) {
    if (error.message?.includes("insufficient_allowance") || error.code === "23514") {
      throw new InsufficientAllowanceError();
    }
    throw error;
  }
  return (data as number) ?? 0;
}

// --- Admin grant flow -------------------------------------------------------

export function computeExpiry(duration: Duration, from = new Date()): { expiresAt: string | null; permanent: boolean } {
  if (duration === "permanent") return { expiresAt: null, permanent: true };
  const days = DURATIONS.find((d) => d.id === duration)?.days ?? 30;
  const end = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  return { expiresAt: end.toISOString(), permanent: false };
}

export type GrantResult = {
  tier: Tier;
  expiresAt: string | null;
  permanent: boolean;
  /** How the resulting membership is recorded; null when reset to free. */
  source: SubscriptionSource | null;
};

// Admin manually grants/extends a membership. If the user already has the same
// paid tier and isn't permanent, the new duration STACKS onto the remaining
// time; switching tiers or granting permanent resets from now.
//
// The grant is recorded as a GIFT unless it lands on top of an active membership
// the member actually paid for (see giftSourceFor) — a comped membership must
// never look, or refund, like a purchase.
export async function setSubscription(
  userId: string,
  tier: Tier,
  duration: Duration,
  actorAdminId: string
): Promise<GrantResult> {
  const db = createAdminClient();
  if (!db) throw new Error("Service-role client unavailable");

  const current = (await selectWithSource(
    (columns: string) => db.from("profiles").select(columns).eq("id", userId).maybeSingle(),
    CURRENT_COLUMNS,
    CURRENT_COLUMNS_LEGACY
  )) as (SubscriptionRow & { username?: string | null }) | null;

  let result: GrantResult;
  if (tier === "free") {
    result = { tier: "free", expiresAt: null, permanent: false, source: null };
    await updateWithSource(
      {
        subscription_tier: "free",
        subscription_expires_at: null,
        subscription_is_permanent: false,
        subscription_source: null,
        updated_at: new Date().toISOString()
      },
      (patch) => db.from("profiles").update(patch).eq("id", userId)
    );
  } else {
    // Stack onto remaining time only when extending the SAME non-permanent tier.
    const sameTier = current?.subscription_tier === tier;
    const notPermanent = !current?.subscription_is_permanent;
    const remaining =
      sameTier && notPermanent && current?.subscription_expires_at
        ? new Date(current.subscription_expires_at)
        : new Date();
    const base = remaining.getTime() > Date.now() ? remaining : new Date();
    const { expiresAt, permanent } = computeExpiry(duration, base);
    const source = giftSourceFor(current);
    result = { tier, expiresAt, permanent, source };
    await updateWithSource(
      {
        subscription_tier: tier,
        subscription_started_at: new Date().toISOString(),
        subscription_expires_at: expiresAt,
        subscription_is_permanent: permanent,
        subscription_source: source,
        updated_at: new Date().toISOString()
      },
      (patch) => db.from("profiles").update(patch).eq("id", userId)
    );

    // Seed / refresh the allowance row so premium usage works immediately.
    await getAllowanceBalance(userId, tier);
  }

  // Best-effort audit trail (tolerant of pre-migration audit schema).
  const { error: auditError } = await db.from("admin_audit_logs").insert({
    actor_admin_id: actorAdminId,
    target_type: "profile",
    action: `subscription:${current?.subscription_tier ?? "free"}->${tier}`,
    note: `@${current?.username ?? userId}: ${tier} (${duration}${result.source ? `, ${result.source}` : ""})`,
    before_payload: {
      tier: current?.subscription_tier ?? "free",
      source: parseSubscriptionSource(current?.subscription_source)
    },
    after_payload: {
      tier,
      duration,
      expiresAt: result.expiresAt,
      permanent: result.permanent,
      source: result.source
    }
  });
  if (auditError) console.warn("[entitlements] audit log skipped:", auditError.message);

  return result;
}

// --- Cancellation / revocation ---------------------------------------------

export type RevokeReason = "cancel" | "refund" | "dispute";

// Revoke a member's paid access, resetting them to the free tier. Backs both
// admin cancellations and refunds (the latter after the Stripe refund settles).
// Safe to call when already free — it just re-asserts the free state. Once free,
// the tier-change lock (purchaseDecision) releases so the member can buy again.
// actorAdminId is null for webhook-driven reverts (Stripe Dashboard refund /
// chargeback), mirroring grantFromPayment's payment-actor audit rows.
export async function revokeSubscription(
  userId: string,
  opts: { actorAdminId: string | null; reason: RevokeReason; note?: string }
): Promise<GrantResult> {
  const db = createAdminClient();
  if (!db) throw new Error("Service-role client unavailable");

  const current = (await selectWithSource(
    (columns: string) => db.from("profiles").select(columns).eq("id", userId).maybeSingle(),
    CURRENT_COLUMNS,
    CURRENT_COLUMNS_LEGACY
  )) as (SubscriptionRow & { username?: string | null }) | null;

  // Clearing the source too: the membership is gone, so there is nothing left to
  // classify — and a stale "paid" marker would keep the refund button armed on a
  // member who no longer holds anything.
  await updateWithSource(
    {
      subscription_tier: "free",
      subscription_expires_at: null,
      subscription_is_permanent: false,
      subscription_source: null,
      updated_at: new Date().toISOString()
    },
    (patch) => db.from("profiles").update(patch).eq("id", userId)
  );

  const { error: auditError } = await db.from("admin_audit_logs").insert({
    actor_admin_id: opts.actorAdminId,
    target_type: "profile",
    action: `subscription:${opts.reason}:${current?.subscription_tier ?? "free"}->free`,
    note: opts.note ?? `@${current?.username ?? userId}: ${opts.reason} → free`,
    before_payload: {
      tier: current?.subscription_tier ?? "free",
      expiresAt: current?.subscription_expires_at ?? null,
      permanent: Boolean(current?.subscription_is_permanent),
      source: parseSubscriptionSource(current?.subscription_source)
    },
    after_payload: { tier: "free", reason: opts.reason }
  });
  if (auditError) console.warn("[entitlements] revoke audit skipped:", auditError.message);

  return { tier: "free", expiresAt: null, permanent: false, source: null };
}

// --- Bulk gift (全站送会员) --------------------------------------------------

export type BulkGiftPlan = {
  /** Profiles examined. */
  scanned: number;
  /** Members who get a brand-new term starting now. */
  granted: number;
  /** Active members of the gifted tier whose remaining time is extended. */
  extended: number;
  /** Skipped because their ACTIVE tier outranks the gift (never downgrade). */
  skippedHigherTier: number;
  /** Skipped because they already hold this tier permanently. */
  skippedPermanent: number;
  /**
   * Of the affected members, how many bought their current membership. They keep
   * subscription_source = 'paid' (and therefore stay refundable); everyone else
   * is stamped 'gift'.
   */
  keptPaid: number;
  /** Expiry written to the fresh-term group; null when the gift is permanent. */
  expiresAt: string | null;
  permanent: boolean;
  /** False for a preview (nothing was written). */
  applied: boolean;
  /** First few affected members, for the preview UI. */
  sample: { username: string; tier: Tier; action: "grant" | "extend" }[];
};

/** What the gift did to one member. Skips carry their untouched membership. */
export type GiftOutcome = {
  userId: string;
  username: string | null;
  action: "grant" | "extend" | "skipped-higher-tier" | "skipped-permanent";
  /** Effective tier AFTER the gift (unchanged for a skip). */
  tier: Tier;
  expiresAt: string | null;
  permanent: boolean;
  source: SubscriptionSource | null;
};

/** giftMembers() adds the per-member outcomes the console needs to patch rows. */
export type GiftSelectionPlan = BulkGiftPlan & {
  results: GiftOutcome[];
  /** Requested ids with no profile (deleted between listing and gifting). */
  missing: string[];
};

type GiftRow = SubscriptionRow & { id: string; username: string | null };

const GIFT_PAGE = 1000; // profiles read per request
const GIFT_CHUNK = 500; // ids per bulk UPDATE
const GIFT_CONCURRENCY = 8; // parallel single-row extensions
const GIFT_COLUMNS =
  "id, username, subscription_tier, subscription_expires_at, subscription_is_permanent, subscription_source";
const GIFT_COLUMNS_LEGACY =
  "id, username, subscription_tier, subscription_expires_at, subscription_is_permanent";

/** How the gift lands on each member, before anything is written. */
type GiftSplit = {
  fresh: GiftRow[];
  extend: { row: GiftRow; expiresAt: string | null }[];
  skipped: { row: GiftRow; reason: "higher-tier" | "permanent" }[];
};

/**
 * Decide, per member, whether the gift starts a fresh term, stacks onto the
 * remaining time, or is skipped. Pure — shared by the bulk (every member) and
 * selected-members flows so the two can never drift apart.
 */
function planGift(profiles: GiftRow[], tier: "pro" | "max", duration: Duration): GiftSplit {
  const split: GiftSplit = { fresh: [], extend: [], skipped: [] };
  for (const row of profiles) {
    const { tier: effective } = resolveTier(row);
    if (tierRank(effective) > tierRank(tier)) {
      split.skipped.push({ row, reason: "higher-tier" });
    } else if (effective === tier && row.subscription_is_permanent) {
      split.skipped.push({ row, reason: "permanent" });
    } else if (effective === tier && row.subscription_expires_at) {
      // Active same tier — stack onto whatever time is left.
      const { expiresAt } = computeExpiry(duration, new Date(row.subscription_expires_at));
      split.extend.push({ row, expiresAt });
    } else {
      split.fresh.push(row);
    }
  }
  return split;
}

/** Roll a split up into the preview numbers the console and CLI both print. */
function summarizeGift(
  scanned: number,
  split: GiftSplit,
  tier: "pro" | "max",
  freshExpiry: string | null,
  permanent: boolean
): BulkGiftPlan {
  return {
    scanned,
    granted: split.fresh.length,
    extended: split.extend.length,
    skippedHigherTier: split.skipped.filter((s) => s.reason === "higher-tier").length,
    skippedPermanent: split.skipped.filter((s) => s.reason === "permanent").length,
    keptPaid:
      split.fresh.filter((r) => giftSourceFor(r) === "paid").length +
      split.extend.filter((e) => giftSourceFor(e.row) === "paid").length,
    expiresAt: freshExpiry,
    permanent,
    applied: false,
    sample: [
      ...split.fresh.slice(0, 5).map((r) => ({ username: r.username ?? r.id, tier, action: "grant" as const })),
      ...split.extend
        .slice(0, 5)
        .map((e) => ({ username: e.row.username ?? e.row.id, tier, action: "extend" as const }))
    ]
  };
}

/**
 * Write a planned gift. Fresh terms share one expiry so they go out as chunked
 * bulk UPDATEs — split by the source they end up with (buyers keep 'paid', see
 * giftSourceFor) so each half is still one statement per chunk. Extensions each
 * land on their own expiry, so those are one UPDATE per member.
 */
async function writeGift(
  db: NonNullable<ReturnType<typeof createAdminClient>>,
  split: GiftSplit,
  tier: "pro" | "max",
  freshExpiry: string | null,
  permanent: boolean,
  stamp: string
): Promise<void> {
  for (const source of ["gift", "paid"] as const) {
    const group = split.fresh.filter((r) => giftSourceFor(r) === source);
    for (let i = 0; i < group.length; i += GIFT_CHUNK) {
      const ids = group.slice(i, i + GIFT_CHUNK).map((r) => r.id);
      const { error } = await updateWithSource(
        {
          subscription_tier: tier,
          subscription_started_at: stamp,
          subscription_expires_at: freshExpiry,
          subscription_is_permanent: permanent,
          subscription_source: source,
          updated_at: stamp
        },
        (patch) => db.from("profiles").update(patch).in("id", ids)
      );
      if (error) throw new Error(`Bulk gift failed at offset ${i} (${source}): ${error.message}`);
    }
  }

  for (let i = 0; i < split.extend.length; i += GIFT_CONCURRENCY) {
    const batch = split.extend.slice(i, i + GIFT_CONCURRENCY);
    const results = await Promise.all(
      batch.map(({ row, expiresAt }) =>
        updateWithSource(
          {
            subscription_tier: tier,
            subscription_expires_at: expiresAt,
            subscription_is_permanent: permanent,
            subscription_source: giftSourceFor(row),
            updated_at: stamp
          },
          (patch) => db.from("profiles").update(patch).eq("id", row.id)
        )
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(`Gift extension failed: ${failed.error.message}`);
  }
}

/**
 * Gift `tier` for `duration` to EVERY member at once. Preview-first: pass
 * `apply: false` (the default) to get the plan without writing anything.
 *
 * The per-member policy mirrors setSubscription's stacking rule, so a gifted
 * membership is indistinguishable from a comped one:
 *   - an ACTIVE higher tier is skipped — a gift must never downgrade someone
 *     who paid for more (an EXPIRED one counts as free and does get the gift);
 *   - an ACTIVE same-tier member has the gift STACKED onto their remaining time;
 *   - a PERMANENT same-tier member is skipped (nothing to add);
 *   - everyone else starts a fresh term from now.
 *
 * Every touched member is stamped subscription_source = 'gift' EXCEPT those
 * whose active membership was bought (giftSourceFor) — stacking a free month
 * onto a purchase must not quietly strip that buyer's right to a refund.
 *
 * Not idempotent: running it twice stacks two terms onto everyone. Preview first.
 *
 * The monthly allowance is deliberately NOT seeded per member — refresh_allowance
 * upserts the row on first read/spend, so gifted members get their credits the
 * moment they use the AI, without this writing a row per user.
 */
export async function giftAllMembers(
  tier: "pro" | "max",
  duration: Duration,
  opts: { apply?: boolean; actorAdminId: string | null; limit?: number | null } = { actorAdminId: null }
): Promise<BulkGiftPlan> {
  const db = createAdminClient();
  if (!db) throw new Error("Service-role client unavailable");
  const apply = opts.apply === true;
  const limit = opts.limit && opts.limit > 0 ? opts.limit : null;

  // --- read every profile ---
  // Falls back once (not per page) when migration 047 hasn't been applied.
  let giftColumns = GIFT_COLUMNS;
  const rows: GiftRow[] = [];
  for (let from = 0; ; from += GIFT_PAGE) {
    const page = () =>
      db.from("profiles").select(giftColumns).order("id", { ascending: true }).range(from, from + GIFT_PAGE - 1);
    let { data, error } = await page();
    if (isMissingSourceColumn(error)) {
      giftColumns = GIFT_COLUMNS_LEGACY;
      ({ data, error } = await page());
    }
    if (error) throw new Error(`Failed to read profiles: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as unknown as GiftRow[]));
    if (data.length < GIFT_PAGE) break;
    if (limit && rows.length >= limit) break;
  }
  const profiles = limit ? rows.slice(0, limit) : rows;

  // --- plan ---
  const now = new Date();
  const split = planGift(profiles, tier, duration);
  const { expiresAt: freshExpiry, permanent } = computeExpiry(duration, now);
  const plan = summarizeGift(profiles.length, split, tier, freshExpiry, permanent);
  if (!apply) return plan;

  // --- write ---
  const stamp = now.toISOString();
  await writeGift(db, split, tier, freshExpiry, permanent, stamp);

  // Best-effort audit trail: ONE summary row, not one per member.
  const { error: auditError } = await db.from("admin_audit_logs").insert({
    actor_admin_id: opts.actorAdminId,
    target_type: "profile",
    action: `subscription:gift-all->${tier}`,
    note: `Bulk gift: ${tier} (${duration}) to ${plan.granted + plan.extended} member(s)`,
    before_payload: {
      scanned: profiles.length,
      skippedHigherTier: plan.skippedHigherTier,
      skippedPermanent: plan.skippedPermanent
    },
    after_payload: {
      tier,
      duration,
      expiresAt: freshExpiry,
      permanent,
      granted: plan.granted,
      extended: plan.extended,
      source: "gift",
      keptPaid: plan.keptPaid
    }
  });
  if (auditError) console.warn("[entitlements] gift audit skipped:", auditError.message);

  return { ...plan, applied: true };
}

/**
 * Gift `tier` for `duration` to a HAND-PICKED set of members (多选用户赠送).
 *
 * Same policy, same writes and the same preview-first contract as
 * giftAllMembers — it just scopes the read to the ids the admin ticked instead
 * of the whole member table. Pass `apply: false` (the default) to get the plan
 * without writing anything.
 *
 * Unlike the bulk flow it also returns a per-member `results` list, so the
 * console can patch exactly the rows it touched (and show which ones were
 * skipped, and why) without a full page reload.
 *
 * Not idempotent: gifting the same members twice stacks two terms.
 */
export async function giftMembers(
  userIds: string[],
  tier: "pro" | "max",
  duration: Duration,
  opts: { apply?: boolean; actorAdminId: string | null } = { actorAdminId: null }
): Promise<GiftSelectionPlan> {
  const db = createAdminClient();
  if (!db) throw new Error("Service-role client unavailable");
  const apply = opts.apply === true;
  const ids = [...new Set(userIds)];
  if (ids.length === 0) {
    return {
      scanned: 0,
      granted: 0,
      extended: 0,
      skippedHigherTier: 0,
      skippedPermanent: 0,
      keptPaid: 0,
      expiresAt: null,
      permanent: duration === "permanent",
      applied: false,
      sample: [],
      results: [],
      missing: []
    };
  }

  // --- read the picked profiles (chunked so a long selection can't blow the URL) ---
  let giftColumns = GIFT_COLUMNS;
  const profiles: GiftRow[] = [];
  for (let i = 0; i < ids.length; i += GIFT_CHUNK) {
    const slice = ids.slice(i, i + GIFT_CHUNK);
    const read = () => db.from("profiles").select(giftColumns).in("id", slice);
    let { data, error } = await read();
    if (isMissingSourceColumn(error)) {
      giftColumns = GIFT_COLUMNS_LEGACY;
      ({ data, error } = await read());
    }
    if (error) throw new Error(`Failed to read profiles: ${error.message}`);
    profiles.push(...((data ?? []) as unknown as GiftRow[]));
  }
  const found = new Set(profiles.map((p) => p.id));
  const missing = ids.filter((id) => !found.has(id));

  // --- plan ---
  const now = new Date();
  const split = planGift(profiles, tier, duration);
  const { expiresAt: freshExpiry, permanent } = computeExpiry(duration, now);
  const summary = summarizeGift(profiles.length, split, tier, freshExpiry, permanent);

  const results: GiftOutcome[] = [
    ...split.fresh.map((row) => ({
      userId: row.id,
      username: row.username,
      action: "grant" as const,
      tier: tier as Tier,
      expiresAt: freshExpiry,
      permanent,
      source: giftSourceFor(row)
    })),
    ...split.extend.map(({ row, expiresAt }) => ({
      userId: row.id,
      username: row.username,
      action: "extend" as const,
      tier: tier as Tier,
      expiresAt,
      permanent,
      source: giftSourceFor(row)
    })),
    // Skips keep whatever they already hold — reported so the console can say
    // why a ticked member didn't move instead of silently leaving them out.
    ...split.skipped.map(({ row, reason }) => ({
      userId: row.id,
      username: row.username,
      action: (reason === "higher-tier" ? "skipped-higher-tier" : "skipped-permanent") as GiftOutcome["action"],
      tier: resolveTier(row).tier,
      expiresAt: row.subscription_expires_at ?? null,
      permanent: Boolean(row.subscription_is_permanent),
      source: parseSubscriptionSource(row.subscription_source)
    }))
  ];

  if (!apply) return { ...summary, results, missing };

  // --- write ---
  const stamp = now.toISOString();
  await writeGift(db, split, tier, freshExpiry, permanent, stamp);

  const names = [...split.fresh, ...split.extend.map((e) => e.row)]
    .slice(0, 8)
    .map((r) => `@${r.username ?? r.id}`)
    .join(", ");
  const { error: auditError } = await db.from("admin_audit_logs").insert({
    actor_admin_id: opts.actorAdminId,
    target_type: "profile",
    action: `subscription:gift-selected->${tier}`,
    note:
      `Gift: ${tier} (${duration}) to ${summary.granted + summary.extended} of ${ids.length} selected member(s)` +
      (names ? ` — ${names}${summary.granted + summary.extended > 8 ? ", …" : ""}` : ""),
    before_payload: {
      selected: ids.length,
      scanned: profiles.length,
      skippedHigherTier: summary.skippedHigherTier,
      skippedPermanent: summary.skippedPermanent
    },
    after_payload: {
      tier,
      duration,
      expiresAt: freshExpiry,
      permanent,
      granted: summary.granted,
      extended: summary.extended,
      source: "gift",
      keptPaid: summary.keptPaid,
      userIds: [...split.fresh, ...split.extend.map((e) => e.row)].map((r) => r.id)
    }
  });
  if (auditError) console.warn("[entitlements] gift audit skipped:", auditError.message);

  return { ...summary, applied: true, results, missing };
}

// Persist member UI prefs (skin / home order / menu / model pref). Only paid
// tiers may personalize; callers should gate on that first.
export async function saveMemberPrefs(userId: string, patch: Partial<MemberPrefs>): Promise<MemberPrefs> {
  const db = createAdminClient();
  if (!db) throw new Error("Service-role client unavailable");
  const { data } = await db.from("profiles").select("member_prefs").eq("id", userId).maybeSingle();
  const current = parseMemberPrefs(data?.member_prefs);
  const next: MemberPrefs = { ...current, ...patch };
  await db
    .from("profiles")
    .update({ member_prefs: next, updated_at: new Date().toISOString() })
    .eq("id", userId);
  return next;
}

// --- Paid-checkout grant (Stripe) ------------------------------------------

// Grant a membership from a completed Stripe payment. Mirrors the admin grant's
// stacking rule (extend the SAME non-permanent tier from its remaining time;
// switching tier or going permanent resets from now) but records the action as
// a payment rather than an admin edit. Idempotency is enforced by the caller
// (lib/stripe/fulfill.ts) via the stripe_payments session claim, so this must
// only ever run once per checkout session.
export async function grantFromPayment(
  userId: string,
  tier: "pro" | "max",
  duration: Duration,
  payment: { sessionId: string; amountTotal: number | null; currency: string | null }
): Promise<GrantResult> {
  const db = createAdminClient();
  if (!db) throw new Error("Service-role client unavailable");

  const current = (await selectWithSource(
    (columns: string) => db.from("profiles").select(columns).eq("id", userId).maybeSingle(),
    CURRENT_COLUMNS,
    CURRENT_COLUMNS_LEGACY
  )) as (SubscriptionRow & { username?: string | null }) | null;

  const sameTier = current?.subscription_tier === tier;
  const notPermanent = !current?.subscription_is_permanent;
  const remaining =
    sameTier && notPermanent && current?.subscription_expires_at
      ? new Date(current.subscription_expires_at)
      : new Date();
  const base = remaining.getTime() > Date.now() ? remaining : new Date();
  let { expiresAt, permanent } = computeExpiry(duration, base);

  // NEVER shorten a lifetime membership. /api/stripe/checkout refuses a purchase
  // from a permanent member (purchaseDecision → reason "permanent"), but admins
  // bypass that gate and a webhook can always arrive late, so the grant itself
  // holds the line: writing a 30-day expiry over an existing permanent plan of
  // the same-or-lower tier would turn a paid-for lifetime into a month.
  const alreadyPermanent = Boolean(current?.subscription_is_permanent);
  const currentTier = resolveTier(current ?? {}).tier;
  if (alreadyPermanent && !permanent && tierRank(currentTier) >= tierRank(tier)) {
    console.warn("[entitlements] permanent membership preserved against a shorter purchase", {
      userId,
      currentTier,
      purchased: `${tier}/${duration}`,
      session: payment.sessionId
    });
    expiresAt = null;
    permanent = true;
  }

  await updateWithSource(
    {
      subscription_tier: tier,
      subscription_started_at: new Date().toISOString(),
      subscription_expires_at: expiresAt,
      subscription_is_permanent: permanent,
      // A purchase always records 'paid' — this is the marker the refund flow
      // gates on, and it upgrades a gifted member the moment they actually buy.
      subscription_source: "paid",
      updated_at: new Date().toISOString()
    },
    (patch) => db.from("profiles").update(patch).eq("id", userId)
  );

  // Seed / refresh the allowance row so premium usage works immediately.
  await getAllowanceBalance(userId, tier);

  // Best-effort audit trail — actor is the payment, not an admin.
  const { error: auditError } = await db.from("admin_audit_logs").insert({
    actor_admin_id: null,
    target_type: "profile",
    action: `subscription:stripe:${current?.subscription_tier ?? "free"}->${tier}`,
    note: `@${current?.username ?? userId}: ${tier} (${duration}) via Stripe ${payment.sessionId}`,
    before_payload: {
      tier: current?.subscription_tier ?? "free",
      source: parseSubscriptionSource(current?.subscription_source)
    },
    after_payload: {
      tier,
      duration,
      expiresAt,
      permanent,
      source: "paid",
      session: payment.sessionId,
      amount: payment.amountTotal,
      currency: payment.currency
    }
  });
  if (auditError) console.warn("[entitlements] payment audit skipped:", auditError.message);

  return { tier, expiresAt, permanent, source: "paid" };
}
