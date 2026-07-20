import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { closetAddSchema, closetUpdateSchema } from "@/lib/validation/schemas";
import { getMemberContext } from "@/lib/subscription/entitlements";
import { isPaidTier } from "@/lib/subscription/tiers";
import { FREE_CLOSET_LIMIT } from "@/lib/closet/wear";

// The shoe closet CRUD. Same auth pattern as favorites: the anon SSR client +
// RLS scope every query to the signed-in user. The only server-trust decision
// is the free-tier item cap, resolved via the entitlement layer.

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

const ITEM_COLUMNS =
  "shoe_id, size_label, purchase_price, purchased_at, play_hours, sessions, retired, retired_at, created_at";

export async function GET() {
  const supabase = await getSupabase();
  if (!supabase) return NextResponse.json({ ok: true, items: [] });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: true, items: [] });

  const { data, error } = await supabase
    .from("shoe_closet")
    .select(ITEM_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(request: Request) {
  const parsed = closetAddSchema.safeParse(await request.json());
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

  // Free members register up to FREE_CLOSET_LIMIT pairs; paid tiers (and
  // admins) are uncapped. Checked before the insert so the limit can't be
  // raced past meaningfully (it's a personal closet, not an economy).
  const { count } = await supabase
    .from("shoe_closet")
    .select("shoe_id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= FREE_CLOSET_LIMIT) {
    const [member, profile] = await Promise.all([
      getMemberContext(user.id),
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    ]);
    const isAdmin = profile.data?.role === "admin";
    if (!isPaidTier(member.tier) && !isAdmin) {
      return NextResponse.json(
        { ok: false, code: "limit", message: "Free plan holds up to 3 pairs. Upgrade for an unlimited closet." },
        { status: 403 }
      );
    }
  }

  const { data, error } = await supabase
    .from("shoe_closet")
    .upsert(
      {
        user_id: user.id,
        shoe_id: parsed.data.shoeId,
        size_label: parsed.data.sizeLabel?.trim() || null,
        purchase_price: parsed.data.purchasePrice ?? null,
        purchased_at: parsed.data.purchasedAt ?? null,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,shoe_id" }
    )
    .select(ITEM_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(request: Request) {
  const parsed = closetUpdateSchema.safeParse(await request.json());
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

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const { sizeLabel, purchasePrice, purchasedAt, retired } = parsed.data;
  if (sizeLabel !== undefined) patch.size_label = sizeLabel?.trim() || null;
  if (purchasePrice !== undefined) patch.purchase_price = purchasePrice;
  if (purchasedAt !== undefined) patch.purchased_at = purchasedAt;
  if (retired !== undefined) {
    patch.retired = retired;
    patch.retired_at = retired ? new Date().toISOString() : null;
  }

  const { data, error } = await supabase
    .from("shoe_closet")
    .update(patch)
    .eq("user_id", user.id)
    .eq("shoe_id", parsed.data.shoeId)
    .select(ITEM_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const shoeId = typeof body?.shoeId === "string" ? body.shoeId : null;
  if (!shoeId || shoeId.length > 64) {
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

  const { error } = await supabase
    .from("shoe_closet")
    .delete()
    .eq("user_id", user.id)
    .eq("shoe_id", shoeId);

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
