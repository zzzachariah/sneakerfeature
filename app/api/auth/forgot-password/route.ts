import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyTurnstileToken } from "@/lib/turnstile";

const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  turnstileToken: z.string().min(1, "Please complete human verification.")
});

// Generic response — never reveal whether an account exists (no enumeration).
const GENERIC_OK = "If an account exists for that email, a reset link has been sent.";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const verified = await verifyTurnstileToken(parsed.data.turnstileToken);
  if (!verified.success) {
    return NextResponse.json({ ok: false, message: verified.message ?? "Human verification failed." }, { status: 400 });
  }

  // The recovery email is actually sent client-side via
  // supabase.auth.resetPasswordForEmail so the PKCE code-verifier is stored in the
  // requesting browser and the link can be completed there. This endpoint only
  // enforces Turnstile and returns a generic, non-enumerating response.
  return NextResponse.json({ ok: true, message: GENERIC_OK });
}
