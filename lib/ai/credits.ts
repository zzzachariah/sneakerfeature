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

  const current = await getBalance(userId);
  const next = current + credits;

  const { error: balanceError } = await admin
    .from("ai_credits")
    .upsert({ user_id: userId, balance: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (balanceError) throw balanceError;

  const { error: txError } = await admin
    .from("ai_credit_transactions")
    .insert({ user_id: userId, delta: credits, reason: "recharge", package_label: packageLabel });
  if (txError) throw txError;

  return next;
}

export async function deductCredits(userId: string, amount: number): Promise<number> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Service-role client unavailable");

  const current = await getBalance(userId);
  if (current < amount) throw new InsufficientCreditsError(current);
  const next = current - amount;

  // Guard the update on the current balance so a concurrent spend can't drive
  // the balance negative (the table's balance >= 0 CHECK is the final backstop).
  const { data, error } = await admin
    .from("ai_credits")
    .update({ balance: next, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("balance", current)
    .select("balance")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new InsufficientCreditsError(current);

  const { error: txError } = await admin
    .from("ai_credit_transactions")
    .insert({ user_id: userId, delta: -amount, reason: "spend" });
  if (txError) throw txError;

  return next;
}
