import { Capacitor } from "@capacitor/core";
import { NativeChrome, type NativeMenuItem, type NativeOptionItem } from "@/components/native/native-chrome";
import { webConfirm } from "@/components/native/web-confirm";

// True only inside the iOS app with the native-chrome plugin compiled in. Use
// this to decide whether to swap a web dropdown / window.confirm for a native
// (Liquid Glass) action sheet / alert.
export const nativeMenuAvailable = () =>
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === "ios" &&
  Capacitor.isPluginAvailable("NativeChrome");

/** Present a native action-sheet menu; resolves to the chosen key or null (cancel). */
export async function presentNativeMenu(
  items: NativeMenuItem[],
  opts?: { title?: string; message?: string; cancelLabel?: string }
): Promise<string | null> {
  const { key } = await NativeChrome.presentMenu({ items, ...opts });
  return key;
}

/**
 * Present the native Liquid Glass options sheet (icon + title + subtitle rows,
 * checkmark on the current choice, locked rows grayed out). Resolves to the
 * chosen key or null (dismissed). Callers must guard with nativeMenuAvailable().
 */
export async function presentNativeOptions(
  items: NativeOptionItem[],
  opts?: { title?: string }
): Promise<string | null> {
  const { key } = await NativeChrome.presentOptions({ items, ...opts });
  return key;
}

/** Native confirm alert; resolves true if confirmed. */
export async function nativeConfirm(opts: {
  title?: string;
  message?: string;
  okLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { confirmed } = await NativeChrome.confirm(opts);
  return confirmed;
}

/**
 * Confirm a (usually destructive) action with the native glass alert inside the
 * iOS app, falling back to the in-app web dialog everywhere else. Lets call
 * sites use one async call instead of branching on the platform themselves.
 *
 * Deliberately NOT window.confirm: browsers suppress it in embedded WebViews,
 * sandboxed frames and after the "block additional dialogs" prompt, and a
 * suppressed confirm() returns false with nothing drawn — so every guarded
 * action silently no-ops and the button looks dead. webConfirm always paints.
 */
export async function confirmDialog(opts: {
  title?: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (nativeMenuAvailable()) return nativeConfirm(opts);
  if (typeof window === "undefined") return false;
  return webConfirm(opts);
}
