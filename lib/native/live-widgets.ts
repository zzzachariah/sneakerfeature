"use client";

// Bridge to the native home-screen widgets, Dynamic Island and lock-screen Live
// Activities (the LiveWidgets Capacitor plugin — see live-widgets/).
//
// Everything here is safe to call anywhere. On the web, in an older build of
// the shell, or on a platform that has no widgets, every function resolves to
// the "nothing happened" value rather than throwing: the web app must never
// depend on the plugin being there, because a shell update ships on Apple's
// schedule while the site ships on ours.
//
// Images are downloaded by *native*, not here. A widget process cannot fetch,
// so the picture has to be sitting in the shared App Group container before the
// widget draws — and doing the download on the native side skips the whole
// CORS/canvas/base64 detour a web-side fetch would need.

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { WidgetSnapshot } from "@/lib/widgets/snapshot";
import { snapshotImages } from "@/lib/widgets/snapshot";

/** Which native surfaces this device actually supports. */
export type LiveWidgetsSupport = {
  /** The plugin is present at all. False on web and on older shells. */
  available: boolean;
  /** WidgetKit / AppWidget host present — home-screen widgets can be added. */
  widgets: boolean;
  /** ActivityKit (iOS 16.1+) present *and* the user hasn't disabled activities. */
  liveActivities: boolean;
};

const UNSUPPORTED: LiveWidgetsSupport = { available: false, widgets: false, liveActivities: false };

/**
 * A start/stop that happened in a widget or the Live Activity while the app was
 * away. `shoeName` / `shoeBrand` ride along on a start so the app can label the
 * run it's adopting without a round trip — native already knew them, and the
 * web layer would otherwise have to look the id up before it could draw a bar.
 */
export type PendingCourtIntent =
  | { kind: "start"; sessionId: string; shoeId: string; shoeName?: string; shoeBrand?: string; at: number }
  | { kind: "end"; sessionId: string; shoeId: string; at: number; elapsedMs: number };

export type NativeCourtSession = {
  id: string;
  shoeId: string;
  shoeName?: string;
  shoeBrand?: string;
  startedAt: number;
  runningSince: number | null;
  accumulatedMs: number;
};

interface LiveWidgetsPlugin {
  isAvailable(): Promise<LiveWidgetsSupport>;
  publishSnapshot(options: { json: string }): Promise<void>;
  cacheImage(options: { key: string; url: string }): Promise<{ file: string | null }>;
  pruneImages(options: { keep: string[] }): Promise<void>;
  startCourtSession(options: {
    id: string;
    shoeId: string;
    shoeName: string;
    shoeBrand: string;
    imageFile: string | null;
    startedAt: number;
    totalHours: number;
    totalSessions: number;
    returnPath: string;
  }): Promise<void>;
  updateCourtSession(options: {
    id: string;
    runningSince: number | null;
    accumulatedMs: number;
    returnPath?: string;
  }): Promise<void>;
  endCourtSession(options: { id: string; loggedHours: number; resultPath: string }): Promise<void>;
  getCourtSession(): Promise<{ session: NativeCourtSession | null }>;
  takePendingCourtIntents(): Promise<{ intents: PendingCourtIntent[] }>;
  startPickerActivity(options: { id: string; prompt: string; path: string }): Promise<void>;
  endPickerActivity(options: { id: string; summary: string; failed: boolean }): Promise<void>;
}

let cachedPlugin: LiveWidgetsPlugin | null | undefined;

function plugin(): LiveWidgetsPlugin | null {
  if (cachedPlugin !== undefined) return cachedPlugin;
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
    cachedPlugin = null;
    return null;
  }
  try {
    cachedPlugin = registerPlugin<LiveWidgetsPlugin>("LiveWidgets");
  } catch {
    cachedPlugin = null;
  }
  return cachedPlugin;
}

let supportPromise: Promise<LiveWidgetsSupport> | null = null;

/**
 * What this device can do. Cached for the page's lifetime — the answer depends
 * on the installed shell and the OS version, neither of which changes under us.
 */
export function liveWidgetsSupport(): Promise<LiveWidgetsSupport> {
  if (!supportPromise) {
    const p = plugin();
    supportPromise = p
      ? p
          .isAvailable()
          .then((r) => ({
            available: Boolean(r?.available),
            widgets: Boolean(r?.widgets),
            liveActivities: Boolean(r?.liveActivities)
          }))
          // An older shell has no `isAvailable` and rejects with "not implemented".
          .catch(() => UNSUPPORTED)
      : Promise.resolve(UNSUPPORTED);
  }
  return supportPromise;
}

// --- Snapshot publishing -----------------------------------------------------

// url → cached filename, so a shoe image is downloaded once per device instead
// of on every app open. Kept in localStorage because the native cache outlives
// the WebView; a stale entry costs at most one missing image until the next
// publish, and pruneImages() is what actually reclaims the disk.
const IMAGE_MAP_KEY = "sf:widget-images";

