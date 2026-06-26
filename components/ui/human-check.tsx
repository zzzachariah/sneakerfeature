"use client";

import { useId, useRef, useState } from "react";
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
      remove: (widgetId: string) => void;
    };
  }
}

type Props = {
  // A short label for the action being protected (login/register/comment/...).
  // Passed through to Turnstile's `action` field for analytics; optional.
  action?: string;
  onToken: (token: string) => void;
};

export function HumanCheck({ action, onToken }: Props) {
  const { translate } = useLocale();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const id = useId().replace(/:/g, "");
  const widgetId = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

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
}
