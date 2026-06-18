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

// True only inside the native iOS app. Used to suppress analytics/advertising
// cookies and the cookie-consent prompt there, so the app does not track users
// (App Store Review Guideline 5.1.2(i)). Web and Android keep their behaviour.
export function isIosNativeApp(): boolean {
  return nativePlatform() === "ios";
}

export type ShareInput = { title?: string; text?: string; url?: string; files?: File[] };

// Opens the native share sheet inside the app; falls back to the Web Share API,
// then to copying the URL to the clipboard, so the same call works everywhere.
//
// When `files` are provided we use the Web Share API's file support, which is
// available both in the Capacitor WebView (iOS/Android) and on mobile web — the
// resulting OS sheet exposes "Save Image" / "Add to Photos" so the user can save
// to their album. `@capacitor/share` is still used for the plain text/url path.
export async function shareContent(input: ShareInput): Promise<void> {
  const { files, ...meta } = input;

  if (files && files.length > 0) {
    await shareFiles(files, meta);
    return;
  }

  if (isNativeApp()) {
    const { Share } = await import("@capacitor/share");
    await Share.share(meta);
    return;
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(meta);
      return;
    } catch {
      // user cancelled or the gesture was rejected — fall through to clipboard
    }
  }
  if (meta.url && typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(meta.url);
    } catch {
      /* ignore */
    }
  }
}

// True when the current environment can share the given files through the OS
// share sheet (which is what lets the user save an image to their album).
export function canShareFiles(files: File[]): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files });
  } catch {
    return false;
  }
}

// Shares files via the Web Share API. Returns true if the share sheet was
// invoked (or the user dismissed it), false if file-sharing is unsupported so
// the caller can fall back (e.g. to a download on desktop web).
export async function shareFiles(files: File[], meta?: ShareInput): Promise<boolean> {
  if (!canShareFiles(files)) return false;
  try {
    await (navigator as Navigator).share({
      files,
      title: meta?.title,
      text: meta?.text
    } as ShareData);
    return true;
  } catch {
    // User cancelled the sheet, or the gesture was rejected. Either way the
    // file-share path was available, so don't fall back to a download.
    return true;
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
