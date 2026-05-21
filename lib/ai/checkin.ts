import { createAdminClient } from "@/lib/supabase/admin";

export const DAILY_CHECKIN_CREDITS = 3;
export const DAILY_CHECKIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type CheckinStatus = {
  canClaim: boolean;
  nextClaimAt: string | null;
  dailyAmount: number;
};

export async function getCheckinStatus(userId: string): Promise<CheckinStatus> {
  const admin = createAdminClient();
  if (!admin) return { canClaim: false, nextClaimAt: null, dailyAmount: DAILY_CHECKIN_CREDITS };

  const { data } = await admin
    .from("ai_credits")
    .select("last_checkin_at")
    .eq("user_id", userId)
    .maybeSingle();

  const lastClaim = data?.last_checkin_at ? new Date(data.last_checkin_at) : null;
  if (!lastClaim) {
    return { canClaim: true, nextClaimAt: null, dailyAmount: DAILY_CHECKIN_CREDITS };
  }
  const nextClaim = new Date(lastClaim.getTime() + DAILY_CHECKIN_INTERVAL_MS);
  if (nextClaim.getTime() <= Date.now()) {
    return { canClaim: true, nextClaimAt: null, dailyAmount: DAILY_CHECKIN_CREDITS };
  }
  return { canClaim: false, nextClaimAt: nextClaim.toISOString(), dailyAmount: DAILY_CHECKIN_CREDITS };
}

// Claim the daily bonus. Uses an optimistic-concurrency UPDATE so two
// simultaneous clicks can't both succeed: the update guards on the exact
// last_checkin_at value we read, so only one wins.
export async function claimDailyCheckin(
  userId: string
): Promise<{ ok: true; balance: number; credits: number } | { ok: false; nextClaimAt: string }> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Service-role client unavailable");

  const { data: row } = await admin
    .from("ai_credits")
    .select("balance, last_checkin_at")
    .eq("user_id", userId)
    .maybeSingle();

  const now = new Date();
  const lastClaim = row?.last_checkin_at ? new Date(row.last_checkin_at) : null;
  if (lastClaim && now.getTime() - lastClaim.getTime() < DAILY_CHECKIN_INTERVAL_MS) {
    return {
      ok: false,
      nextClaimAt: new Date(lastClaim.getTime() + DAILY_CHECKIN_INTERVAL_MS).toISOString()
    };
  }

  const newBalance = (row?.balance ?? 0) + DAILY_CHECKIN_CREDITS;
  const nowIso = now.toISOString();

  if (row) {
    let updateQuery = admin
      .from("ai_credits")
      .update({ balance: newBalance, last_checkin_at: nowIso, updated_at: nowIso })
      .eq("user_id", userId);
    updateQuery = row.last_checkin_at
      ? updateQuery.eq("last_checkin_at", row.last_checkin_at)
      : updateQuery.is("last_checkin_at", null);

    const { data: updated } = await updateQuery.select("balance").maybeSingle();
    if (!updated) {
      const status = await getCheckinStatus(userId);
      return {
        ok: false,
        nextClaimAt: status.nextClaimAt ?? new Date(now.getTime() + DAILY_CHECKIN_INTERVAL_MS).toISOString()
      };
    }
  } else {
    const { error } = await admin
      .from("ai_credits")
      .insert({ user_id: userId, balance: newBalance, last_checkin_at: nowIso, updated_at: nowIso });
    if (error) {
      // Row was just created by another request — surface the resulting cooldown.
      const status = await getCheckinStatus(userId);
      return {
        ok: false,
        nextClaimAt: status.nextClaimAt ?? new Date(now.getTime() + DAILY_CHECKIN_INTERVAL_MS).toISOString()
      };
    }
  }

  const { error: txError } = await admin
    .from("ai_credit_transactions")
    .insert({ user_id: userId, delta: DAILY_CHECKIN_CREDITS, reason: "daily_checkin" });
  if (txError) {
    console.error("[checkin] transaction log failed", txError);
    // Credit was granted; surface the success anyway.
  }

  return { ok: true, balance: newBalance, credits: DAILY_CHECKIN_CREDITS };
}
