// The pure logic behind the home-screen widgets and the court timer. No
// database, no env, no native — runnable any time:
//
//   npx tsx scripts/test-widget-snapshot.mts
//
// Why these two modules get a test: both are read by code we cannot debug.
// A widget renders in another process with no console, and the Dynamic Island
// keeps counting with the app suspended — by the time a rounding slip or an
// off-by-one week boundary shows up, it shows up as a wrong number on someone's
// Lock Screen with no way to trace it. Everything below is the part that can be
// checked on a laptop.

import {
  applyWidgetPrefs,
  buildWidgetSnapshot,
  clampGoal,
  clampReason,
  pickFeaturedItem,
  snapshotImages,
  startOfWeek,
  weekHoursFrom,
  WIDGET_REASON_MAX,
  WIDGET_SNAPSHOT_VERSION,
  type SnapshotShoe
} from "../lib/widgets/snapshot";
import {
  createCourtSession,
  elapsedMs,
  formatElapsed,
  isOverrun,
  loggableHours,
  MAX_SESSION_MS,
  MIN_LOGGABLE_HOURS,
  pauseSession,
  resumeSession,
  sessionPlayedAt
} from "../lib/closet/court-session";
import { CUSHION_LIFE_HOURS } from "../lib/closet/wear";
import { DEFAULT_WIDGET_PREFS } from "../lib/native/widget-prefs";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`, extra ?? "");
  }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, Object.is(actual, expected), `got ${String(actual)}, expected ${String(expected)}`);
}

// --- Shared fixtures ---------------------------------------------------------

const SHOES: SnapshotShoe[] = [
  { id: "s1", slug: "kd-17", brand: "Nike", shoe_name: "KD 17", image_url: "https://cdn/kd17.png" },
  { id: "s2", slug: "ww-11", brand: "Li-Ning", shoe_name: "Way of Wade 11", image_url: "https://cdn/ww11.png" },
  { id: "s3", slug: "kai-1", brand: "Anta", shoe_name: "KAI 1", image_url: null }
];
const shoesById = new Map(SHOES.map((s) => [s.id, s]));

// A Thursday, so a Monday-start week has real days on both sides of it.
const NOW = new Date(2026, 7, 6, 20, 30); // 2026-08-06 (Thu)

// --- Week boundary -----------------------------------------------------------
//
// The lock-screen ring says "this week". Getting the boundary wrong is the one
// bug the user would definitely notice: Monday morning either shows last week's
// hours or resets a day early.

console.log("\nweek boundary (Monday-start, local time)");
eq("Thursday → Monday of that week", startOfWeek(NOW).getDate(), 3);
eq("Monday → itself", startOfWeek(new Date(2026, 7, 3, 9, 0)).getDate(), 3);
eq("Sunday belongs to the week that started Monday", startOfWeek(new Date(2026, 7, 9, 23, 59)).getDate(), 3);
eq("week start is midnight", startOfWeek(NOW).getHours(), 0);

console.log("\nweek hours");
eq(
  "counts only logs from this week",
  weekHoursFrom(
    [
      { hours: 2, played_at: "2026-08-06" }, // today
      { hours: 1.5, played_at: "2026-08-03" }, // Monday, in
      { hours: 3, played_at: "2026-08-02" }, // Sunday, previous week — out
      { hours: 9, played_at: "2026-07-20" } // long gone
    ],
    NOW
  ),
  3.5
);
eq("no logs → 0", weekHoursFrom([], NOW), 0);
eq(
  "a malformed played_at is skipped, not NaN",
  weekHoursFrom([{ hours: 2, played_at: "not-a-date" }], NOW),
  0
);
// Float dust: 0.1 + 0.2 is famously 0.30000000000000004, and that would reach
// a widget verbatim.
eq(
  "sums round to one decimal",
  weekHoursFrom(
    [
      { hours: 0.1, played_at: "2026-08-05" },
      { hours: 0.2, played_at: "2026-08-05" }
    ],
    NOW
  ),
  0.3
);

// --- Featured pair -----------------------------------------------------------

console.log("\nfeatured pair");
const items = (over: Array<Partial<Parameters<typeof pickFeaturedItem>[0][number]>>) =>
  over.map((o, i) => ({
    shoe_id: o.shoe_id ?? `s${i + 1}`,
    play_hours: o.play_hours ?? 0,
    sessions: o.sessions ?? 0,
    purchase_price: o.purchase_price ?? null,
    retired: o.retired ?? false,
    last_played_at: o.last_played_at ?? null
  }));

eq(
  "most recently played wins",
  pickFeaturedItem(
    items([
      { shoe_id: "s1", play_hours: 90, last_played_at: "2026-07-01" },
      { shoe_id: "s2", play_hours: 4, last_played_at: "2026-08-05" }
    ])
  )?.shoe_id,
  "s2"
);
eq(
  "nothing played → most worn",
  pickFeaturedItem(items([{ shoe_id: "s1", play_hours: 12 }, { shoe_id: "s2", play_hours: 40 }]))?.shoe_id,
  "s2"
);
eq(
  "retired pairs never feature",
  pickFeaturedItem(
    items([
      { shoe_id: "s1", play_hours: 300, retired: true, last_played_at: "2026-08-06" },
      { shoe_id: "s2", play_hours: 1 }
    ])
  )?.shoe_id,
  "s2"
);
eq("empty closet → null", pickFeaturedItem([]), null);
eq("all retired → null", pickFeaturedItem(items([{ retired: true }])), null);

// --- Reason clamping ---------------------------------------------------------

console.log("\nreason line");
check("short text is untouched", clampReason("Boom foam, wide forefoot.") === "Boom foam, wide forefoot.");
check("collapses whitespace", clampReason("  a\n\n b  ") === "a b");
const longEn = "A very long English recommendation that keeps going well past anything a widget could ever hope to display";
check(`clamped to ${WIDGET_REASON_MAX}`, clampReason(longEn).length <= WIDGET_REASON_MAX, clampReason(longEn).length);
check("clamped text ends with an ellipsis", clampReason(longEn).endsWith("…"));
check("clamped text doesn't end mid-word", !/\s$/.test(clampReason(longEn)));
// CJK has no spaces, so the word-boundary path must not run away with it.
const longZh = "这双鞋的中底非常软弹前掌宽度友好适合后卫打法并且抓地力在室内木地板上表现极好值得入手";
check(`CJK clamped to ${WIDGET_REASON_MAX}`, clampReason(longZh).length <= WIDGET_REASON_MAX, clampReason(longZh).length);

// --- Weekly goal -------------------------------------------------------------
//
// The goal is a divisor for the ring. Zero would be a division by zero and a
// hand-edited localStorage value could be anything at all.

console.log("\nweekly goal clamp");
eq("undefined → default", clampGoal(undefined), DEFAULT_WIDGET_PREFS.weekGoalHours);
eq("zero → default", clampGoal(0), DEFAULT_WIDGET_PREFS.weekGoalHours);
eq("negative → default", clampGoal(-5), DEFAULT_WIDGET_PREFS.weekGoalHours);
eq("NaN → default", clampGoal(Number.NaN), DEFAULT_WIDGET_PREFS.weekGoalHours);
eq("absurd → capped at 40", clampGoal(1000), 40);
eq("snaps to the half hour", clampGoal(6.3), 6.5);

// --- Snapshot assembly -------------------------------------------------------

console.log("\nsnapshot");
const snapshot = buildWidgetSnapshot({
  now: NOW,
  locale: "zh",
  signedIn: true,
  weekGoalHours: 6,
  closet: items([
    { shoe_id: "s1", play_hours: 45, sessions: 20, purchase_price: 1240, last_played_at: "2026-08-06" },
    { shoe_id: "s2", play_hours: 10, sessions: 5 }
  ]),
  wearLogs: [{ hours: 2, played_at: "2026-08-06" }],
  shoesById,
  daily: { shoeId: "s2", reason: "Boom foam." },
  favoriteShoeIds: ["s1", "s2", "s3"],
  favoritesCount: 3
});

eq("carries the version", snapshot.v, WIDGET_SNAPSHOT_VERSION);
eq("features default to on", snapshot.features.closet, true);
eq("features the pair played today", snapshot.closet?.shoeName, "KD 17");
eq("totals cover the active rotation", snapshot.closet?.totalHours, 55);
eq("sessions total", snapshot.closet?.totalSessions, 25);
eq("week hours", snapshot.closet?.weekHours, 2);
eq("cost per session rounds to cents", snapshot.closet?.costPerSession, 62);
eq("wear ratio is hours over cushion life", snapshot.closet?.wearRatio, 45 / CUSHION_LIFE_HOURS);
eq("closet deep link points at the shoe", snapshot.closet?.path, "/shoes/kd-17");
eq("daily pick resolves", snapshot.daily?.title, "Way of Wade 11");
eq("favorites preview holds two", snapshot.favorites?.items.length, 2);
eq("favorites count is the real total", snapshot.favorites?.count, 3);
eq("compare link carries both ids", snapshot.favorites?.comparePath, "/compare?ids=s1,s2");

// Deep links have to survive pathFromDeepLink() — the widget builds the URL, the
// web side parses it, and a mismatch means a dead tap.
console.log("\ndeep links round-trip");
const { pathFromDeepLink } = await import("../lib/native/deep-link");
for (const path of [
  snapshot.closet!.path,
  snapshot.daily!.path,
  snapshot.favorites!.comparePath,
  "/closet",
  "/smart-picker"
]) {
  // Mirrors WidgetLinks.url(for:) in live-widgets/ios/Shared/WidgetLinks.swift:
  // drop the leading slash, the first segment becomes the URL's host.
  const link = `sneakerfeature://${encodeURI(path.slice(1))}`;
  eq(`${path} survives the round trip`, pathFromDeepLink(link), path);
}

