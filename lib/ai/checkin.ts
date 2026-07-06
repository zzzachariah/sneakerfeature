import { createAdminClient } from "@/lib/supabase/admin";
import { getDailyCheckinCredits } from "@/lib/admin/settings";

export const DAILY_CHECKIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type CheckinStatus = {
  canClaim: boolean;
  nextClaimAt: string | null;
  dailyAmount: number;
};

export async function getCheckinStatus(userId: string): Promise<CheckinStatus> {
  const dailyAmount = await getDailyCheckinCredits();
  const admin = createAdminClient();
  if (!admin) return { canClaim: false, nextClaimAt: null, dailyAmount };

  // Admin disabled check-in: report it as not claimable so the UI doesn't show
  // an enabled button that would then 409 (claimDailyCheckin rejects amount<=0).
  if (dailyAmount <= 0) {
    return { canClaim: false, nextClaimAt: null, dailyAmount };
  }

  const { data } = await admin
    .from("ai_credits")
    .select("last_checkin_at")
    .eq("user_id", userId)
    .maybeSingle();

  const lastClaim = data?.last_checkin_at ? new Date(data.last_checkin_at) : null;
  if (!lastClaim) {
    return { canClaim: true, nextClaimAt: null, dailyAmount };
  }
  const nextClaim = new Date(lastClaim.getTime() + DAILY_CHECKIN_INTERVAL_MS);
  if (nextClaim.getTime() <= Date.now()) {
    return { canClaim: true, nextClaimAt: null, dailyAmount };
  }
  return { canClaim: false, nextClaimAt: nextClaim.toISOString(), dailyAmount };
}

// Claim the daily bonus. Delegates to the claim_daily_checkin DB function
// (migration 039), which grants atomically only if the interval has elapsed, so
// two simultaneous clicks can't both succeed and a concurrent spend can't lose
// the grant.
export async function claimDailyCheckin(
  userId: string
): Promise<{ ok: true; balance: number; credits: number } | { ok: false; nextClaimAt: string }> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Service-role client unavailable");

  const dailyAmount = await getDailyCheckinCredits();
  const now = new Date();

  if (dailyAmount <= 0) {
    // Daily check-in disabled by admin: treat as already-claimed for the full
    // interval so the UI stays disabled until the admin re-enables it.
    return {
      ok: false,
      nextClaimAt: new Date(now.getTime() + DAILY_CHECKIN_INTERVAL_MS).toISOString()
    };
  }

  // Atomic grant-if-eligible in the DB (migration 039). The function only
  // credits when the interval has elapsed and does the balance += amount and
  // ledger insert in one transaction, so it can neither be double-claimed nor
  // lost to a concurrent spend. Returns null when the claim is rejected.
  const { data: newBalance, error } = await admin.rpc("claim_daily_checkin", {
    p_user_id: userId,
    p_amount: dailyAmount,
    p_interval_ms: DAILY_CHECKIN_INTERVAL_MS
  });

  if (error || newBalance == null) {
    const status = await getCheckinStatus(userId);
    return {
      ok: false,
      nextClaimAt: status.nextClaimAt ?? new Date(now.getTime() + DAILY_CHECKIN_INTERVAL_MS).toISOString()
    };
  }

  return { ok: true, balance: newBalance as number, credits: dailyAmount };
}
