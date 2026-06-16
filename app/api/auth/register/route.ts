import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHumanToken } from "@/lib/human-verify";

const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters."),
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  verificationToken: z.string().min(1, "Please complete human verification.")
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const AUTH_TIMEOUT_MS = 10000;

function devLog(step: string, payload?: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[{}] ${step}`.replace("{}","signup-api"), payload ?? "");
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
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });
    }

    const verified = verifyHumanToken(parsed.data.verificationToken, "register");
    devLog("human verification done", verified);
    if (!verified.success) return NextResponse.json({ ok: false, message: verified.message }, { status: 400 });

    const supabase = createAdminClient();
    if (!supabase) return NextResponse.json({ ok: true, message: "Demo mode: account created." });

    const usernameTaken = await withTimeout<{ data: { id?: string } | null }>(supabase.from("profiles").select("id").eq("username", parsed.data.username).maybeSingle());
    if (usernameTaken.data) return NextResponse.json({ ok: false, message: "That username is already taken." }, { status: 409 });

    const { data, error } = await withTimeout(supabase.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { username: parsed.data.username }
    }));

    if (error || !data.user) {
      return NextResponse.json({ ok: false, message: error?.message ?? "Could not create account." }, { status: 400 });
    }

    let profileError: { message: string } | null = null;
    for (let i = 0; i < 3; i++) {
      const res = await withTimeout<{ error: { message: string } | null }>(supabase.from("profiles").upsert(
        { id: data.user.id, username: parsed.data.username, email: parsed.data.email, role: "user" },
        { onConflict: "id" }
      ));
      profileError = res.error as { message: string } | null;
      if (!profileError) break;
      await wait(150 * (i + 1));
    }

    if (profileError) {
      return NextResponse.json({ ok: false, message: `Account created but profile setup failed: ${profileError.message}` }, { status: 500 });
    }

    devLog("response returned", { ok: true, user: parsed.data.email });
    return NextResponse.json({ ok: true, message: "Registration successful. You can now sign in." });
  } catch (error) {
    devLog("route failed", error);
    return NextResponse.json({ ok: false, message: "Signup request timed out or failed. Please try again." }, { status: 500 });
  }
}