console.log("\nsnapshot edge cases");
const empty = buildWidgetSnapshot({
  now: NOW,
  locale: "en",
  signedIn: false,
  closet: [],
  wearLogs: [],
  shoesById,
  daily: null,
  favoriteShoeIds: [],
  favoritesCount: 0
});
eq("signed out → no closet panel", empty.closet, null);
eq("no daily → null", empty.daily, null);
eq("no favorites → null", empty.favorites, null);
eq("no images to resolve", snapshotImages(empty).length, 0);

const unknownShoe = buildWidgetSnapshot({
  now: NOW,
  locale: "en",
  signedIn: true,
  closet: items([{ shoe_id: "gone", play_hours: 3, sessions: 1 }]),
  wearLogs: [],
  shoesById,
  daily: { shoeId: "gone", reason: "x" },
  favoriteShoeIds: ["gone"],
  favoritesCount: 1
});
eq("a shoe missing from the catalogue still yields a panel", unknownShoe.closet !== null, true);
eq("...falling back to the closet link", unknownShoe.closet?.path, "/closet");
eq("...and no daily card at all", unknownShoe.daily, null);
eq("...and a favorites link that can't compare one pair", unknownShoe.favorites?.comparePath, "/favorites");

console.log("\nimage resolution list");
eq("closet + daily + 2 favorites", snapshotImages(snapshot).length, 4);
check(
  "every image starts unresolved",
  snapshotImages(snapshot).every((i) => i.file === null)
);

