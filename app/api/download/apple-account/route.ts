import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Returns the shared Apple ID credentials from environment variables so they
// are never baked into the client bundle. Set SHARED_APPLE_EMAIL and
// SHARED_APPLE_PASSWORD in your deployment environment (e.g. Vercel env vars).
export async function GET() {
  const email = process.env.SHARED_APPLE_EMAIL ?? "";
  const password = process.env.SHARED_APPLE_PASSWORD ?? "";
  return NextResponse.json(
    { email, password },
    {
      headers: {
        // Do not cache — credentials may be rotated at any time.
        "Cache-Control": "no-store",
      },
    }
  );
}
