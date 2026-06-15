"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { NativeChrome, NATIVE_HOME_SEARCH_EVENT } from "@/components/native/native-chrome";
import { useLocale } from "@/components/i18n/locale-provider";

// Shows a native glass search bar (under the native top bar) only on the home
// route and relays its text to the home feed via a window event. The web search
// box is hidden in-app via the `native-search-active` class. No-op everywhere
// except the iOS app with the plugin compiled in.
const nativeBarAvailable = () =>
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === "ios" &&
  Capacitor.isPluginAvailable("NativeChrome");

export function NativeHomeSearch() {
  const pathname = usePathname();
  const { translate } = useLocale();
  const onHome = pathname === "/" || pathname.startsWith("/search");

  // One searchChanged listener → broadcast to the feed.
  useEffect(() => {
    if (!nativeBarAvailable()) return;
    let remove: (() => void) | undefined;
    void (async () => {
      const handle = await NativeChrome.addListener("searchChanged", ({ text }) => {
        window.dispatchEvent(new CustomEvent(NATIVE_HOME_SEARCH_EVENT, { detail: { text: text ?? "" } }));
      });
      remove = () => void handle.remove();
    })();
    return () => remove?.();
  }, []);

  // Show on home, hide elsewhere.
  useEffect(() => {
    if (!nativeBarAvailable()) return;
    const root = document.documentElement;
    if (onHome) {
      void NativeChrome.configureSearch({ placeholder: translate("Search shoes…") });
      void NativeChrome.setSearchVisible({ visible: true });
      root.classList.add("native-search-active");
    } else {
      void NativeChrome.setSearchVisible({ visible: false });
      root.classList.remove("native-search-active");
    }
    return () => {
      root.classList.remove("native-search-active");
      void NativeChrome.setSearchVisible({ visible: false });
    };
  }, [onHome, translate]);

  return null;
}
