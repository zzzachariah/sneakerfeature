"use client";

// Per-device preferences for the home-screen widgets and Live Activities.
//
// Device-local (localStorage), not account-level, for the same reason haptics
// are: the widgets on your iPhone's home screen have nothing to do with the
// iPad you also signed into. Defaults are on, so a member who never opens
// settings still gets the feature — the switches exist to turn things off.
//
// These gate *publishing*, not just rendering. A user who switches off the
// daily-shoe widget stops having their recommendation copied into the shared
// App Group container at all, rather than having it written and ignored. The
// widget itself can't be removed from the home screen by the app; when its data
// disappears it renders its "turned off in settings" state.

export const WIDGET_FEATURES = [
  "closetWidget",
  "dailyWidget",
  "favoritesWidget",
  "lockScreenWeek",
  "courtActivity",
  "pickerActivity"
] as const;

export type WidgetFeature = (typeof WIDGET_FEATURES)[number];

export type WidgetPrefs = Record<WidgetFeature, boolean> & { weekGoalHours: number };

const STORAGE_KEY = "sf:widget-prefs";

export const DEFAULT_WIDGET_PREFS: WidgetPrefs = {
  closetWidget: true,
  dailyWidget: true,
  favoritesWidget: true,
  lockScreenWeek: true,
  courtActivity: true,
  pickerActivity: true,
  weekGoalHours: 6
};

function isFeature(key: string): key is WidgetFeature {
  return (WIDGET_FEATURES as readonly string[]).includes(key);
}

export function readWidgetPrefs(): WidgetPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_WIDGET_PREFS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WIDGET_PREFS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_WIDGET_PREFS };
    const next = { ...DEFAULT_WIDGET_PREFS };
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isFeature(key) && typeof value === "boolean") next[key] = value;
    }
    const goal = (parsed as { weekGoalHours?: unknown }).weekGoalHours;
    if (typeof goal === "number" && Number.isFinite(goal)) {
      next.weekGoalHours = Math.min(40, Math.max(1, Math.round(goal * 2) / 2));
    }
    return next;
  } catch {
    // Private mode, quota, or a hand-edited value — defaults are always safe.
    return { ...DEFAULT_WIDGET_PREFS };
  }
}

export function writeWidgetPrefs(prefs: WidgetPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — the in-memory value still applies this session */
  }
  // Settings and the widget-sync effect live in different React trees, so the
  // change is broadcast rather than lifted into shared state. `storage` only
  // fires in *other* tabs, which is exactly the case this event covers.
  window.dispatchEvent(new CustomEvent(WIDGET_PREFS_EVENT));
}

export const WIDGET_PREFS_EVENT = "sf:widget-prefs-changed";
