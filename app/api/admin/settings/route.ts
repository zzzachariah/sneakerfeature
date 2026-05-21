import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/auth";
import { isSmartPickerPublicEnabled, setSmartPickerPublicEnabled } from "@/lib/admin/settings";

export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const smartPickerPublic = await isSmartPickerPublicEnabled();
  return NextResponse.json({ ok: true, settings: { smartPickerPublic } });
}

const schema = z.object({
  smartPickerPublic: z.boolean()
});

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
    await setSmartPickerPublicEnabled(parsed.data.smartPickerPublic, ctx.userId);
    return NextResponse.json({ ok: true, settings: { smartPickerPublic: parsed.data.smartPickerPublic } });
  } catch (e) {
    console.error("[admin/settings] update failed", e);
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Update failed." }, { status: 500 });
  }
}
