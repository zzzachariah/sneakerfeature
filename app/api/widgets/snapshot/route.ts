import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/auth";
import { getShoes } from "@/lib/data/shoes";
import {
  buildWidgetSnapshot,
  type SnapshotClosetItem,
  type SnapshotShoe,
  type SnapshotWearLog
} from "@/lib/widgets/snapshot";

// Assembles everything the native home-screen widgets draw, in one request.
//
// The widget process can't call this — it has no session and no network budget
// worth relying on. The *app* calls it, on open and on resume, and hands the
// result to the LiveWidgets plugin, which writes it into the shared App Group
// container. So this route is a normal authenticated read; the "widget" part is
// only what shape it returns.
//
// Signed-out users still get a snapshot: the daily pick works without an
// account, and a widget that says something is better than a widget that says
// "sign in" forever.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Enough history to cover "this week" plus slack for a user who logs late.
const WEAR_LOG_LIMIT = 200;

type DigestRecommendationRow = { id?: unknown; reason?: unknown };

export async function GET() {
  const [user, cookieStore, shoes] = await Promise.all([getCurrentUser(), cookies(), getShoes()]);
  const localeCookie = cookieStore.get("locale")?.value;
  const locale = localeCookie === "zh" ? "zh" : "en";

  const shoesById = new Map<string, SnapshotShoe>(
    shoes.map((s) => [
      s.id,
      { id: s.id, slug: s.slug, brand: s.brand, shoe_name: s.shoe_name, image_url: s.image_url ?? null }
    ])
  );

  let closet: SnapshotClosetItem[] = [];
  let wearLogs: SnapshotWearLog[] = [];
  let favoriteShoeIds: string[] = [];
  let favoritesCount = 0;
  let daily: { shoeId: string; reason: string } | null = null;

  const supabase = user ? await createClient() : null;
  if (user && supabase) {
    // One round trip each, in parallel. Any of these tables can be missing on a
    // deployment whose migrations haven't caught up, so failures degrade the
    // snapshot panel-by-panel instead of failing the request.
    const [closetRes, wearRes, favoritesRes, digestRes] = await Promise.all([
      supabase
        .from("shoe_closet")
        .select("shoe_id, play_hours, sessions, purchase_price, retired")
        .eq("user_id", user.id),
      supabase
        .from("closet_wear_logs")
        .select("shoe_id, hours, played_at")
        .eq("user_id", user.id)
        .order("played_at", { ascending: false })
        .limit(WEAR_LOG_LIMIT),
      supabase.from("favorites").select("shoe_id, created_at").eq("user_id", user.id),
      supabase.from("weekly_digests").select("recommendations").eq("user_id", user.id).maybeSingle()
    ]);

    const wearRows = (wearRes.data ?? []) as Array<{ shoe_id: string; hours: number; played_at: string }>;
    wearLogs = wearRows.map((row) => ({ hours: Number(row.hours) || 0, played_at: row.played_at }));

    // Rows come back newest-first, so the first sighting of a shoe is its most
    // recent run — which is what decides the featured pair.
    const lastPlayed = new Map<string, string>();
    for (const row of wearRows) {
      if (!lastPlayed.has(row.shoe_id)) lastPlayed.set(row.shoe_id, row.played_at);
    }

    closet = ((closetRes.data ?? []) as Array<Omit<SnapshotClosetItem, "last_played_at">>).map((row) => ({
      ...row,
      play_hours: Number(row.play_hours) || 0,
      sessions: Number(row.sessions) || 0,
      purchase_price: row.purchase_price == null ? null : Number(row.purchase_price),
      last_played_at: lastPlayed.get(row.shoe_id) ?? null
    }));

    const favoriteRows = (favoritesRes.data ?? []) as Array<{ shoe_id: string; created_at: string }>;
    favoritesCount = favoriteRows.length;
    favoriteShoeIds = [...favoriteRows]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((row) => row.shoe_id)
      .filter((id) => shoesById.has(id));

    const recommendations = (digestRes.data?.recommendations ?? []) as DigestRecommendationRow[];
    const top = Array.isArray(recommendations) ? recommendations[0] : undefined;
    if (top && typeof top.id === "string" && shoesById.has(top.id)) {
      daily = { shoeId: top.id, reason: typeof top.reason === "string" ? top.reason : "" };
    }
  }

  // No personalized pick yet (new account, or the weekly job hasn't run): fall
  // back to a shoe-of-the-day drawn from the best-rated shoes. Keyed by the
  // date so it's stable all day and different tomorrow, and computed the same
  // way for everyone so it's cacheable reasoning, not per-user state.
  if (!daily) {
    const pick = shoeOfTheDay(shoes);
    if (pick) daily = { shoeId: pick, reason: locale === "zh" ? "今日推荐" : "Today's pick" };
  }

  const snapshot = buildWidgetSnapshot({
    now: new Date(),
    locale,
    signedIn: Boolean(user),
    closet,
    wearLogs,
    shoesById,
    daily,
    favoriteShoeIds,
    favoritesCount
  });

  // The client patches in the per-device week goal and drops panels the user
  // switched off before handing this to native — see components/native/widget-sync.tsx.
  return NextResponse.json(
    { ok: true, snapshot },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** Deterministic daily rotation over the best-rated shoes with a picture. */
function shoeOfTheDay(shoes: Awaited<ReturnType<typeof getShoes>>): string | null {
  const pool = shoes
    .filter((s) => Boolean(s.image_url))
    .sort(
      (a, b) =>
        (b.finalStars ?? 0) - (a.finalStars ?? 0) ||
        (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0) ||
        a.id.localeCompare(b.id)
    )
    .slice(0, 40);
  if (pool.length === 0) return null;
  const now = new Date();
  const dayNumber = Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000
  );
  return pool[((dayNumber % pool.length) + pool.length) % pool.length].id;
}
