// Helpers for talking to the Capacitor native shell from the web app.
//
// Everything here is safe to call in a normal browser: each function detects
// whether it is running inside the native app and otherwise falls back to a
// web API or no-ops. Plugin packages are dynamically imported so they never run
// during SSR or get bundled into the server build.
import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativePlatform(): "ios" | "android" | "web" {
  const platform = Capacitor.getPlatform();
  return platform === "ios" || platform === "android" ? platform : "web";
}

export type ShareInput = { title?: string; text?: string; url?: string };

// Opens the native share sheet inside the app; falls back to the Web Share API,
// then to copying the URL to the clipboard, so the same call works everywhere.
export async function shareContent(input: ShareInput): Promise<void> {
  if (isNativeApp()) {
    const { Share } = await import("@capacitor/share");
    await Share.share(input);
    return;
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(input);
      return;
    } catch {
      // user cancelled or the gesture was rejected — fall through to clipboard
    }
  }
  if (input.url && typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(input.url);
    } catch {
      /* ignore */
    }
  }
}

// A light haptic tap for primary actions; no-ops on the web.
export async function hapticTap(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* haptics unavailable */
  }
}
