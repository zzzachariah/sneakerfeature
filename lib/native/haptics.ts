// Semantic haptic feedback for the native app.
//
// Design (per product decisions): key moments are stronger, routine taps are
// light; iOS gets the full set while Android — whose haptics are coarser — only
// fires on key moments to avoid a cheap buzz. Everything no-ops on the web and
// when the user turns haptics off (stored per-device in localStorage, default
// on). Respecting the system's silent/vibrate setting is handled by the OS.
import { Capacitor } from "@capacitor/core";

const STORAGE_KEY = "haptics-enabled";

export function isHapticsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) !== "0";
}

export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

function active(): boolean {
  return Capacitor.isNativePlatform() && isHapticsEnabled();
}

function isAndroid(): boolean {
  return Capacitor.getPlatform() === "android";
}

async function impact(style: "Light" | "Medium" | "Heavy"): Promise<void> {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle[style] });
  } catch {
    /* haptics unavailable */
  }
}

async function notify(type: "Success" | "Warning" | "Error"): Promise<void> {
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType[type] });
  } catch {
    /* haptics unavailable */
  }
}

export const haptics = {
  // Routine, light — buttons, taps, selections. Skipped on Android (too coarse).
  tap() {
    if (!active() || isAndroid()) return;
    void impact("Light");
  },
  selection() {
    if (!active() || isAndroid()) return;
    void impact("Light");
  },
  // Key moments — fired on both platforms.
  success() {
    if (!active()) return;
    void notify("Success");
  },
  warning() {
    if (!active()) return;
    void notify("Warning");
  },
  error() {
    if (!active()) return;
    void notify("Error");
  },
  // Gesture thresholds / important confirms — a firmer medium tick.
  gesture() {
    if (!active()) return;
    void impact("Medium");
  },
  heavy() {
    if (!active()) return;
    void impact("Heavy");
  }
};
