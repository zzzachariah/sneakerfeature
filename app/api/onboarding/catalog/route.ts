import { NextResponse } from "next/server";
import { getPublicShoes } from "@/lib/data/shoes";
import { buildOnboardingCatalog } from "@/lib/onboarding/server-catalog";

export async function GET() {
  try {
    const shoes = await getPublicShoes();
    return NextResponse.json(buildOnboardingCatalog(shoes), {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" }
    });
  } catch {
    return NextResponse.json({ shoes: [], shoeCount: null, brandCount: null }, { status: 503 });
  }
}
