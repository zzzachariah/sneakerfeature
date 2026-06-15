"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/i18n/locale-provider";

/**
 * Cookie / analytics consent.
 *
 * - {@link CookieConsentProvider} stores the choice ("accepted" | "rejected") in
 *   localStorage and exposes it via {@link useCookieConsent}.
 * - {@link CookieBanner} prompts first-time visitors (rendered only after the
 *   stored value is read, so there is no SSR/hydration flash).
 * - {@link AnalyticsGate} loads the cookie-setting Google Analytics/Ads scripts
 *   ONLY after the visitor accepts. Vercel's cookieless analytics stay in the
 *   root layout and are not gated here.
 */

type Consent = "accepted" | "rejected" | null;
const STORAGE_KEY = "cookie-consent";

type ConsentContextValue = {
  consent: Consent;
  ready: boolean;
  setConsent: (value: "accepted" | "rejected") => void;
  reopen: () => void;
};

const CookieConsentContext = createContext<ConsentContextValue | null>(null);

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsentState] = useState<Consent>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "accepted" || stored === "rejected") setConsentState(stored);
    } catch {
      /* ignore storage access errors */
    }
    setReady(true);
  }, []);

  const setConsent = useCallback((value: "accepted" | "rejected") => {
    setConsentState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  const reopen = useCallback(() => {
    setConsentState(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <CookieConsentContext.Provider value={{ consent, ready, setConsent, reopen }}>
      {children}
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent() {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) throw new Error("useCookieConsent must be used within a CookieConsentProvider");
  return ctx;
}

export function CookieBanner() {
  const { consent, ready, setConsent } = useCookieConsent();
  const { locale } = useLocale();
  const zh = locale === "zh";

  // Only show once we've read the stored choice and the visitor hasn't decided.
  if (!ready || consent !== null) return null;

  return (
    <div
      data-no-translate="true"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(var(--mobile-nav-h)+1rem)] pt-2 md:pb-4"
    >
      <div className="container-shell">
        <div className="glass-strong glass-rim glass-clip relative mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl p-4 md:flex-row md:items-center md:gap-4 md:p-5">
          <p className="text-[0.82rem] leading-[1.6] soft-text md:flex-1">
            {zh ? (
              <>
                我们使用 Cookie 及类似技术进行分析以改进网站。点击“接受”即表示同意非必要的分析类
                Cookie。详见{" "}
                <Link href="/privacy" className="text-[rgb(var(--text))] underline-offset-4 hover:underline">
                  隐私政策
                </Link>
                。
              </>
            ) : (
              <>
                We use cookies and similar technologies for analytics to improve the site. Click
                “Accept” to allow non-essential analytics cookies. See our{" "}
                <Link href="/privacy" className="text-[rgb(var(--text))] underline-offset-4 hover:underline">
                  Privacy Policy
                </Link>
                .
              </>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              className="px-4 text-[0.85rem]"
              onClick={() => setConsent("rejected")}
            >
              {zh ? "拒绝" : "Reject"}
            </Button>
            <Button className="px-5 text-[0.85rem]" onClick={() => setConsent("accepted")}>
              {zh ? "接受" : "Accept"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsGate() {
  const { consent } = useCookieConsent();
  const gaId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

  if (consent !== "accepted" || !gaId) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
      <Script id="google-ads-gtag" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaId}');
        `}
      </Script>
    </>
  );
}
