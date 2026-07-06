import { createAdminClient } from "@/lib/supabase/admin";

// All credit writes go through the service-role client. RLS gives users
// read-only access to their own rows; no client can mutate balances directly.

export class InsufficientCreditsError extends Error {
  balance: number;
  constructor(balance: number) {
    super("Insufficient credits");
    this.name = "InsufficientCreditsError";
    this.balance = balance;
  }
}

export async function getBalance(userId: string): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;
  const { data } = await admin.from("ai_credits").select("balance").eq("user_id", userId).maybeSingle();
  return data?.balance ?? 0;
}

export async function grantCredits(userId: string, credits: number, packageLabel: string): Promise<number> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Service-role client unavailable");

  // Atomic `balance = balance + credits` + ledger insert in one DB call so a
  // concurrent spend/check-in can't clobber the grant (see migration 039).
  const { data, error } = await admin.rpc("adjust_credits", {
    p_user_id: userId,
    p_delta: credits,
    p_reason: "recharge",
    p_label: packageLabel
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

// Admin reset: zero out a user's balance and record the deduction as a
// single transaction. Returns the prior balance.
export async function clearCreditsAsAdmin(userId: string, note: string): Promise<number> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Service-role client unavailable");

  const current = await getBalance(userId);
  if (current === 0) return 0;

  // Subtract exactly the balance we observed; the ledger records -current.
  const { error } = await admin.rpc("adjust_credits", {
    p_user_id: userId,
    p_delta: -current,
    p_reason: "admin_clear",
    p_label: note
  });
  if (error) throw error;

  return current;
}

export async function deductCredits(userId: string, amount: number): Promise<number> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Service-role client unavailable");

  // Atomic check-and-decrement in the DB: the function guards on balance so a
  // concurrent spend or check-in can't drive the balance negative or be lost.
  const { data, error } = await admin.rpc("spend_credits", {
    p_user_id: userId,
    p_amount: amount
  });
  if (error) {
    if (error.message?.includes("insufficient_credits") || error.code === "23514") {
      throw new InsufficientCreditsError(await getBalance(userId));
    }
    throw error;
  }
  return (data as number) ?? 0;
}
