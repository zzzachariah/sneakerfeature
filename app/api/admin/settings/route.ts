import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/auth";
import {
  getDailyCheckinCredits,
  isSmartPickerPublicEnabled,
  MAX_DAILY_CHECKIN_CREDITS,
  setDailyCheckinCredits,
  setSmartPickerPublicEnabled
} from "@/lib/admin/settings";

export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const [smartPickerPublic, dailyCheckinCredits] = await Promise.all([
    isSmartPickerPublicEnabled(),
    getDailyCheckinCredits()
  ]);
  return NextResponse.json({ ok: true, settings: { smartPickerPublic, dailyCheckinCredits } });
}

const schema = z
  .object({
    smartPickerPublic: z.boolean().optional(),
    dailyCheckinCredits: z.number().int().min(0).max(MAX_DAILY_CHECKIN_CREDITS).optional()
  })
  .refine(
    (v) => v.smartPickerPublic !== undefined || v.dailyCheckinCredits !== undefined,
    "Provide at least one setting to update."
  );

export async function POST(request: Request) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  try {
    if (parsed.data.smartPickerPublic !== undefined) {
      await setSmartPickerPublicEnabled(parsed.data.smartPickerPublic, ctx.userId);
    }
    if (parsed.data.dailyCheckinCredits !== undefined) {
      await setDailyCheckinCredits(parsed.data.dailyCheckinCredits, ctx.userId);
    }
    const [smartPickerPublic, dailyCheckinCredits] = await Promise.all([
      isSmartPickerPublicEnabled(),
      getDailyCheckinCredits()
    ]);
    return NextResponse.json({ ok: true, settings: { smartPickerPublic, dailyCheckinCredits } });
  } catch (e) {
    console.error("[admin/settings] update failed", e);
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Update failed." }, { status: 500 });
  }
}
