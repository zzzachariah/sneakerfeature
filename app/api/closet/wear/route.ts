import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { closetWearSchema } from "@/lib/validation/schemas";

// Wear logging for the shoe closet. Each POST records one on-court session and
// bumps the denormalized totals on the closet row (read-modify-write is fine
// here — it's a personal closet, the user is the only writer).

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

export async function GET() {
  const supabase = await getSupabase();
  if (!supabase) return NextResponse.json({ ok: true, logs: [] });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: true, logs: [] });

  const { data, error } = await supabase
    .from("closet_wear_logs")
    .select("id, shoe_id, hours, note, played_at, created_at")
    .eq("user_id", user.id)
    .order("played_at", { ascending: false })
    .limit(400);

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, logs: data ?? [] });
}

export async function POST(request: Request) {
  const parsed = closetWearSchema.safeParse(await request.json());
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

  const { shoeId, hours, note, playedAt } = parsed.data;

  // The composite FK requires the closet row; check first for a clean 404.
  const { data: item } = await supabase
    .from("shoe_closet")
    .select("play_hours, sessions")
    .eq("user_id", user.id)
    .eq("shoe_id", shoeId)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ ok: false, message: "This shoe is not in your closet." }, { status: 404 });
  }

  const { data: log, error: logError } = await supabase
    .from("closet_wear_logs")
    .insert({
      user_id: user.id,
      shoe_id: shoeId,
      hours,
      note: note?.trim() || null,
      played_at: playedAt ?? undefined
    })
    .select("id, shoe_id, hours, note, played_at, created_at")
    .maybeSingle();
  if (logError) {
    return NextResponse.json({ ok: false, message: logError.message }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("shoe_closet")
    .update({
      play_hours: Number(item.play_hours) + hours,
      sessions: item.sessions + 1,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", user.id)
    .eq("shoe_id", shoeId)
    .select("shoe_id, size_label, purchase_price, purchased_at, play_hours, sessions, retired, retired_at, created_at")
    .maybeSingle();
  if (updateError) {
    return NextResponse.json({ ok: false, message: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, log, item: updated });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id || id.length > 64) {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
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

  // Fetch the log first so the closet totals can be rolled back consistently.
  const { data: log } = await supabase
    .from("closet_wear_logs")
    .select("id, shoe_id, hours")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();
  if (!log) return NextResponse.json({ ok: true });

  const { error: deleteError } = await supabase
    .from("closet_wear_logs")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id);
  if (deleteError) {
    return NextResponse.json({ ok: false, message: deleteError.message }, { status: 400 });
  }

  const { data: item } = await supabase
    .from("shoe_closet")
    .select("play_hours, sessions")
    .eq("user_id", user.id)
    .eq("shoe_id", log.shoe_id)
    .maybeSingle();
  if (item) {
    await supabase
      .from("shoe_closet")
      .update({
        play_hours: Math.max(0, Number(item.play_hours) - Number(log.hours)),
        sessions: Math.max(0, item.sessions - 1),
        updated_at: new Date().toISOString()
      })
      .eq("user_id", user.id)
      .eq("shoe_id", log.shoe_id);
  }

  return NextResponse.json({ ok: true });
}
