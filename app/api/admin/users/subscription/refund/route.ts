import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/auth";
import { revokeSubscription } from "@/lib/subscription/entitlements";
import { refundLatestPayment } from "@/lib/stripe/refund";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin refunds or cancels a member's premium membership.
//   * mode "refund" — issue a Stripe refund for their latest paid payment AND
//     revoke access. Refused with "gifted" for a comped / bulk-gifted membership
//     (赠送的会员无法退款) and with "no_payment" when nothing is on file.
//   * mode "cancel" — revoke access to free WITHOUT a refund. This is the
//     correct action for a gift the admin wants to take back.
// Either way the member returns to free, which releases the tier-change lock.
const schema = z.object({
  userId: z.string().uuid(),
  mode: z.enum(["refund", "cancel"]).default("refund")
});

export async function POST(request: Request) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }
  const { userId, mode } = parsed.data;

  try {
    if (mode === "cancel") {
      await revokeSubscription(userId, { actorAdminId: ctx.userId, reason: "cancel" });
      return NextResponse.json({ ok: true, mode, tier: "free" });
    }

    const result = await refundLatestPayment(userId, ctx.userId);
    if (result.status === "gifted") {
      return NextResponse.json(
        {
          ok: false,
          code: "gifted",
          message:
            "This membership was gifted, not purchased — there is nothing to refund. " +
            "Use Cancel to revoke it.（赠送的会员无法退款，请使用「取消」收回权益。）"
        },
        { status: 409 }
      );
    }
    if (result.status === "no_payment") {
      return NextResponse.json(
        {
          ok: false,
          code: "no_payment",
          message: "No refundable Stripe payment on file. Use Cancel to revoke access without a refund."
        },
        { status: 409 }
      );
    }
    if (result.status === "error") {
      return NextResponse.json({ ok: false, message: `Refund failed: ${result.message}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, mode, tier: "free", refund: result });
  } catch (error) {
    console.error("[admin/users/subscription/refund] failed", error);
    return NextResponse.json({ ok: false, message: "Failed to process the request." }, { status: 500 });
  }
}
