import { NextResponse } from "next/server";
import { z } from "zod";
import { issueHumanToken, VERIFY_ACTIONS } from "@/lib/human-verify";

// Behavioural signals from the slide-to-verify widget. We don't trust them as
// proof of humanity on their own (a determined bot can fake them), but they
// cheaply stop trivial scripted submissions, and the issued token is the only
// thing the protected routes accept.
const schema = z.object({
  action: z.enum(VERIFY_ACTIONS),
  dragMs: z.number().nonnegative(),
  distanceRatio: z.number().min(0).max(1.5),
  moves: z.number().int().nonnegative()
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid verification request." }, { status: 400 });
  }

  const { action, dragMs, distanceRatio, moves } = parsed.data;

  // Must have slid (almost) all the way, taken a human-plausible amount of time,
  // and produced several pointer steps rather than a single instant jump.
  const looksHuman = distanceRatio >= 0.96 && dragMs >= 180 && dragMs <= 120_000 && moves >= 5;
  if (!looksHuman) {
    return NextResponse.json({ ok: false, message: "Verification failed. Please slide again." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, token: issueHumanToken(action) });
}
