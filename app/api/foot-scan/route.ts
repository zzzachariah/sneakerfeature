import { NextResponse } from "next/server";
import { z } from "zod";
import { getFootScanContext } from "@/lib/foot-scan/access";
import { analyzeFootScan } from "@/lib/foot-scan/analyze";
import { saveScan } from "@/lib/foot-scan/store";

// Node runtime (OpenAI SDK + Supabase admin); never cached — per-user and
// side-effecting.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A captured frame, downscaled client-side, sent as a JPEG/PNG data URL.
const dataUrl = z
  .string()
  .min(32)
  .max(8_000_000)
  .regex(/^data:image\/(jpeg|jpg|png|webp);base64,/, "Expected an image data URL.");

const schema = z.object({
  primarySide: z.enum(["left", "right"]),
  footLengthMm: z.coerce.number().int().min(180).max(360),
  images: z.object({
    top: dataUrl,
    oblique: dataUrl,
    side: dataUrl,
    top_other: dataUrl.nullish()
  })
});

export async function POST(request: Request) {
  const ctx = await getFootScanContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

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

  const { primarySide, footLengthMm, images } = parsed.data;
  const outcome = await analyzeFootScan({
    primarySide,
    footLengthMm,
    images: { top: images.top, oblique: images.oblique, side: images.side, top_other: images.top_other ?? null }
  });

  if (!outcome.ok) {
    return NextResponse.json({ ok: false, message: outcome.error, detail: outcome.detail }, { status: 502 });
  }

  // Store derived results (never the photos) for history; non-fatal if it fails.
  const scanId = await saveScan(ctx.userId, outcome.result);
  return NextResponse.json({ ok: true, result: outcome.result, scanId });
}
