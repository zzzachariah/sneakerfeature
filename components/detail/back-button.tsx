"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { NativeChrome } from "@/components/native/native-chrome";
import { nativeMenuAvailable } from "@/components/native/native-menu";
import { useLocale } from "@/components/i18n/locale-provider";

// Floating back control for the shoe-detail page (returns to the previous screen,
// falling back to home on direct entry). On web/Android it's a CSS liquid-glass
// pill; inside the iOS app it's superseded by a REAL system Liquid Glass button
// (UIGlassEffect) owned by native-chrome's NativeBackController — the same
// resolve-then-supersede pattern as the home-feed FAB. The web pill stays as the
// fallback until configureBack resolves, so a missing/unsynced plugin never
// leaves the page without a back affordance.
export function BackButton() {
  const router = useRouter();
  const { translate } = useLocale();
  // Flips true ONLY after configureBack resolves (which hides the web pill).
  const [nativeReady, setNativeReady] = useState(false);

  // Keep the navigate-back action in a ref so the (stable) native `backTap`
  // listener always invokes the latest router without resubscribing.
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;

  // Configure the native button + wire its tap, then show it. Re-runs on locale
  // change so the accessibility label tracks the active language (mirrors how the
  // native top bar / FAB reconfigure). Only after configureBack resolves do we
  // flip nativeReady, which swaps the web pill for an (empty) layout slot.
  useEffect(() => {
    if (!nativeMenuAvailable()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        await NativeChrome.configureBack({ symbol: "chevron.left", label: translate("Back") });
        if (cancelled) return;
        setNativeReady(true);
        await NativeChrome.setBackVisible({ visible: true });
        const handle = await NativeChrome.addListener("backTap", () => goBackRef.current());
        remove = () => void handle.remove();
      } catch (err) {
        console.warn("[native-chrome] configureBack failed — keeping the web back button:", err);
      }
    })();
    return () => {
      cancelled = true;
      remove?.();
      // Hide the native button when leaving the detail page so it never lingers
      // over other routes.
      if (nativeMenuAvailable()) void NativeChrome.setBackVisible({ visible: false });
    };
  }, [translate]);

  // Native button is live → keep the flex slot (so the sign-in nudge stays on the
  // right) but render it empty; Swift draws the real glass button over this spot.
  if (nativeReady) return <span aria-hidden className="block h-9 w-9 shrink-0" />;

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={translate("Back")}
      className="tap-44 liquid-glass glass-rim pointer-events-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[rgb(var(--text))] transition active:scale-95"
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
  );
}
