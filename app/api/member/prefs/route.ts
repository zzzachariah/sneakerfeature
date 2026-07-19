import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/data/auth";
import { getMemberContext, saveMemberPrefs } from "@/lib/subscription/entitlements";
import { isMaxExclusiveSkin } from "@/lib/subscription/skins";
import { MODEL_IDS, tierSupportsModel, type ModelId } from "@/lib/subscription/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Member UI prefs: chosen skin, default model preference, home-section order,
// menu customization. Personalization is a paid-tier perk, so free members are
// refused (admins always allowed, for testing).
const schema = z.object({
  skin: z.enum(["sapphire", "aurora", "obsidian", "champion"]).optional(),
  modelPref: z.enum(["base", "premium"]).optional(),
  // Explicit Smart Picker model; null clears back to the tier default.
  modelId: z.enum(Object.values(MODEL_IDS) as [ModelId, ...ModelId[]]).nullable().optional(),
  homeOrder: z.array(z.string().max(64)).max(40).optional(),
  menu: z.array(z.string().max(64)).max(40).optional(),
  // Max-only "Signature" accent. Six-digit hex, or null to clear.
  customAccent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional()
});

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ ok: false, message: "Sign in required." }, { status: 401 });

  const member = await getMemberContext(profile.id);

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

  const patch = { ...parsed.data };

  // The Smart Picker model choice is open to EVERY tier — the picker grays out
  // unsupported models and the server drops them below. Everything else stays a
  // paid personalization perk (admins always allowed, for testing).
  const modelKeys = new Set(["modelId", "modelPref"]);
  const modelOnly = Object.keys(patch).every((k) => modelKeys.has(k));
  const canPersonalize = profile.role === "admin" || member.config.capabilities.personalization;
  if (!canPersonalize && !modelOnly) {
    return NextResponse.json({ ok: false, message: "个性化是 Pro / Max 会员专属。" }, { status: 403 });
  }

  // A custom "Signature" accent is a Max-only perk — silently drop it for Pro so
  // a crafted request can't grant it. Admins may set it for testing.
  const isMax = member.tier === "max" || profile.role === "admin";
  if (patch.customAccent !== undefined && !isMax) {
    delete patch.customAccent;
  }
  // Max-exclusive / limited skins can't be applied by Pro members.
  if (patch.skin !== undefined && isMaxExclusiveSkin(patch.skin) && !isMax) {
    delete patch.skin;
  }
  // A model the member's plan can't run is silently dropped (crafted request or
  // stale client after a downgrade) — mirror the skin drop above.
  if (patch.modelId != null && profile.role !== "admin" && !tierSupportsModel(member.tier, patch.modelId)) {
    delete patch.modelId;
  }

  try {
    const prefs = await saveMemberPrefs(profile.id, patch);
    return NextResponse.json({ ok: true, prefs });
  } catch (error) {
    console.error("[member/prefs] save failed", error);
    return NextResponse.json({ ok: false, message: "Failed to save preferences." }, { status: 500 });
  }
}
