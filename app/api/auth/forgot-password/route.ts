import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyTurnstileToken } from "@/lib/turnstile";

const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  verificationToken: z.string().min(1, "Please complete human verification.")
});

// Generic response — never reveal whether an account exists (no enumeration).
const GENERIC_OK = "If an account exists for that email, a reset link has been sent.";

/**
 * POST /api/auth/forgot-password
 *
 * PURPOSE: CAPTCHA gate only — not a full server-side password-reset trigger.
 *
 * Architecture note: the actual recovery email is sent client-side via
 * `supabase.auth.resetPasswordForEmail()` so that the PKCE code-verifier is
 * created and stored in the requesting browser (required for the reset link to
 * be redeemable in that same browser session). This route's sole responsibility
 * is to verify the Turnstile CAPTCHA before the client proceeds with the SDK
 * call. It returns a generic, account-non-enumerating response regardless of
 * whether an account exists for the submitted email.
 *
 * Security requirement: TURNSTILE_SECRET_KEY must be set in the environment;
 * without it `verifyTurnstileToken` will throw and all requests will be blocked.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const verified = await verifyTurnstileToken(parsed.data.verificationToken);
  if (!verified.success) {
    return NextResponse.json({ ok: false, message: verified.message ?? "Human verification failed." }, { status: 400 });
  }

  // The recovery email is actually sent client-side via
  // supabase.auth.resetPasswordForEmail so the PKCE code-verifier is stored in the
  // requesting browser and the link can be completed there. This endpoint only
  // enforces human verification and returns a generic, non-enumerating response.
  return NextResponse.json({ ok: true, message: GENERIC_OK });
}
