import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { purgeUserFiles } from "@/lib/account/purge-user-files";

// Permanently deletes the signed-in user's account (App Store Review Guideline
// 5.1.1(v)). Deleting the auth user cascades to the profile and every
// user-owned row — comments, votes, submissions, saved comparisons, foot scans,
// push tokens, … — via the ON DELETE CASCADE foreign keys in db/migrations.
// Uploaded files are removed first (storage does not cascade). Payment records
// are retained for accounting/disputes with user_id set to NULL
// (20261116122000_account_deletion_retention.sql).
export async function POST(request: Request) {
  let password = "";
  let verificationToken: string | undefined;
  try {
    const body = await request.json();
    password = typeof body?.password === "string" ? body.password : "";
    verificationToken = typeof body?.verificationToken === "string" ? body.verificationToken : undefined;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  if (!password || password.length > 1000) {
    return NextResponse.json(
      { ok: false, message: "Enter your password to confirm account deletion." },
      { status: 400 }
    );
  }

  const verified = await verifyTurnstileToken(verificationToken);
  if (!verified.success) {
    return NextResponse.json({ ok: false, message: verified.message ?? "Verification not completed." }, { status: 400 });
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.id || !user.email) {
    return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });
  }

  // Re-authenticate with the supplied password so deletion can't be triggered
  // from a hijacked session and can't happen by accident.
  const verifyClient = createSupabaseClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { error: verifyError } = await verifyClient.auth.signInWithPassword({
    email: user.email,
    password
  });

  if (verifyError) {
    return NextResponse.json({ ok: false, message: "Password is incorrect." }, { status: 400 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({ ok: false, message: "Service role key is not configured." }, { status: 400 });
  }

  try {
    await purgeUserFiles(adminClient, user.id);
  } catch (err) {
    // Don't strand the user with an undeletable account over a storage hiccup;
    // log so the leftovers can be cleaned up.
    console.error("[delete-account] file purge failed", user.id, (err as Error).message);
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("[delete-account] delete failed", user.id, deleteError.message);
    return NextResponse.json({ ok: false, message: "Could not delete your account. Please contact support." }, { status: 500 });
  }

  // Best-effort: clear the now-orphaned session cookies on the server too. The
  // client signs out and redirects after a successful response.
  try {
    await supabase.auth.signOut();
  } catch {
    /* session is already invalid once the user is deleted */
  }

  return NextResponse.json({ ok: true, message: "Your account has been permanently deleted." });
}