// --- Preference gating -------------------------------------------------------
//
// Switching a widget off must stop the data being copied out of the app, not
// just stop it being drawn — otherwise "off" is a lie about where the data went.

console.log("\nsettings gate what gets published");
const off = applyWidgetPrefs(snapshot, {
  closetWidget: false,
  dailyWidget: false,
  favoritesWidget: false,
  lockScreenWeek: false,
  weekGoalHours: 6
});
eq("closet flag off", off.features.closet, false);
eq("closet data withheld", off.closet, null);
eq("daily data withheld", off.daily, null);
eq("favorites data withheld", off.favorites, null);

const ringOnly = applyWidgetPrefs(snapshot, {
  closetWidget: false,
  dailyWidget: true,
  favoritesWidget: true,
  lockScreenWeek: true,
  weekGoalHours: 10
});
// The ring reads its hours off the closet panel, so the panel has to survive
// even when the home-screen closet widget itself is switched off.
eq("ring keeps the closet data it needs", ringOnly.closet !== null, true);
eq("but the home-screen widget stays flagged off", ringOnly.features.closet, false);
eq("goal is applied", ringOnly.closet?.weekGoalHours, 10);
eq("original snapshot untouched", snapshot.closet?.weekGoalHours, 6);

// --- Court session timer -----------------------------------------------------

