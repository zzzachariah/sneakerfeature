import { createAdminClient } from "@/lib/supabase/admin";

export type UserDetail = {
  profile: {
    id: string;
    username: string;
    email: string;
    role: "user" | "admin";
    avatarUrl: string | null;
    bio: string | null;
    createdAt: string;
    updatedAt: string;
    persona: Persona | null;
    ratingFocus: RatingFocus | null;
    footProfile: FootProfile | null;
    personalizedPushEnabled: boolean;
  };
  totals: {
    comments: number;
    ratings: number;
    favorites: number;
    submissions: number;
    smartPickerChats: number;
    smartPickerMessages: number;
    footScans: number;
    shoeViews: number;
    aiCreditBalance: number;
    lastCheckinAt: string | null;
    reportsFiled: number;
    reportsAgainst: number;
    blocksGiven: number;
    blocksReceived: number;
    pushTokensByPlatform: Record<string, number>;
    lastActiveAt: string | null;
  };
  /** Last 10 AI credit transactions, newest first. */
  creditTransactions: { id: string; delta: number; reason: string; packageLabel: string | null; createdAt: string }[];
  /** Last 10 Smart Picker chats, newest first. */
  recentChats: { id: string; title: string | null; updatedAt: string }[];
  /** Up to 10 most-viewed shoes for this user. */
  topShoes: { shoeId: string; slug: string; brand: string; shoeName: string; viewCount: number; lastViewedAt: string }[];
  /** Last 5 comments with shoe context. */
  recentComments: { id: string; content: string; createdAt: string; shoe: ShoeRef | null }[];
  /** Last 5 ratings with shoe context. */
  recentRatings: { id: string; rating: number; createdAt: string; shoe: ShoeRef | null }[];
  /** Last 5 favorites with shoe context. */
  recentFavorites: { shoeId: string; createdAt: string; shoe: ShoeRef | null }[];
  /** Last 5 submissions. */
  recentSubmissions: { id: string; status: string; createdAt: string }[];
};

export type ShoeRef = { id: string; slug: string; brand: string; shoeName: string };

/** Supabase returns snake_case relational columns; this shapes them to the
 * camelCase used by our React props. */
type ShoeRow = { id: string; slug: string; brand: string; shoe_name: string };

export type Persona = {
  positions?: string[];
  skill_level?: string;
  flat_foot?: boolean;
  height_cm?: number;
  weight_kg?: number;
};

export type RatingFocus = {
  primary?: string;
  secondary?: string;
  tertiary?: string;
};

export type FootProfile = {
  length_mm?: number;
  width_mm?: number;
  arch?: string;
} & Record<string, unknown>;

