import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

function readShoeId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as { shoeId?: unknown }).shoeId;
  return typeof id === "string" && id.length > 0 && id.length <= 64 ? id : null;
}

export async function GET() {
  const supabase = await getSupabase();
  if (!supabase) return NextResponse.json({ ok: true, shoeIds: [] });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: true, shoeIds: [] });

  const { data, error } = await supabase
    .from("favorites")
    .select("shoe_id")
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ ok: false, shoeIds: [], message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, shoeIds: (data ?? []).map((r) => r.shoe_id as string) });
}

export async function POST(request: Request) {
  const shoeId = readShoeId(await request.json().catch(() => null));
  if (!shoeId) return NextResponse.json({ ok: false, message: "Invalid shoe id." }, { status: 400 });

  const supabase = await getSupabase();
  if (!supabase) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });

  const { error } = await supabase
    .from("favorites")
    .upsert({ user_id: user.id, shoe_id: shoeId }, { onConflict: "user_id,shoe_id" });

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const shoeId = readShoeId(await request.json().catch(() => null));
  if (!shoeId) return NextResponse.json({ ok: false, message: "Invalid shoe id." }, { status: 400 });

  const supabase = await getSupabase();
  if (!supabase) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });

  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("shoe_id", shoeId);

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
