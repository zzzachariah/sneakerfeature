// The contract between the web app and the native home-screen widgets.
//
// A widget runs in its own process. It cannot see the WebView's cookies, cannot
// call our authenticated API, and cannot load a remote image inside its view
// body. So the app hands it a finished picture of the world — this snapshot —
// which native writes into the shared App Group container; the widget only ever
// renders what it finds there.
//
// Two rules follow from that, and both shape the types below:
//   1. Everything the widget draws must already be resolved here. No ids to
//      look up, no URLs to fetch, no locale to negotiate — the strings are the
//      final strings, in the user's language.
//   2. Nothing may go stale in a way that reads as broken. Values that change
//      with the clock (a running timer) are NOT in the snapshot; the widget
//      derives those from a timestamp so it stays right without a refresh.
//
// This file is pure (no React, no DB, no Capacitor) so both the API route that
// builds it and scripts/test-widget-snapshot.mts can use it. The Swift mirror
// of these types lives in live-widgets/ios/Shared/WidgetSnapshot.swift — keep
// the two in sync, the JSON keys are the interface.

/** Bumped whenever a field changes meaning. Native ignores snapshots it can't read. */
export const WIDGET_SNAPSHOT_VERSION = 1;

/** How many favorite pairs the small favorites widget shows. */
export const WIDGET_FAVORITES_PREVIEW = 2;

/** Default weekly court-hours target for the lock-screen ring. */
export const DEFAULT_WEEK_GOAL_HOURS = 6;

/**
 * An image the widget wants to draw. The web layer resolves `url` to a small
 * JPEG in the shared container and replaces this with the resulting `file`
 * before publishing — see cacheWidgetImages() in lib/native/live-widgets.ts.
 * Native only ever reads `file`; `url` is stripped on the way out.
 */
export type WidgetImage = { url: string | null; file: string | null };

export type WidgetClosetPanel = {
  shoeId: string | null;
  /** Already-formatted display strings — the widget does no string building. */
  shoeName: string;
  shoeBrand: string;
  image: WidgetImage;
  /** Lifetime totals across the active rotation. */
  totalHours: number;
  totalSessions: number;
  /** This calendar week (Mon–Sun, user's local weeks as computed server-side). */
  weekHours: number;
  weekGoalHours: number;
  /** 0..1+ share of the estimated cushion life used by the featured pair. */
  wearRatio: number;
  /** Money per session for the featured pair; null when price/sessions missing. */
  costPerSession: number | null;
  currency: string;
  /** Where a tap lands. Always an in-app path, never an absolute URL. */
  path: string;
};

export type WidgetDailyPanel = {
  title: string;
  brand: string;
  /** One short line. Truncated here, not in Swift, so the limit is testable. */
  reason: string;
  image: WidgetImage;
  path: string;
};

export type WidgetFavoriteItem = {
  name: string;
  brand: string;
  image: WidgetImage;
  path: string;
};

export type WidgetFavoritesPanel = {
  count: number;
  items: WidgetFavoriteItem[];
  /** Compare page pre-loaded with the two shown pairs, when there are two. */
  comparePath: string;
};

/**
 * Which surfaces the user left switched on. Native reads these to decide what
 * an already-placed widget renders — the app can't remove a widget from someone's
 * home screen, so a disabled one shows its "turned off in settings" face instead
 * of stale data. The matching panel is also nulled out, so a disabled feature
 * stops being copied into the shared container at all.
 */
export type WidgetFeatureFlags = {
  closet: boolean;
  daily: boolean;
  favorites: boolean;
  lockWeek: boolean;
};

export type WidgetSnapshot = {
  v: typeof WIDGET_SNAPSHOT_VERSION;
  updatedAt: string;
  signedIn: boolean;
  locale: string;
  features: WidgetFeatureFlags;
  closet: WidgetClosetPanel | null;
  daily: WidgetDailyPanel | null;
  favorites: WidgetFavoritesPanel | null;
};

// --- Inputs -----------------------------------------------------------------
// Deliberately structural, not imported from the DB layer: the builder is a
// pure function of plain rows so the test can hand it literals.

export type SnapshotShoe = {
  id: string;
  slug: string;
  brand: string;
  shoe_name: string;
  image_url?: string | null;
};

export type SnapshotClosetItem = {
  shoe_id: string;
  play_hours: number;
  sessions: number;
  purchase_price: number | null;
  retired: boolean;
  /** Most recent wear timestamp, ISO date. Null when the pair was never worn. */
  last_played_at: string | null;
};

