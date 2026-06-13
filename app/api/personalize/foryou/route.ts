import { NextResponse } from "next/server";
import { getForYouData } from "@/lib/personalize/for-you-data";

// Per-user For You payload for the home landing overlay. Kept as its own
// endpoint so the home page itself can stay statically cached.
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getForYouData();
  return NextResponse.json(data);
}
