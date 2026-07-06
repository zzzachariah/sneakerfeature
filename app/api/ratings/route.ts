import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { ratingDeleteSchema, ratingUpsertSchema } from "@/lib/validation/schemas";
import { DIM_KEYS, type DimKey } from "@/lib/star-rating";

async function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // no-op in route handler
      }
    }
  });
}

function invalidateRatingViews() {
  revalidateTag("shoes");
  revalidatePath("/", "layout");
}

type DimRow = Record<DimKey, number | string | null> & { user_id?: string };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shoeId = searchParams.get("shoeId");
  if (!shoeId) {
    return NextResponse.json({ ok: false, message: "shoeId is required." }, { status: 400 });
  }

  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: true, count: 0, dimAvgs: null, myDimRatings: null });
  }

  const { data: rows, error } = await supabase
    .from("shoe_ratings")
    .select("user_id, cushioning_feel, court_feel, bounce, stability, traction, fit")
    .eq("shoe_id", shoeId);

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

  const all = (rows ?? []) as DimRow[];
  const count = all.length;
  const dimAvgs: Partial<Record<DimKey, number>> | null =
    count > 0 ? Object.fromEntries(DIM_KEYS.map((k) => [k, 0])) : null;
  if (dimAvgs) {
    for (const r of all) {
      for (const k of DIM_KEYS) dimAvgs[k] = (dimAvgs[k] ?? 0) + Number(r[k] ?? 0);
    }
    for (const k of DIM_KEYS) dimAvgs[k] = (dimAvgs[k] ?? 0) / count;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  let myDimRatings: Partial<Record<DimKey, number>> | null = null;
  if (user) {
    const own = all.find((r) => r.user_id === user.id);
    if (own) {
      myDimRatings = {};
      for (const k of DIM_KEYS) myDimRatings[k] = Number(own[k] ?? 0);
    }
  }

  const isPersonal = myDimRatings !== null;
  // Mutations call revalidateTag/revalidatePath, which only touch Next's data
  // cache — they cannot purge this route's own CDN s-maxage. Keep the window
  // short so a fresh rating shows up quickly for viewers who haven't rated
  // (raters get the no-store path and always see live aggregates).
  const cacheHeader = isPersonal
    ? "private, no-store"
    : "public, s-maxage=15, stale-while-revalidate=30";

  return NextResponse.json(
    { ok: true, count, dimAvgs, myDimRatings },
    { headers: { "Cache-Control": cacheHeader } }
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = ratingUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });
  }

  const payload = {
    cushioning_feel: parsed.data.cushioning_feel,
    court_feel: parsed.data.court_feel,
    bounce: parsed.data.bounce,
    stability: parsed.data.stability,
    traction: parsed.data.traction,
    fit: parsed.data.fit
  };

  // Single atomic upsert keyed on the (shoe_id, user_id) unique constraint.
  // The previous select-then-insert path let two near-simultaneous submissions
  // from the same user both miss the existing row and race into a raw unique
  // violation surfaced to the client.
  const { error: upsertError } = await supabase.from("shoe_ratings").upsert(
    {
      shoe_id: parsed.data.shoeId,
      user_id: user.id,
      ...payload,
      updated_at: new Date().toISOString()
    },
    { onConflict: "shoe_id,user_id" }
  );

  if (upsertError) {
    return NextResponse.json({ ok: false, message: "Could not save rating." }, { status: 400 });
  }

  invalidateRatingViews();
  return NextResponse.json({ ok: true, message: "Rating saved." });
}

export async function DELETE(request: Request) {
  const body = await request.json();
  const parsed = ratingDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });
  }

  const { error } = await supabase
    .from("shoe_ratings")
    .delete()
    .eq("shoe_id", parsed.data.shoeId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

  invalidateRatingViews();
  return NextResponse.json({ ok: true, message: "Rating cleared." });
}
