import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ratingDeleteSchema, ratingUpsertSchema } from "@/lib/validation/schemas";

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shoeId = searchParams.get("shoeId");
  if (!shoeId) {
    return NextResponse.json({ ok: false, message: "shoeId is required." }, { status: 400 });
  }

  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: true, avg: null, count: 0, myRating: null });
  }

  const { data: rows, error } = await supabase
    .from("shoe_ratings")
    .select("rating, user_id")
    .eq("shoe_id", shoeId);

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

  const all = rows ?? [];
  const sum = all.reduce((s, r) => s + Number(r.rating), 0);
  const avg = all.length ? sum / all.length : null;

  const {
    data: { user }
  } = await supabase.auth.getUser();
  const myRating = user
    ? (all.find((r) => r.user_id === user.id)?.rating as number | undefined) ?? null
    : null;

  return NextResponse.json({ ok: true, avg, count: all.length, myRating });
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

  const { data: existing, error: existingError } = await supabase
    .from("shoe_ratings")
    .select("id")
    .eq("shoe_id", parsed.data.shoeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ ok: false, message: existingError.message }, { status: 400 });
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from("shoe_ratings")
      .update({ rating: parsed.data.rating, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (updateError) {
      return NextResponse.json({ ok: false, message: updateError.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Rating updated." });
  }

  const { error: insertError } = await supabase.from("shoe_ratings").insert({
    shoe_id: parsed.data.shoeId,
    user_id: user.id,
    rating: parsed.data.rating
  });

  if (insertError) {
    return NextResponse.json({ ok: false, message: insertError.message }, { status: 400 });
  }

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

  return NextResponse.json({ ok: true, message: "Rating cleared." });
}
