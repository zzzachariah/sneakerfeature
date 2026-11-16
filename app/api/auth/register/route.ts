import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { resendConfigured } from "@/lib/email/resend";
import { startSignup } from "@/lib/auth/email-verification";

const registerSchema = z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters.").max(32, "Username must be 32 characters or fewer."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(256),
  verificationToken: z.string().min(1, "Please complete human verification."),
  next: z.string().max(512).optional()
});

// The SAME response whether the email is new or already registered, so signup
// cannot be used to discover who has an account. An existing owner receives a
// "you already have an account" notice instead of a code.
const CHECK_EMAIL = {
  ok: true,
  verificationRequired: true,
  message: "Check your email for a verification code."
};

function safeNext(next: string | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  // Check server configuration BEFORE spending the single-use Turnstile token,
  // so a misconfigured deploy is reported clearly instead of as a failed check.
  const admin = createAdminClient();
  if (!admin || !resendConfigured()) {
    console.error("[register] unavailable:", !admin ? "SUPABASE_SERVICE_ROLE_KEY missing" : "RESEND_API_KEY missing");
    return NextResponse.json(
      {
        ok: false,
        code: "registration_unavailable",
        message: "Registration is temporarily unavailable. Please try again later."
      },
      { status: 503 }
    );
  }

  const verified = await verifyTurnstileToken(parsed.data.verificationToken);
  if (!verified.success) return NextResponse.json({ ok: false, message: verified.message }, { status: 400 });

  const { username, email, password } = parsed.data;

  // Usernames are public (shown on comments), so reporting a clash leaks nothing new.
  const { data: taken } = await admin.from("profiles").select("id, email").eq("username", username).maybeSingle();
  if (taken && taken.email?.toLowerCase() !== email) {
    return NextResponse.json({ ok: false, message: "That username is already taken." }, { status: 409 });
  }

  const result = await startSignup(admin, { email, password, username, next: safeNext(parsed.data.next) });
  if (result.status === "error") {
    console.error("[register] start signup failed", result.message);
    return NextResponse.json(
      { ok: false, message: "Could not start signup. Please try again." },
      { status: 500 }
    );
  }
  if (result.status === "existing_verified") return NextResponse.json(CHECK_EMAIL);

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: result.userId, username, email, role: "user" }, { onConflict: "id" });
  if (profileError) {
    console.error("[register] profile upsert failed", profileError.message);
    // The auth user is unconfirmed and unusable; drop it so a retry starts clean.
    await admin.auth.admin.deleteUser(result.userId);
    return NextResponse.json({ ok: false, message: "Could not start signup. Please try again." }, { status: 500 });
  }

  return NextResponse.json(CHECK_EMAIL);
}
