import { NextResponse } from "next/server";
import { getModelCatalog } from "@/lib/ai/model-catalog-server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await getModelCatalog(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Model configuration unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
