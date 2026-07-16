import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/auth";
import { setSubscription } from "@/lib/subscription/entitlements";

// Admin manually grants / changes / revokes a member's premium membership.
// Payment is not wired yet (by design) — this is how the owner assigns Pro/Max
// to test the whole system, and how comped memberships are handed out.
const schema = z.object({
  userId: z.string().uuid(),
  tier: z.enum(["free", "pro", "max"]),
  // Ignored when tier is "free".
  duration: z.enum(["monthly", "quarterly", "yearly", "permanent"]).default("monthly")
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
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  try {
    const result = await setSubscription(parsed.data.userId, parsed.data.tier, parsed.data.duration, ctx.userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[admin/users/subscription] failed", error);
    return NextResponse.json({ ok: false, message: "Failed to update membership." }, { status: 500 });
  }
}
