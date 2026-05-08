import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ratingFocusSchema } from "@/lib/validation/schemas";
import { isValidFocus } from "@/lib/star-rating";

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
  if (!supabase) {
    return NextResponse.json({ ok: true, focus: null });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: true, focus: null });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("rating_focus")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }

  const raw = data?.rating_focus;
  return NextResponse.json({ ok: true, focus: isValidFocus(raw) ? raw : null });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = ratingFocusSchema.safeParse(body);
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
    .from("profiles")
    .update({ rating_focus: parsed.data })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, focus: parsed.data, message: "Playstyle saved." });
}

export async function DELETE() {
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
    .from("profiles")
    .update({ rating_focus: null })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: "Playstyle cleared." });
}