export type SnapshotWearLog = { hours: number; played_at: string };

export type BuildSnapshotInput = {
  now: Date;
  locale: string;
  signedIn: boolean;
  currency?: string;
  weekGoalHours?: number;
  closet: SnapshotClosetItem[];
  wearLogs: SnapshotWearLog[];
  /** Every shoe referenced by the closet / daily / favorites lists. */
  shoesById: Map<string, SnapshotShoe>;
  daily: { shoeId: string; reason: string } | null;
  favoriteShoeIds: string[];
  favoritesCount: number;
};

// The reason line is the only free text on a widget. Widgets have very little
// room and truncate mid-word with no ellipsis, so clamp it here where the rule
// is visible and tested rather than discovering it on a device.
export const WIDGET_REASON_MAX = 64;

export function clampReason(raw: string, max = WIDGET_REASON_MAX): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  // Cut on a word boundary when there is one close to the limit; CJK has no
  // spaces, so fall back to a hard cut.
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  const body = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${body.trimEnd()}…`;
}

/**
 * Start of the ISO week (Monday 00:00) containing `now`, in the caller's
 * timezone. The lock-screen ring reads "this week", and a hooper's week starts
 * on Monday — a Sunday-start week would reset the ring mid-weekend.
 */
export function startOfWeek(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // getDay(): 0=Sun..6=Sat → days since Monday.
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return d;
}

/** Hours logged since the start of the current week. */
export function weekHoursFrom(logs: SnapshotWearLog[], now: Date): number {
  const from = startOfWeek(now);
  let total = 0;
  for (const log of logs) {
    // played_at is a DATE column ("2026-08-06"); parse as local midnight so a
    // Monday session isn't pushed into last week by a negative UTC offset.
    const played = parseLocalDate(log.played_at);
    if (played && played >= from) total += Number(log.hours) || 0;
  }
  return round1(total);
}

function parseLocalDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * The pair the closet widget features: the one most recently played, falling
 * back to the most-worn, then to whatever is first. Retired pairs never
 * feature — the widget is about what you're hooping in now.
 */
export function pickFeaturedItem(items: SnapshotClosetItem[]): SnapshotClosetItem | null {
  const active = items.filter((i) => !i.retired);
  if (active.length === 0) return null;
  const played = active
    .filter((i) => i.last_played_at)
    .sort((a, b) => String(b.last_played_at).localeCompare(String(a.last_played_at)));
  if (played.length > 0) return played[0];
  return [...active].sort((a, b) => Number(b.play_hours) - Number(a.play_hours))[0];
}

// Mirrors lib/closet/wear.ts. Duplicated as a literal rather than imported so
// this module stays dependency-free for the test harness; the value is asserted
// against the source of truth in scripts/test-widget-snapshot.mts.
const CUSHION_LIFE_HOURS = 300;

export function buildWidgetSnapshot(input: BuildSnapshotInput): WidgetSnapshot {
  const currency = input.currency ?? "¥";
  const weekGoalHours = clampGoal(input.weekGoalHours);

  return {
    v: WIDGET_SNAPSHOT_VERSION,
    updatedAt: input.now.toISOString(),
    signedIn: input.signedIn,
    locale: input.locale,
    // The server builds an everything-on snapshot; the client narrows it with
    // the device's own switches (applyWidgetPrefs) before it reaches native.
    features: { closet: true, daily: true, favorites: true, lockWeek: true },
    closet: buildClosetPanel(input, currency, weekGoalHours),
    daily: buildDailyPanel(input),
    favorites: buildFavoritesPanel(input)
  };
}

/**
 * Narrows a server snapshot to what this device's settings allow, and applies
 * the device's weekly goal. Returns a new object; the input is untouched.
 *
 * A switched-off panel is both flagged AND emptied. Flagging alone would leave
 * the user's rotation sitting in a container they asked us to stop writing to;
 * emptying alone would make a disabled widget look broken rather than off.
 */
export function applyWidgetPrefs(
  snapshot: WidgetSnapshot,
  prefs: {
    closetWidget: boolean;
    dailyWidget: boolean;
    favoritesWidget: boolean;
    lockScreenWeek: boolean;
    weekGoalHours: number;
  }
): WidgetSnapshot {
  const closetOn = prefs.closetWidget || prefs.lockScreenWeek;
  return {
    ...snapshot,
    features: {
      closet: prefs.closetWidget,
      daily: prefs.dailyWidget,
      favorites: prefs.favoritesWidget,
      lockWeek: prefs.lockScreenWeek
    },
    // The lock-screen ring reads its hours off the closet panel, so the panel
    // survives when either surface wants it.
    closet:
      closetOn && snapshot.closet
        ? { ...snapshot.closet, weekGoalHours: clampGoal(prefs.weekGoalHours) }
        : null,
    daily: prefs.dailyWidget ? snapshot.daily : null,
    favorites: prefs.favoritesWidget ? snapshot.favorites : null
  };
}

/** A goal of 0 would divide by zero in the ring; an absurd goal makes it dead. */
export function clampGoal(raw: number | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WEEK_GOAL_HOURS;
  return Math.min(40, Math.max(1, Math.round(n * 2) / 2));
}

function buildClosetPanel(
  input: BuildSnapshotInput,
  currency: string,
  weekGoalHours: number
): WidgetClosetPanel | null {
  const featured = pickFeaturedItem(input.closet);
  if (!featured) return null;
  const shoe = input.shoesById.get(featured.shoe_id) ?? null;

  const active = input.closet.filter((i) => !i.retired);
  const totalHours = round1(active.reduce((s, i) => s + (Number(i.play_hours) || 0), 0));
  const totalSessions = active.reduce((s, i) => s + (Number(i.sessions) || 0), 0);

  const price = Number(featured.purchase_price);
  const costPerSession =
    Number.isFinite(price) && price > 0 && featured.sessions > 0 ? price / featured.sessions : null;

  return {
    shoeId: featured.shoe_id,
    shoeName: shoe?.shoe_name ?? "",
    shoeBrand: shoe?.brand ?? "",
    image: { url: shoe?.image_url ?? null, file: null },
    totalHours,
    totalSessions,
    weekHours: weekHoursFrom(input.wearLogs, input.now),
    weekGoalHours,
    wearRatio: Math.max(0, Number(featured.play_hours) || 0) / CUSHION_LIFE_HOURS,
    costPerSession: costPerSession == null ? null : Math.round(costPerSession * 100) / 100,
    currency,
    path: shoe?.slug ? `/shoes/${shoe.slug}` : "/closet"
  };
}

function buildDailyPanel(input: BuildSnapshotInput): WidgetDailyPanel | null {
  if (!input.daily) return null;
  const shoe = input.shoesById.get(input.daily.shoeId);
  if (!shoe) return null;
  return {
    title: shoe.shoe_name,
    brand: shoe.brand,
    reason: clampReason(input.daily.reason),
    image: { url: shoe.image_url ?? null, file: null },
    path: `/shoes/${shoe.slug}`
  };
}

function buildFavoritesPanel(input: BuildSnapshotInput): WidgetFavoritesPanel | null {
  const items: WidgetFavoriteItem[] = [];
  for (const id of input.favoriteShoeIds) {
    const shoe = input.shoesById.get(id);
    if (!shoe) continue;
    items.push({
      name: shoe.shoe_name,
      brand: shoe.brand,
      image: { url: shoe.image_url ?? null, file: null },
      path: `/shoes/${shoe.slug}`
    });
    if (items.length === WIDGET_FAVORITES_PREVIEW) break;
  }
  if (input.favoritesCount === 0 && items.length === 0) return null;

  // /compare reads its selection from the `ids` query param, same as the web
  // compare picker. With fewer than two pairs there is nothing to compare, so
  // the tap falls back to the favorites list.
  const comparePath =
    items.length === WIDGET_FAVORITES_PREVIEW
      ? `/compare?ids=${input.favoriteShoeIds.slice(0, WIDGET_FAVORITES_PREVIEW).join(",")}`
      : "/favorites";

  return { count: input.favoritesCount, items, comparePath };
}

/**
 * Every image referenced by a snapshot, in a stable order, so the caller can
 * resolve them all and patch the results back in without walking the tree twice.
 */
export function snapshotImages(snapshot: WidgetSnapshot): WidgetImage[] {
  const out: WidgetImage[] = [];
  if (snapshot.closet) out.push(snapshot.closet.image);
  if (snapshot.daily) out.push(snapshot.daily.image);
  if (snapshot.favorites) for (const item of snapshot.favorites.items) out.push(item.image);
  return out;
}