export async function loadUserDetail(userId: string): Promise<UserDetail | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const profilePromise = admin
    .from("profiles")
    .select(
      "id, username, email, role, avatar_url, bio, created_at, updated_at, persona, rating_focus, foot_profile, personalized_push_enabled"
    )
    .eq("id", userId)
    .maybeSingle();

  const head = { count: "exact" as const, head: true };

  // Lots of small head-count queries fanned out in parallel — each is a cheap
  // index hit on user_id. Cheaper than aggregating in JS over the full rows.
  const [
    profileResult,
    commentsCount,
    ratingsCount,
    favoritesCount,
    submissionsCount,
    chatsCount,
    messagesCount,
    footScansCount,
    shoeViewsCount,
    creditsRow,
    reportsFiledCount,
    reportsAgainstAggregate,
    blocksGivenCount,
    blocksReceivedCount,
    pushTokens,
    creditTxnsResult,
    recentChatsResult,
    topShoesResult,
    recentCommentsResult,
    recentRatingsResult,
    recentFavoritesResult,
    recentSubmissionsResult,
  ] = await Promise.all([
    profilePromise,
    admin.from("comments").select("id", head).eq("user_id", userId),
    admin.from("shoe_ratings").select("id", head).eq("user_id", userId),
    admin.from("favorites").select("shoe_id", head).eq("user_id", userId),
    admin.from("user_submissions").select("id", head).eq("user_id", userId),
    admin.from("ai_chats").select("id", head).eq("user_id", userId),
    // ai_messages has no direct user_id — join through ai_chats.
    admin
      .from("ai_messages")
      .select("id, ai_chats!inner(user_id)", { count: "exact", head: true })
      .eq("ai_chats.user_id", userId),
    admin.from("foot_scans").select("id", head).eq("user_id", userId),
    admin.from("shoe_views").select("id", head).eq("user_id", userId),
    admin
      .from("ai_credits")
      .select("balance, last_checkin_at")
      .eq("user_id", userId)
      .maybeSingle(),
    admin.from("comment_reports").select("id", head).eq("reporter_id", userId),
    // Reports against this user — join through comments → user_id.
    admin
      .from("comment_reports")
      .select("id, comments!inner(user_id)")
      .eq("comments.user_id", userId),
    admin.from("user_blocks").select("id", head).eq("blocker_id", userId),
    admin.from("user_blocks").select("id", head).eq("blocked_id", userId),
    admin.from("push_tokens").select("platform").eq("user_id", userId),
    admin
      .from("ai_credit_transactions")
      .select("id, delta, reason, package_label, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("ai_chats")
      .select("id, title, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(10),
    admin
      .from("shoe_views")
      .select("shoe_id, view_count, last_viewed_at, shoes(id, slug, brand, shoe_name)")
      .eq("user_id", userId)
      .order("view_count", { ascending: false })
      .limit(10),
    admin
      .from("comments")
      .select("id, content, created_at, shoes(id, slug, brand, shoe_name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("shoe_ratings")
      .select("id, rating, created_at, shoes(id, slug, brand, shoe_name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("favorites")
      .select("shoe_id, created_at, shoes(id, slug, brand, shoe_name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("user_submissions")
      .select("id, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const profile = profileResult.data;
  if (!profile) return null;

  // last active = max(updated_at of profile, recent comment/rating/favorite/view/chat timestamps)
  const candidates: (string | null | undefined)[] = [
    profile.updated_at,
    recentCommentsResult.data?.[0]?.created_at,
    recentRatingsResult.data?.[0]?.created_at,
    recentFavoritesResult.data?.[0]?.created_at,
    topShoesResult.data?.[0]?.last_viewed_at,
    recentChatsResult.data?.[0]?.updated_at,
  ];
  const lastActiveAt = candidates
    .filter((t): t is string => typeof t === "string" && !!t)
    .sort()
    .pop() ?? null;

  const pushTokensByPlatform: Record<string, number> = {};
  for (const row of (pushTokens.data ?? []) as { platform: string }[]) {
    pushTokensByPlatform[row.platform] = (pushTokensByPlatform[row.platform] ?? 0) + 1;
  }

  const reportsAgainst = Array.isArray(reportsAgainstAggregate.data)
    ? reportsAgainstAggregate.data.length
    : 0;

  type ShoeJoin = ShoeRow | ShoeRow[] | null | undefined;
  const normalizeShoe = (j: ShoeJoin): ShoeRef | null => {
    if (!j) return null;
    const row = Array.isArray(j) ? j[0] : j;
    if (!row) return null;
    return { id: row.id, slug: row.slug, brand: row.brand, shoeName: row.shoe_name };
  };

  return {
    profile: {
      id: profile.id,
      username: profile.username ?? "",
      email: profile.email ?? "",
      role: profile.role === "admin" ? "admin" : "user",
      avatarUrl: profile.avatar_url ?? null,
      bio: profile.bio ?? null,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
      persona: (profile.persona ?? null) as Persona | null,
      ratingFocus: (profile.rating_focus ?? null) as RatingFocus | null,
      footProfile: (profile.foot_profile ?? null) as FootProfile | null,
      personalizedPushEnabled: profile.personalized_push_enabled !== false,
    },
    totals: {
      comments: commentsCount.count ?? 0,
      ratings: ratingsCount.count ?? 0,
      favorites: favoritesCount.count ?? 0,
      submissions: submissionsCount.count ?? 0,
      smartPickerChats: chatsCount.count ?? 0,
      smartPickerMessages: messagesCount.count ?? 0,
      footScans: footScansCount.count ?? 0,
      shoeViews: shoeViewsCount.count ?? 0,
      aiCreditBalance: creditsRow.data?.balance ?? 0,
      lastCheckinAt: creditsRow.data?.last_checkin_at ?? null,
      reportsFiled: reportsFiledCount.count ?? 0,
      reportsAgainst,
      blocksGiven: blocksGivenCount.count ?? 0,
      blocksReceived: blocksReceivedCount.count ?? 0,
      pushTokensByPlatform,
      lastActiveAt,
    },
    creditTransactions: (creditTxnsResult.data ?? []).map((t) => ({
      id: t.id,
      delta: t.delta,
      reason: t.reason,
      packageLabel: t.package_label ?? null,
      createdAt: t.created_at,
    })),
    recentChats: (recentChatsResult.data ?? []).map((c) => ({
      id: c.id,
      title: c.title ?? null,
      updatedAt: c.updated_at,
    })),
    topShoes: ((topShoesResult.data ?? []) as { shoe_id: string; view_count: number; last_viewed_at: string; shoes: ShoeJoin }[]).map((v) => {
      const shoe = normalizeShoe(v.shoes);
      return {
        shoeId: v.shoe_id,
        slug: shoe?.slug ?? "",
        brand: shoe?.brand ?? "",
        shoeName: shoe?.shoeName ?? "",
        viewCount: v.view_count,
        lastViewedAt: v.last_viewed_at,
      };
    }),
    recentComments: ((recentCommentsResult.data ?? []) as { id: string; content: string; created_at: string; shoes: ShoeJoin }[]).map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.created_at,
      shoe: normalizeShoe(c.shoes),
    })),
    recentRatings: ((recentRatingsResult.data ?? []) as { id: string; rating: number; created_at: string; shoes: ShoeJoin }[]).map((r) => ({
      id: r.id,
      rating: r.rating,
      createdAt: r.created_at,
      shoe: normalizeShoe(r.shoes),
    })),
    recentFavorites: ((recentFavoritesResult.data ?? []) as { shoe_id: string; created_at: string; shoes: ShoeJoin }[]).map((f) => ({
      shoeId: f.shoe_id,
      createdAt: f.created_at,
      shoe: normalizeShoe(f.shoes),
    })),
    recentSubmissions: (recentSubmissionsResult.data ?? []).map((s) => ({
      id: s.id,
      status: s.status,
      createdAt: s.created_at,
    })),
  };
}
