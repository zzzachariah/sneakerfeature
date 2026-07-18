import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderRenewalEmail } from "@/lib/email/renewal-email";
import { absoluteUrl } from "@/lib/seo";

// Daily job that emails paid members whose non-permanent pass expires within the
// next few days, so they can renew before losing their skin, precise sizing and
// premium model. Triggered by Vercel Cron (see vercel.json) with
// Authorization: Bearer $CRON_SECRET. Delivery is via Resend (same transport as
// the auth emails). Dedup: renewal_reminded_at (migration 043) guards against
// re-sending within the same expiry cycle — after a renewal the expiry moves
// out, which naturally re-arms the reminder for the next cycle.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const WARN_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "sneakerfeature <noreply@snkrfeature.com>";
  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, message: "Service role not configured." }, { status: 400 });
  if (!resendKey) return NextResponse.json({ ok: false, message: "Email transport not configured." }, { status: 400 });

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const windowEnd = new Date(now + WARN_DAYS * DAY_MS).toISOString();
  const subscribeUrl = absoluteUrl("/subscribe");

  // Paid, non-permanent members whose pass expires within WARN_DAYS.
  const { data: rows, error } = await db
    .from("profiles")
    .select("id, email, username, subscription_tier, subscription_expires_at, subscription_is_permanent, renewal_reminded_at")
    .in("subscription_tier", ["pro", "max"])
    .eq("subscription_is_permanent", false)
    .not("subscription_expires_at", "is", null)
    .lte("subscription_expires_at", windowEnd)
    .gt("subscription_expires_at", nowIso)
    .limit(500);

  if (error) {
    console.error("[cron/renewal-reminders] query failed", error.message);
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  let sent = 0;
  for (const r of rows ?? []) {
    if (!r.email || !r.subscription_expires_at) continue;
    const expiresAt = new Date(r.subscription_expires_at).getTime();
    // Dedup: already reminded for THIS cycle (reminded within 7 days before expiry)?
    if (r.renewal_reminded_at && new Date(r.renewal_reminded_at).getTime() > expiresAt - 7 * DAY_MS) continue;

    const daysLeft = Math.max(1, Math.ceil((expiresAt - now) / DAY_MS));
    const { subject, html } = renderRenewalEmail({
      username: r.username ?? null,
      tier: r.subscription_tier ?? "pro",
      daysLeft,
      subscribeUrl
    });

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [r.email], subject, html })
      });
      if (res.ok) {
        sent++;
        await db.from("profiles").update({ renewal_reminded_at: nowIso }).eq("id", r.id);
      } else {
        console.warn("[cron/renewal-reminders] resend non-ok", res.status);
      }
    } catch (e) {
      console.warn("[cron/renewal-reminders] send failed", e);
    }
  }

  return NextResponse.json({ ok: true, candidates: rows?.length ?? 0, sent });
}
