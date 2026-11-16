import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resendVerification } from "@/lib/auth/email-verification";
import { allow, clientIp } from "@/lib/auth/rate-limit";

const schema = z.object({ email: z.string().trim().toLowerCase().email(), next: z.string().max(512).optional() });
const GENERIC = { ok: true, message: "If that account still needs verifying, a new code is on its way." };

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Enter a valid email address." }, { status: 400 });
  const { email } = parsed.data;

  // One send per email per minute, 5 per hour; 20 per IP per hour.
  if (
    !allow(`resend:min:${email}`, 1, 60_000) ||
    !allow(`resend:hr:${email}`, 5, 60 * 60_000) ||
    !allow(`resend:ip:${clientIp(request)}`, 20, 60 * 60_000)
  ) {
    return NextResponse.json({ ok: false, message: "Please wait a minute before requesting another code." }, { status: 429 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, message: "Service unavailable." }, { status: 503 });

  const next = parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : null;
  await resendVerification(admin, email, next);
  return NextResponse.json(GENERIC);
}
