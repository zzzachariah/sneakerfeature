import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/auth";
import { upsertShoeFit } from "@/lib/data/shoe-fit";

// Admin saves a shoe's structured fit data (the smart-sizing backbone). Can be
// authored by hand or after reviewing an AI prefill.
const schema = z.object({
  length_bias: z.enum(["runs_small", "true_to_size", "runs_large"]),
  adjust_half_sizes: z.number().int().min(0).max(4),
  width_fit: z.enum(["narrow", "standard", "wide"]),
  volume: z.enum(["low", "medium", "high"]),
  notes: z.string().max(2000).nullable().optional(),
  notes_zh: z.string().max(2000).nullable().optional(),
  confidence: z.enum(["low", "medium", "high"]),
  source: z.enum(["admin", "ai", "community"]).optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  const { id } = await params;

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
    await upsertShoeFit(
      id,
      {
        length_bias: parsed.data.length_bias,
        adjust_half_sizes: parsed.data.adjust_half_sizes,
        width_fit: parsed.data.width_fit,
        volume: parsed.data.volume,
        notes: parsed.data.notes ?? null,
        notes_zh: parsed.data.notes_zh ?? null,
        confidence: parsed.data.confidence,
        source: parsed.data.source ?? "admin"
      },
      ctx.userId
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/shoes/fit] save failed", error);
    return NextResponse.json({ ok: false, message: "Failed to save fit data." }, { status: 500 });
  }
}
