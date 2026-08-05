import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/auth";
import { giftMembers } from "@/lib/subscription/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Bounded by MAX_SELECTION below (a few bulk UPDATEs plus one per extension),
// so it is nowhere near the whole-table gift-all route — but a 500-member
// selection with many extensions still needs more than the default budget.
export const maxDuration = 120;

// Admin gifts a membership to a HAND-PICKED set of members (多选用户赠送).
//
// Two-step like gift-all: the console POSTs { apply: false } first to get the
// plan (nothing written), shows the operator exactly who moves and who is
// skipped, then re-POSTs with { apply: true }. The per-member policy — never
// downgrade an active higher tier, stack onto an active same tier, never strip
// a buyer's 'paid' source — lives in giftMembers, shared with the bulk flow.
const MAX_SELECTION = 500;

const schema = z.object({
  userIds: z
    .array(z.string().uuid())
    .min(1, "Select at least one member.")
    .max(MAX_SELECTION, `Select at most ${MAX_SELECTION} members at a time.`),
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
  const { userIds, tier, duration, apply } = parsed.data;

  try {
    const plan = await giftMembers(userIds, tier, duration, { apply, actorAdminId: ctx.userId });
    return NextResponse.json({ ok: true, ...plan });
  } catch (error) {
    console.error("[admin/users/subscription/gift] failed", error);
    return NextResponse.json({ ok: false, message: "Gift failed." }, { status: 500 });
  }
}
