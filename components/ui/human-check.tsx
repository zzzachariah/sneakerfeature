"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";

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

const SCRIPT_TIMEOUT_MS = 8000;

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

  useEffect(() => {
    if (!siteKey) return;

    setFailed(false);

    const scriptId = "cf-turnstile-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const onScriptError = () => setFailed(true);
    script.addEventListener("error", onScriptError);

    const timer = window.setInterval(() => {
      if (window.turnstile) {
        window.clearInterval(timer);
        const container = document.getElementById(id);
        if (container && !widgetId.current) {
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
    }, 150);

    const timeoutHandle = window.setTimeout(() => {
      if (!widgetId.current) {
        window.clearInterval(timer);
        setFailed(true);
      }
    }, SCRIPT_TIMEOUT_MS);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(timeoutHandle);
      script?.removeEventListener("error", onScriptError);
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [id, action, onToken, siteKey]);

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
      <div id={id} />
    </div>
  );
}
