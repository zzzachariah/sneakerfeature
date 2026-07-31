import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { CHANNEL_STATUSES } from "@/lib/outreach/types";

// Growth-channel edits: status plus the four hand-typed stat columns. The
// prose (first_action, why, expected) is fixed in the migration — it is the
// plan, not a field.

const schema = z
  .object({
    status: z.enum(CHANNEL_STATUSES).optional(),
    clicks: z.number().int().min(0).max(10_000_000).optional(),
    registrations: z.number().int().min(0).max(10_000_000).optional(),
    paid_count: z.number().int().min(0).max(10_000_000).optional(),
    revenue_usd: z.number().min(0).max(100_000_000).optional()
  })
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update.");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;

  const { id } = await params;
  if (!/^C\d+$/.test(id)) {
    return NextResponse.json({ ok: false, message: "Invalid channel id." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase
    .from("outreach_channels")
    .update(parsed.data)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[admin/outreach/channels] update failed", error);
    return NextResponse.json({ ok: false, message: "Update failed." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, message: "Channel not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
