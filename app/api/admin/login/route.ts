import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(8),
  verificationToken: z.string().min(1, "Please complete human verification.")
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const verified = await verifyTurnstileToken(parsed.data.verificationToken);
  if (!verified.success) {
    return NextResponse.json({ ok: false, message: verified.message ?? "Verification failed." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ ok: false, message: "Supabase is not configured." }, { status: 500 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({ ok: false, message: "Server configuration incomplete." }, { status: 500 });
  }

  let email = parsed.data.identifier;
  if (!email.includes("@")) {
    const { data: profile } = await adminClient.from("profiles").select("email, role").eq("username", email).maybeSingle();
    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ ok: false, message: "No such admin account." }, { status: 403 });
    }
    email = profile.email;
  }

  const cookieStore = await cookies();
  // Temporary holder for cookies set by Supabase during sign-in
  const tempCookies: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        cookiesToSet.forEach((c) => tempCookies.push(c));
      }
    }
  });

  const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error || !signInData.user) {
    return NextResponse.json({ ok: false, message: "Invalid admin credentials." }, { status: 401 });
  }

  const { data: profile } = await adminClient.from("profiles").select("username, role").eq("id", signInData.user.id).maybeSingle();
  if (!profile || profile.role !== "admin") {
    await supabase.auth.signOut();
    // Return a fresh response with NO cookies so no session leaks to the client
    return NextResponse.json({ ok: false, message: "No such admin account." }, { status: 403 });
  }

  await adminClient.from("admin_audit_logs").insert({
    actor_admin_id: signInData.user.id,
    target_type: "admin_session",
    action: "admin_login",
    note: "Admin login via role-checked Supabase session"
  });

  // Role confirmed — now build the success response and attach auth cookies
  const finalResponse = NextResponse.json({
    ok: true,
    message: "Admin login successful.",
    username: profile.username
  });

  tempCookies.forEach(({ name, value, options }) => finalResponse.cookies.set(name, value, options));
  return finalResponse;
}
