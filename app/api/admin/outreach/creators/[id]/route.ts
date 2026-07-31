import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { STAGES } from "@/lib/outreach/types";

// Field edits for a single creator.
//
// Note what is NOT here: identity, positioning, partnership, wave, the three
// score inputs, sources and ref_code. Those change rarely and belong in a
// migration — and ref_code in particular is live in tracking URLs, where a
// typo silently breaks affiliate attribution rather than failing loudly.
//
// Writes go through requireAdminApi()'s session-scoped client, so RLS re-checks
// the caller is an admin on every statement.

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD.")
  .nullable();

const schema = z
  .object({
    stage: z.enum(STAGES).optional(),
    followed_up: z.boolean().optional(),
    first_sent: isoDate.optional(),
    reply_date: isoDate.optional(),
    last_touch: isoDate.optional(),
    outcome: z.string().max(2000).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
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
  const creatorId = Number(id);
  if (!Number.isInteger(creatorId)) {
    return NextResponse.json({ ok: false, message: "Invalid creator id." }, { status: 400 });
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
    .from("outreach_creators")
    .update(parsed.data)
    .eq("id", creatorId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[admin/outreach/creators] update failed", error);
    return NextResponse.json({ ok: false, message: "Update failed." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, message: "Creator not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
