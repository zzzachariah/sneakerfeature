import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { VERIFY_LINK_TYPES, type VerifyLinkType } from "@/lib/auth/email-verification";

export const dynamic = "force-dynamic";

function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/dashboard";
  return next;
}

// One-tap link from the verification email. Confirms the address, signs the
// person in on THIS device, and redirects into the app.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as VerifyLinkType | null;
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  const failure = new URL("/login", request.url);
  failure.searchParams.set("verify", "failed");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!tokenHash || !type || !VERIFY_LINK_TYPES.has(type) || !url || !anon) {
    return NextResponse.redirect(failure);
  }

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

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return NextResponse.redirect(failure);

  const response = NextResponse.redirect(new URL(next, request.url));
  pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  // The URL carried a one-time token; don't leak it via Referer from the next page.
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
