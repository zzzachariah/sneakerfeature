import { NextResponse } from "next/server";
import { getPublicShoes } from "@/lib/data/shoes";
import { buildOnboardingCatalog } from "@/lib/onboarding/server-catalog";
import { getWallPopularity } from "@/lib/onboarding/server-wall-popularity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [shoes, popularity] = await Promise.all([getPublicShoes(), getWallPopularity()]);
    return NextResponse.json(buildOnboardingCatalog(shoes, 25, Math.random, popularity), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return NextResponse.json({ shoes: [], shoeCount: null, brandCount: null }, { status: 503 });
  }
}
