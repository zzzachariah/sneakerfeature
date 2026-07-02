"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import Script from "next/script";

// Cloudflare Turnstile human-verification widget. Renders the Cloudflare
// challenge and hands the resulting token to the form; the protected API route
// verifies it server-side via lib/turnstile.ts. The token is validated by
// Cloudflare (single-use, unforgeable), unlike a purely client-side check.
//
// The component name / props are kept generic ("HumanCheck") so every call site
// stays provider-agnostic.

declare global {
  interface Window {
    turnstile?: {
      render: (selector: string | HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

// Imperative handle for forms: tokens are single-use — the server burns one on
// every verify call, even when the request itself fails (wrong password, taken
// username, ...). Forms must call reset() after any attempt that reached the
// server so the widget issues a fresh token; resubmitting the old token always
// fails verification while the widget still shows its stale "Success" state.
export type HumanCheckHandle = {
  reset: () => void;
};

type Props = {
  // A short label for the action being protected (login/register/comment/...).
  // Passed through to Turnstile's `action` field for analytics; optional.
  action?: string;
  onToken: (token: string) => void;
};

export const HumanCheck = forwardRef<HumanCheckHandle, Props>(function HumanCheck({ action, onToken }, ref) {
  const { translate } = useLocale();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const id = useId().replace(/:/g, "");
  const widgetId = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    reset() {
      // Demo mode / widget not rendered yet: nothing to reset (the demo token
      // is not single-use, so it stays valid across attempts).
      if (!widgetId.current || !window.turnstile) return;
      onToken("");
      try {
        window.turnstile.reset(widgetId.current);
      } catch {
        // Widget was torn down (script removed on retry); the fresh render
        // will call back with a new token anyway.
      }
    }
  }));

  function handleScriptLoad() {
    const container = document.getElementById(id);
    if (container && !widgetId.current && window.turnstile && siteKey) {
      widgetId.current = window.turnstile.render(container, {
        sitekey: siteKey,
        theme: "auto",
        action,
        callback: (token: string) => onToken(token),
        "error-callback": () => setFailed(true),
        "expired-callback": () => onToken("")
      });
    }
  }

  // If the Turnstile script was already loaded before this component mounted
  // (SPA navigation between pages that both include HumanCheck), the Script
  // onLoad won't fire again. Fall back to rendering immediately on mount.
  useEffect(() => {
    if (siteKey && window.turnstile) handleScriptLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!siteKey) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
        {translate("Turnstile is not configured. Demo verification mode is active.")}
        <button type="button" className="ml-2 underline" onClick={() => onToken("demo-token")}>
          {translate("Use demo token")}
        </button>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-200">
        {translate("Verification failed to load. Check your network or try again.")}
        <button
          type="button"
          className="ml-2 underline"
          onClick={() => {
            const existing = document.getElementById("cf-turnstile-script");
            existing?.parentNode?.removeChild(existing);
            setFailed(false);
          }}
        >
          {translate("Retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[66px] justify-center md:justify-start">
      <Script
        id="cf-turnstile-script"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={handleScriptLoad}
        onError={() => setFailed(true)}
      />
      <div id={id} />
    </div>
  );
});
