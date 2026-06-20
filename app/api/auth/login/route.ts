import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { authSchema } from "@/lib/validation/schemas";
import { verifyTurnstileToken } from "@/lib/turnstile";

const AUTH_TIMEOUT_MS = 10000;

function devLog(step: string, payload?: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.info("[login-api]", step, payload ?? "");
  }
}

async function withTimeout<T>(promiseLike: PromiseLike<T>, ms = AUTH_TIMEOUT_MS): Promise<T> {
  return await Promise.race([
    Promise.resolve(promiseLike),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ]);
}

export async function POST(request: Request) {
  try {
    devLog("request received");
    const body = await request.json();
    const parsed = authSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });

    const verified = await verifyTurnstileToken(parsed.data.verificationToken);
    devLog("human verification done", verified);
    if (!verified.success) return NextResponse.json({ ok: false, message: verified.message ?? "Verification not completed." }, { status: 400 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return NextResponse.json({ ok: true, message: "Demo mode: login successful." });

    let email = parsed.data.identifier;
    const admin = createAdminClient();

    if (!email.includes("@")) {
      if (!admin) return NextResponse.json({ ok: false, message: "Server configuration incomplete." }, { status: 500 });
      const profile = await withTimeout<{ data: { email?: string } | null }>(admin.from("profiles").select("email").eq("username", parsed.data.identifier).maybeSingle());
      if (!profile.data?.email) return NextResponse.json({ ok: false, message: "No account found for that username." }, { status: 404 });
      email = profile.data.email;
    }

    const cookieStore = await cookies();
    const response = NextResponse.json({ ok: true, message: "Login successful.", resolved_email: email });

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    });

    devLog("about to create server session");
    const { data: signInData, error } = await withTimeout(supabase.auth.signInWithPassword({ email, password: parsed.data.password }));
    devLog("server session result", error ? { error: error.message } : { ok: true });

    if (error) {
      if (error.message.toLowerCase().includes("invalid login credentials")) {
        return NextResponse.json({ ok: false, message: "Incorrect password. Please try again." }, { status: 401 });
      }
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    const sessionPayload = signInData.session
      ? {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token
        }
      : null;

    const finalResponse = NextResponse.json({ ok: true, message: "Login successful.", resolved_email: email, session: sessionPayload });
    response.cookies.getAll().forEach((cookie) => {
      finalResponse.cookies.set(cookie);
    });

    devLog("response returned", { ok: true, resolved_email: email, hasSession: Boolean(sessionPayload) });
    return finalResponse;
  } catch (error) {
    devLog("route failed", error);
    return NextResponse.json({ ok: false, message: "Login request timed out or failed. Please try again." }, { status: 500 });
  }
}