console.log("\ncourt session timer");
const T0 = 1_754_500_000_000;
const session = createCourtSession(
  { id: "cs1", shoeId: "s1", shoeName: "KD 17", shoeBrand: "Nike" },
  T0
);
eq("starts running", session.runningSince, T0);
eq("elapsed at start", elapsedMs(session, T0), 0);
eq("elapsed after 90s", elapsedMs(session, T0 + 90_000), 90_000);
// A phone whose clock jumps backwards (NTP correction, timezone change) must
// not produce negative time.
eq("a backwards clock can't go negative", elapsedMs(session, T0 - 5000), 0);

const paused = pauseSession(session, T0 + 600_000);
eq("pause banks the leg", paused.accumulatedMs, 600_000);
eq("pause stops the clock", paused.runningSince, null);
eq("paused time doesn't grow", elapsedMs(paused, T0 + 3_600_000), 600_000);
eq("pausing twice is a no-op", pauseSession(paused, T0 + 700_000).accumulatedMs, 600_000);

const resumed = resumeSession(paused, T0 + 900_000);
eq("resume picks up the banked time", elapsedMs(resumed, T0 + 900_000), 600_000);
eq("and keeps counting", elapsedMs(resumed, T0 + 1_200_000), 900_000);
eq("resuming twice is a no-op", resumeSession(resumed, T0 + 999_999).runningSince, T0 + 900_000);

console.log("\nlogged hours");
eq("2h rounds to 2", loggableHours(session, T0 + 7_200_000), 2);
eq("1h52m snaps to the nearest 3 minutes", loggableHours(session, T0 + 6_720_000), 1.85);
eq("a 4-second mis-tap logs nothing", loggableHours(session, T0 + 4000), 0);
eq(`${MIN_LOGGABLE_HOURS}h is the floor`, loggableHours(session, T0 + 180_000), MIN_LOGGABLE_HOURS);
// The wear API rejects hours > 24, and the overrun cap should mean we never get
// close — but the clamp is what guarantees a POST can't be rejected.
check("never exceeds the API's 24h ceiling", loggableHours(session, T0 + 40 * 3_600_000) <= 24);
// Every result must be a clean multiple of 0.05 — float dust in a numeric
// column is the kind of thing that only shows up in a chart months later.
for (const ms of [61_000, 599_000, 3_601_000, 7_777_777]) {
  const h = loggableHours(session, T0 + ms);
  check(`${ms}ms → ${h} is exact to 2dp`, Math.abs(h * 100 - Math.round(h * 100)) < 1e-9, h);
}

console.log("\noverrun cap");
check("a normal run isn't overrun", !isOverrun(session, T0 + 3 * 3_600_000));
check("a forgotten run is", isOverrun(session, T0 + 13 * 3_600_000));
eq("and its elapsed time is capped", elapsedMs(session, T0 + 48 * 3_600_000), MAX_SESSION_MS);

console.log("\nclock formatting");
eq("under a minute", formatElapsed(42_000), "00:42");
eq("under an hour", formatElapsed(23 * 60_000 + 45_000), "23:45");
eq("over an hour", formatElapsed(3_600_000 + 23 * 60_000 + 45_000), "1:23:45");
eq("zero", formatElapsed(0), "00:00");
eq("negative reads as zero", formatElapsed(-500), "00:00");

console.log("\nplayed-at date");
// A run that starts at 22:30 and ends after midnight belongs to the night the
// user remembers playing, not to the calendar day it happened to end on.
const lateNight = createCourtSession(
  { id: "cs2", shoeId: "s1", shoeName: "KD 17", shoeBrand: "Nike" },
  new Date(2026, 7, 6, 22, 30).getTime()
);
eq(
  "a run past midnight logs on the day it started",
  sessionPlayedAt(lateNight, new Date(2026, 7, 7, 0, 15).getTime()),
  "2026-08-06"
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
