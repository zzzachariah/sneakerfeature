import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { z } from "zod";

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1000),
  newPassword: z.string().min(8).max(1000),
  confirmPassword: z.string().min(1).max(1000),
  verificationToken: z.string().min(1),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = updatePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const { currentPassword, newPassword, confirmPassword, verificationToken } = parsed.data;

  const verified = await verifyTurnstileToken(verificationToken);
  if (!verified.success) {
    return NextResponse.json({ ok: false, message: verified.message ?? "Verification not completed." }, { status: 400 });
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json({ ok: false, message: "New password and confirmation must match." }, { status: 400 });
  }

  const supabase = await createServerClient();
  if (!supabase) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.id || !user.email) {
    return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });

  const verifyClient = createSupabaseClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { error: verifyError } = await verifyClient.auth.signInWithPassword({
    email: user.email,
    password: currentPassword
  });

  if (verifyError) {
    return NextResponse.json({ ok: false, message: "Current password is incorrect." }, { status: 400 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) return NextResponse.json({ ok: false, message: "Service role key is not configured." }, { status: 400 });

  const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
    password: newPassword
  });

  if (updateError) {
    return NextResponse.json({ ok: false, message: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: "Password updated successfully." });
}
