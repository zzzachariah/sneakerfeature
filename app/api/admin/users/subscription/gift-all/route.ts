import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/auth";
import { GiftWriteError, giftAllMembers } from "@/lib/subscription/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Touches every profile in one request; the write itself is a handful of bulk
// UPDATEs, but the read paginates the whole member table.
export const maxDuration = 300;

// Admin gifts a membership to EVERY member at once (全站送会员).
//
// Two-step by design: the console first POSTs { apply: false } for a preview
// (nothing is written, the response is just the plan), then re-POSTs with
// { apply: true } once the admin confirms the numbers. The per-member policy —
// never downgrade an active higher tier, stack onto an active same tier — lives
// in giftAllMembers so this route and scripts/grant-pro-all.mts can't drift.
const schema = z.object({
  tier: z.enum(["pro", "max"]).default("pro"),
  duration: z.enum(["monthly", "quarterly", "yearly", "permanent"]).default("monthly"),
  /** false (default) = preview only. */
  apply: z.boolean().default(false)
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
  const { tier, duration, apply } = parsed.data;

  try {
    const plan = await giftAllMembers(tier, duration, { apply, actorAdminId: ctx.userId });
    return NextResponse.json({ ok: true, ...plan });
  } catch (error) {
    console.error("[admin/users/subscription/gift-all] failed", error);
    // Part-written bulk gift: say so, with the count, so the operator doesn't
    // retry over the members who already got their term.
    if (error instanceof GiftWriteError) {
      return NextResponse.json(
        { ok: false, message: error.message, partial: error.appliedIds.length > 0, applied: error.appliedIds.length },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: false, message: "Bulk gift failed." }, { status: 500 });
  }
}
