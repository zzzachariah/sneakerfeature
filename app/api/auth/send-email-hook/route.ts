import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { renderAuthEmail } from "@/lib/email/auth-emails";

// Supabase Auth "Send Email" hook. When enabled, Supabase POSTs here instead of
// sending auth emails over SMTP; we render the branded template and send it via
// Resend's HTTP API (faster + more reliable than the synchronous SMTP path).
//
// Inert until you configure it: it only runs when Supabase is pointed at this
// endpoint AND the env vars below are set. See docs/send-email-hook.md.

export const runtime = "nodejs";

type EmailData = {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new?: string;
  token_hash_new?: string;
};

type HookPayload = {
  user: { email?: string };
  email_data: EmailData;
};

function hookError(httpCode: number, message: string) {
  // Shape Supabase Auth expects so the failure is logged clearly.
  return NextResponse.json({ error: { http_code: httpCode, message } }, { status: httpCode });
}

/**
 * Verify a Standard Webhooks signature (the scheme Supabase Auth hooks use).
 * Signed content is `${id}.${timestamp}.${body}`, HMAC-SHA256 with the decoded
 * secret, base64-encoded. The header may list several space-separated
 * `version,signature` entries.
 */
function verifySignature(secret: string, id: string, timestamp: string, signatureHeader: string, body: string): boolean {
  if (!id || !timestamp || !signatureHeader) return false;

  // Anti-replay: reject timestamps more than 5 minutes from now.
  const ts = Number(timestamp);
  if (Number.isFinite(ts)) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > 60 * 5) return false;
  }

  // Secret looks like "v1,whsec_<base64>"; the signing key is the base64 part.
  const marker = secret.indexOf("whsec_");
  const base64Key = marker >= 0 ? secret.slice(marker + "whsec_".length) : secret;
  const keyBytes = Buffer.from(base64Key, "base64");

  const expected = crypto.createHmac("sha256", keyBytes).update(`${id}.${timestamp}.${body}`).digest("base64");
  const expectedBuf = Buffer.from(expected);

  for (const part of signatureHeader.split(" ")) {
    const sig = part.includes(",") ? part.slice(part.indexOf(",") + 1) : part;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}

export async function POST(request: Request) {
  const hookSecret = process.env.SEND_EMAIL_HOOK_SECRET;
  const resendKey = process.env.RESEND_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const from = process.env.EMAIL_FROM || "sneakerfeature <noreply@snkrfeature.com>";

  if (!hookSecret || !resendKey || !supabaseUrl) {
    return hookError(500, "Email hook is not configured.");
  }

  const body = await request.text();
  const id = request.headers.get("webhook-id") ?? "";
  const timestamp = request.headers.get("webhook-timestamp") ?? "";
  const signature = request.headers.get("webhook-signature") ?? "";

  if (!verifySignature(hookSecret, id, timestamp, signature, body)) {
    return hookError(401, "Invalid webhook signature.");
  }

  let payload: HookPayload;
  try {
    payload = JSON.parse(body) as HookPayload;
  } catch {
    return hookError(400, "Invalid payload.");
  }

  const email = payload.user?.email;
  const data = payload.email_data;
  if (!email || !data?.email_action_type) {
    return hookError(400, "Missing recipient or action type.");
  }

  // Build the verify link (token-hash flow — works cross-device). Code-only flows
  // (reauthentication) have no link.
  let actionUrl = "";
  if (data.email_action_type !== "reauthentication" && data.token_hash) {
    const verify = new URL(`${supabaseUrl}/auth/v1/verify`);
    verify.searchParams.set("token", data.token_hash);
    verify.searchParams.set("type", data.email_action_type);
    if (data.redirect_to) verify.searchParams.set("redirect_to", data.redirect_to);
    actionUrl = verify.toString();
  }

  const { subject, html } = renderAuthEmail(data.email_action_type, { actionUrl, token: data.token });

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email], subject, html })
    });
  } catch {
    return hookError(502, "Could not reach the email provider.");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return hookError(502, `Email provider rejected the send (${res.status}). ${detail}`.trim());
  }

  return NextResponse.json({}, { status: 200 });
}