function readImageMap(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(IMAGE_MAP_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeImageMap(map: Record<string, string>): void {
  try {
    window.localStorage.setItem(IMAGE_MAP_KEY, JSON.stringify(map));
  } catch {
    /* storage full or unavailable — we just re-download next time */
  }
}

/**
 * A short, stable, filename-safe key for a URL (FNV-1a, 32-bit, hex). Not a
 * security hash: it only has to name a cache file and survive a URL with query
 * params, slashes and CJK in it.
 */
export function imageKey(url: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    // FNV prime 16777619, kept in 32-bit range via Math.imul.
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Publishes a snapshot to the widgets, resolving its images first.
 *
 * Image failures are not snapshot failures: a shoe whose picture won't download
 * still gets its name, hours and cost-per-wear on the widget. Returns false
 * when there was nothing to publish to.
 */
export async function publishWidgetSnapshot(input: WidgetSnapshot): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  const support = await liveWidgetsSupport();
  if (!support.available) return false;

  // Resolving images rewrites them in place, and applyWidgetPrefs only copies
  // the top level — its nested image objects are still shared with whatever the
  // caller is holding. Clone first so publishing can never mutate the caller's
  // snapshot out from under it.
  const snapshot: WidgetSnapshot = JSON.parse(JSON.stringify(input));

  const map = readImageMap();
  const keep: string[] = [];
  let mapDirty = false;

  // Resolve every image the snapshot references. Sequential on purpose: this
  // runs on app open against a possibly-cellular connection, and three parallel
  // image downloads would compete with the page the user is actually reading.
  for (const image of snapshotImages(snapshot)) {
    const url = image.url;
    image.url = null; // native never needs the URL; don't write it to disk
    if (!url) continue;

    const key = imageKey(url);
    const known = map[url];
    if (known) {
      image.file = known;
      keep.push(known);
      continue;
    }
    try {
      const res = await p.cacheImage({ key, url });
      if (res?.file) {
        image.file = res.file;
        map[url] = res.file;
        mapDirty = true;
        keep.push(res.file);
      }
    } catch {
      /* offline, 404, or an unsupported format — render without the picture */
    }
  }

  if (mapDirty) writeImageMap(map);

  try {
    await p.publishSnapshot({ json: JSON.stringify(snapshot) });
  } catch {
    return false;
  }

  // Drop images no longer referenced. Done after publishing so a failed publish
  // never deletes the pictures the widget is still showing.
  try {
    await p.pruneImages({ keep });
  } catch {
    /* best effort */
  }
  return true;
}

// --- Court session Live Activity ---------------------------------------------

export async function startCourtActivity(input: {
  id: string;
  shoeId: string;
  shoeName: string;
  shoeBrand: string;
  imageUrl: string | null;
  startedAt: number;
  totalHours: number;
  totalSessions: number;
  /** Where a tap on the Island should land right now. */
  returnPath: string;
}): Promise<void> {
  const p = plugin();
  if (!p) return;
  const support = await liveWidgetsSupport();
  if (!support.liveActivities) return;

  let imageFile: string | null = null;
  if (input.imageUrl) {
    const map = readImageMap();
    imageFile = map[input.imageUrl] ?? null;
    if (!imageFile) {
      try {
        const res = await p.cacheImage({ key: imageKey(input.imageUrl), url: input.imageUrl });
        if (res?.file) {
          imageFile = res.file;
          map[input.imageUrl] = res.file;
          writeImageMap(map);
        }
      } catch {
        /* the card renders fine with just the name */
      }
    }
  }

  try {
    await p.startCourtSession({
      id: input.id,
      shoeId: input.shoeId,
      shoeName: input.shoeName,
      shoeBrand: input.shoeBrand,
      imageFile,
      startedAt: input.startedAt,
      totalHours: input.totalHours,
      totalSessions: input.totalSessions,
      returnPath: input.returnPath
    });
  } catch {
    /* the timer still runs in the app; only the Island is missing */
  }
}

/**
 * Pushes the session's shape to native. `returnPath` is optional and omitting it
 * means "unchanged" — a pause shouldn't forget the page the user was on.
 */
export async function updateCourtActivity(input: {
  id: string;
  runningSince: number | null;
  accumulatedMs: number;
  returnPath?: string;
}): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.updateCourtSession(input);
  } catch {
    /* best effort */
  }
}

/**
 * Ends the activity. `resultPath` is where the farewell card sends a tap — the
 * receipt for the run that just finished, so the Island stays useful for the
 * few seconds it lingers instead of dumping the user on the home screen.
 */
export async function endCourtActivity(
  id: string,
  loggedHours: number,
  resultPath: string
): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.endCourtSession({ id, loggedHours, resultPath });
  } catch {
    /* best effort */
  }
}

/** The session native believes is running — used to adopt one started from a widget. */
export async function readNativeCourtSession(): Promise<NativeCourtSession | null> {
  const p = plugin();
  if (!p) return null;
  try {
    const res = await p.getCourtSession();
    return res?.session ?? null;
  } catch {
    return null;
  }
}

/**
 * Drains starts/stops that happened outside the WebView — a tap on the widget's
 * "开场" button, or "结束" in the Dynamic Island while the app was closed.
 * Native clears its queue as it hands these over, so each is delivered once.
 */
export async function takePendingCourtIntents(): Promise<PendingCourtIntent[]> {
  const p = plugin();
  if (!p) return [];
  try {
    const res = await p.takePendingCourtIntents();
    return Array.isArray(res?.intents) ? res.intents : [];
  } catch {
    return [];
  }
}

// --- Smart Picker Live Activity ----------------------------------------------

export async function startPickerActivity(input: {
  id: string;
  prompt: string;
  path: string;
}): Promise<void> {
  const p = plugin();
  if (!p) return;
  const support = await liveWidgetsSupport();
  if (!support.liveActivities) return;
  try {
    await p.startPickerActivity(input);
  } catch {
    /* best effort */
  }
}

export async function endPickerActivity(input: {
  id: string;
  summary: string;
  failed?: boolean;
}): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.endPickerActivity({ id: input.id, summary: input.summary, failed: Boolean(input.failed) });
  } catch {
    /* best effort */
  }
}
