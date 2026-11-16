import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { allow, clientIp } from "@/lib/auth/rate-limit";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6,10}$/, "Enter the code from the email.")
});

// Verify the emailed one-time code. On success Supabase confirms the address
// and returns a session, which is written as the normal auth cookies — the
// person is signed in without re-typing their password.
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const { email, code } = parsed.data;

  // Brute-force guard: 10 tries per email and 30 per IP every 15 minutes.
  if (!allow(`verify:e:${email}`, 10, 15 * 60_000) || !allow(`verify:ip:${clientIp(request)}`, 30, 15 * 60_000)) {
    return NextResponse.json({ ok: false, message: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ ok: false, message: "Service unavailable." }, { status: 503 });

  const cookieStore = await cookies();
  const pending: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list: typeof pending) => {
        pending.push(...list);
      }
    }
  });

  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.session) {
    return NextResponse.json({ ok: false, message: "That code is incorrect or has expired." }, { status: 400 });
  }

  const response = NextResponse.json({
    ok: true,
    message: "Email verified.",
    session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token }
  });
  pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
