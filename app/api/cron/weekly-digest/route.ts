import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPackyClient } from "@/lib/ai/packy-client";
import { recommendShoes, matchShoeByName } from "@/lib/ai/recommend";
import { getShoes } from "@/lib/data/shoes";
import { isValidPersona, type Persona } from "@/lib/persona/types";
import {
  pickComparePair,
  buildPushCopy,
  type DigestCompareShoe,
  type DigestRecommendation
} from "@/lib/personalize/digest";

// Weekly job that regenerates each opted-in user's personalized digest from
// their browsing history (+ persona) using the same AI engine as Smart Picker.
// Triggered by Vercel Cron (see vercel.json) with Authorization: Bearer
// $CRON_SECRET. The AI step is best-effort; every user with views still gets a
// comparison teaser. Push delivery is a separate, later step — this only builds
// and stores the digests, which the in-app /for-you page reads.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DIGEST_COUNT = 3;
const USER_BATCH = 200; // safety cap per run; tune for scale

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) {
    return NextResponse.json({ ok: false, message: "Service role not configured." }, { status: 400 });
  }

  // Recent views, newest first, grouped per user (recency order preserved).
  const { data: viewRows } = await db
    .from("shoe_views")
    .select("user_id, shoe_id, last_viewed_at")
    .order("last_viewed_at", { ascending: false })
    .limit(5000);

  const viewsByUser = new Map<string, string[]>();
  for (const row of viewRows ?? []) {
    const list = viewsByUser.get(row.user_id) ?? [];
    list.push(row.shoe_id);
    viewsByUser.set(row.user_id, list);
  }
  if (viewsByUser.size === 0) return NextResponse.json({ ok: true, generated: 0 });

  const userIds = [...viewsByUser.keys()].slice(0, USER_BATCH);

  // Opted-in users + their persona.
  const { data: profiles } = await db
    .from("profiles")
    .select("id, persona, personalized_push_enabled")
    .in("id", userIds);

  const personaByUser = new Map<string, Persona | null>();
  const optedIn = new Set<string>();
  for (const p of profiles ?? []) {
    if (p.personalized_push_enabled === false) continue;
    optedIn.add(p.id);
    personaByUser.set(p.id, isValidPersona(p.persona) ? (p.persona as Persona) : null);
  }

  const shoes = await getShoes();
  const shoeById = new Map(shoes.map((s) => [s.id, s]));
  const client = createPackyClient();

  let generated = 0;
  for (const userId of userIds) {
    if (!optedIn.has(userId)) continue;
    const viewedIds = viewsByUser.get(userId) ?? [];
    const persona = personaByUser.get(userId) ?? null;

    // Comparison teaser: two most-recently-viewed shoes (pure, always works).
    const compareShoes: DigestCompareShoe[] = pickComparePair(viewedIds)
      .map((id) => shoeById.get(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((s) => ({ id: s.id, name: s.shoe_name, slug: s.slug }));

    // Smart-picker recommendations via the AI engine (best-effort).
    let recommendations: DigestRecommendation[] = [];
    const viewedNames = viewedIds
      .map((id) => shoeById.get(id)?.shoe_name)
      .filter((n): n is string => Boolean(n))
      .slice(0, 8);

    if (client && viewedNames.length > 0) {
      try {
        const currentInput =
          `我最近浏览过这些球鞋：${viewedNames.join("、")}。` +
          `请结合我的浏览记录和球员档案，推荐我可能喜欢的球鞋，并说明每双为什么适合我。`;
        const result = await recommendShoes(client, {
          shoes,
          history: [],
          currentInput,
          count: DIGEST_COUNT,
          persona
        });
        recommendations = result.recommendations
          .map((rec) => {
            const shoe = matchShoeByName(rec.name, shoes);
            if (!shoe) return null;
            return { id: shoe.id, name: shoe.shoe_name, slug: shoe.slug, stars: rec.stars, reason: rec.reason };
          })
          .filter((r): r is DigestRecommendation => Boolean(r));
      } catch {
        recommendations = [];
      }
    }

    if (compareShoes.length === 0 && recommendations.length === 0) continue;

    const push = buildPushCopy(compareShoes, recommendations);
    const { error } = await db.from("weekly_digests").upsert(
      {
        user_id: userId,
        generated_at: new Date().toISOString(),
        compare_shoes: compareShoes,
        recommendations,
        push_title: push.title,
        push_body: push.body,
        deep_link: push.deepLink
      },
      { onConflict: "user_id" }
    );
    if (!error) generated += 1;
  }

  return NextResponse.json({ ok: true, generated });
}
