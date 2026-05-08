import { createClient } from "@/lib/supabase/server";
import { demoShoes } from "@/lib/data/demo-shoes";
import { Shoe, ShoeImageRecord, ShoeSpec } from "@/lib/types";
import {
  computeFinalStars,
  isValidFocus,
  percentileToStars,
  rankScoresToPercentiles,
  weightedSpecScore,
  type RatingFocus
} from "@/lib/star-rating";

type ShoeRow = Omit<Shoe, "spec"> & { shoe_specs: ShoeSpec[] | null; shoe_images?: ShoeImageRecord[] | null };
type ShoeStory = NonNullable<Shoe["story"]>;
type ShoeQueryRow = ShoeRow & { shoe_stories: ShoeStory[] | null };
export type ShoeImageState = {
  approved: ShoeImageRecord | null;
  pending: ShoeImageRecord | null;
  latestRejected: ShoeImageRecord | null;
};

function resolveApprovedImage(images?: ShoeImageRecord[] | null) {
  if (!images?.length) return null;
  return [...images]
    .filter((image) => image.status === "approved")
    .sort((a, b) => new Date(b.approved_at ?? b.created_at).getTime() - new Date(a.approved_at ?? a.created_at).getTime())[0] ?? null;
}

export async function getShoes(): Promise<Shoe[]> {
  const supabase = await createClient();
  if (!supabase) return demoShoes;

  const { data, error } = await supabase
    .from("shoes")
    .select("*, shoe_specs(*), shoe_stories(*), shoe_images(*)")
    .order("created_at", { ascending: false });

  if (error || !data?.length) return demoShoes;

  const rows = data as ShoeQueryRow[];
  const shoeIds = rows.map((row) => row.id);

  const aggregates = new Map<string, { sum: number; count: number }>();
  const myRatings = new Map<string, number>();
  let focus: RatingFocus | null = null;

  if (shoeIds.length > 0) {
    const { data: ratingRows } = await supabase
      .from("shoe_ratings")
      .select("shoe_id, rating")
      .in("shoe_id", shoeIds);
    for (const r of ratingRows ?? []) {
      const cur = aggregates.get(r.shoe_id) ?? { sum: 0, count: 0 };
      cur.sum += Number(r.rating);
      cur.count += 1;
      aggregates.set(r.shoe_id, cur);
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (user) {
      const { data: mine } = await supabase
        .from("shoe_ratings")
        .select("shoe_id, rating")
        .eq("user_id", user.id)
        .in("shoe_id", shoeIds);
      for (const r of mine ?? []) myRatings.set(r.shoe_id, Number(r.rating));

      const { data: profile } = await supabase
        .from("profiles")
        .select("rating_focus")
        .eq("id", user.id)
        .maybeSingle();
      const raw = profile?.rating_focus;
      if (isValidFocus(raw)) focus = raw;
    }
  }

  const specs = rows.map((row) => row.shoe_specs?.[0] ?? {});
  let specStars: (number | null)[] = rows.map(() => null);
  if (focus) {
    const scores = specs.map((spec) => weightedSpecScore(spec, focus!));
    const percentiles = rankScoresToPercentiles(scores);
    specStars = percentiles.map((p) => percentileToStars(p));
  }

  return rows.map((row, idx) => {
    const agg = aggregates.get(row.id);
    const avgUserRating = agg && agg.count > 0 ? agg.sum / agg.count : null;
    const userRatingCount = agg?.count ?? 0;
    const ss = specStars[idx];
    const finalStars = ss === null ? null : computeFinalStars(ss, avgUserRating, userRatingCount);
    return {
      ...row,
      image_url: resolveApprovedImage(row.shoe_images)?.public_url ?? null,
      spec: specs[idx],
      story: row.shoe_stories?.[0] ?? null,
      avgUserRating,
      userRatingCount,
      myRating: myRatings.get(row.id) ?? null,
      specStars: ss,
      finalStars
    };
  });
}

export async function getShoeBySlug(slug: string): Promise<Shoe | null> {
  const shoes = await getShoes();
  return shoes.find((s) => s.slug === slug) ?? null;
}

export async function getShoeImageState(shoeId: string, includePending: boolean): Promise<ShoeImageState> {
  const supabase = await createClient();
  if (!supabase) return { approved: null, pending: null, latestRejected: null };

  const { data } = await supabase
    .from("shoe_images")
    .select("*")
    .eq("shoe_id", shoeId)
    .in("status", includePending ? ["approved", "pending", "rejected"] : ["approved"])
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as ShoeImageRecord[];

  const approved =
    rows
      .filter((row) => row.status === "approved")
      .sort((a, b) => new Date(b.approved_at ?? b.created_at).getTime() - new Date(a.approved_at ?? a.created_at).getTime())[0] ?? null;
  const pending = includePending ? rows.find((row) => row.status === "pending") ?? null : null;
  const latestRejected = includePending ? rows.find((row) => row.status === "rejected") ?? null : null;

  return { approved, pending, latestRejected };
}
