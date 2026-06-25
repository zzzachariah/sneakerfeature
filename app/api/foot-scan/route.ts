import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getFootScanContext } from "@/lib/foot-scan/access";
import { analyzeFootScan } from "@/lib/foot-scan/analyze";
import { buildFootProfile, listScans, saveFootProfile, saveScan } from "@/lib/foot-scan/store";

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

// Device tilt captured at the shutter (degrees), per view. Optional + nullable —
// only the live in-app camera can supply it; picked/library photos send nothing.
const tilt = z
  .object({ beta: z.number().nullable(), gamma: z.number().nullable(), fovDeg: z.number().nullable() })
  .partial()
  .nullish();

const schema = z.object({
  primarySide: z.enum(["left", "right"]),
  footLengthMm: z.coerce.number().int().min(180).max(360),
  locale: z.string().max(10).optional(),
  images: z.object({
    top: dataUrl,
    oblique: dataUrl,
    side: dataUrl,
    top_other: dataUrl.nullish()
  }),
  tilt: z
    .object({ top: tilt, oblique: tilt, side: tilt, top_other: tilt })
    .partial()
    .nullish()
});

export async function POST(request: Request) {
  const t0 = Date.now();
  const ctx = await getFootScanContext();
  if (!ctx) {
    console.warn("[foot-scan] access denied (no context / not permitted)");
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.warn("[foot-scan] invalid JSON body", { userId: ctx.userId });
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.warn("[foot-scan] schema validation failed", {
      userId: ctx.userId,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
    });
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const { primarySide, footLengthMm, locale, images, tilt } = parsed.data;
  console.info("[foot-scan] request accepted", {
    userId: ctx.userId,
    primarySide,
    footLengthMm,
    locale: locale ?? null,
    hasTopOther: Boolean(images.top_other),
    imageBytes: {
      top: images.top.length,
      oblique: images.oblique.length,
      side: images.side.length,
      top_other: images.top_other?.length ?? 0
    }
  });

  // Recent scans (fetched BEFORE this one is saved) feed cross-session fusion:
  // the same foot is an unchanging quantity, so past width reads shrink variance.
  const prior = await listScans(ctx.userId, 5).catch(() => []);
  const priors = prior.map((s) => ({
    primarySide: s.result.primary.side,
    footLengthMm: s.result.primary.measurements.foot_length_mm,
    widthRatio: s.result.primary.measurements.width_ratio,
    widthConf: s.result.primary.confidence.width
  }));

  const outcome = await analyzeFootScan({
    primarySide,
    footLengthMm,
    locale,
    images: { top: images.top, oblique: images.oblique, side: images.side, top_other: images.top_other ?? null },
    tilt: tilt ?? null,
    priors
  });

  if (!outcome.ok) {
    console.error("[foot-scan] analysis failed", {
      userId: ctx.userId,
      durationMs: Date.now() - t0,
      error: outcome.error,
      detail: outcome.detail ?? null
    });
    return NextResponse.json({ ok: false, message: outcome.error, detail: outcome.detail }, { status: 502 });
  }

  // Store derived results (never the photos) for history; non-fatal if it fails.
  const scanId = await saveScan(ctx.userId, outcome.result);

  // Auto-promote to the player profile when the scan is actually usable —
  // skip on results that are about to trigger the "all photos unusable, please
  // retake" gate, so we don't overwrite a good prior profile with garbage.
  const usable =
    outcome.result.primary.measurements.width_ratio !== null &&
    outcome.result.needs_retake.length < 3;
  let profileSaved = false;
  if (usable) {
    const profile = buildFootProfile(outcome.result, new Date().toISOString());
    profileSaved = await saveFootProfile(ctx.userId, profile);
    if (profileSaved) revalidatePath("/", "layout");
  }

  console.info("[foot-scan] analysis ok", {
    userId: ctx.userId,
    durationMs: Date.now() - t0,
    scanId,
    profileSaved,
    usable,
    widthClass: outcome.result.primary.traits.width,
    widthRatio: outcome.result.primary.measurements.width_ratio,
    widthConf: outcome.result.primary.confidence.width
  });
  return NextResponse.json({ ok: true, result: outcome.result, scanId, profileSaved });
}
