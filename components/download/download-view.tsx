"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import { Apple, Smartphone, Download, Copy, Check, Info } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Modal } from "@/components/ui/modal";

const GITHUB_REPO = "zzzachariah/sneakerfeature";
// Same-origin streaming proxy (app/api/download/android). GitHub's release CDN
// (objects.githubusercontent.com) is blocked/throttled in mainland China, where
// a direct link just hangs on a blank page. This route streams the APK through
// our own domain, which IS reachable there. It is the default/fallback; when the
// client can reach GitHub we upgrade to the direct release URL (faster, and
// keeps the bulk of downloads off our own bandwidth) — see the effect below.
const PROXY_APK_URL = "/api/download/android";
// Live App Store link. The app is published in the US storefront; users on other
// storefronts need a US Apple ID to download it (see the modal below).
const IOS_APP_STORE_URL = "https://apps.apple.com/us/app/sneakerfeature/id6780938606";
// Shared US Apple ID for visitors who don't have one. Surfaced from the
// download page so anyone in mainland China can still install the iOS build.
const US_APPLE_ID_EMAIL = "kevinchospi@outlook.com";
const US_APPLE_ID_PASSWORD = "Jx135790";

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  // iPadOS 13+ reports as Macintosh but is touch-capable.
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document)) {
    return "ios";
  }
  return "other";
}

export function DownloadView() {
  const { translate } = useLocale();
  const [platform, setPlatform] = useState<Platform>("other");
  const [apkUrl, setApkUrl] = useState(PROXY_APK_URL);
  // Inside the Capacitor native shell the WebView has no DownloadListener, so a
  // same-window navigation to the APK binary just renders a blank/white page and
  // strands the app. Capacitor routes target="_blank" link taps to the system
  // browser (onCreateWindow → ACTION_VIEW), which downloads the APK properly. In
  // a normal browser we keep the plain same-tab download (no _blank).
  const [isNative, setIsNative] = useState(false);
  const [showUsAccount, setShowUsAccount] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  // Probe GitHub for the newest *mobile* release's APK. If reachable, download
  // straight from GitHub (faster, no proxy bandwidth) and pick the newest
  // mobile-v* asset so a later desktop release can't shadow "latest". If the
  // probe fails (offline, rate-limited, or GitHub blocked as in mainland China),
  // keep the same-origin proxy URL, which streams the APK through our own domain.
  useEffect(() => {
    let cancelled = false;
    fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((releases) => {
        if (cancelled || !Array.isArray(releases)) return;
        const mobile = releases.find(
          (r) =>
            r && !r.draft && !r.prerelease && typeof r.tag_name === "string" && r.tag_name.startsWith("mobile-v")
        );
        const apk = mobile?.assets?.find(
          (a: { name?: string }) => typeof a.name === "string" && a.name.endsWith(".apk")
        );
        if (apk?.browser_download_url) setApkUrl(apk.browser_download_url);
      })
      .catch(() => {
        /* keep the fallback URL */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      className="mx-auto w-full max-w-3xl px-5 pt-12 sm:pt-16"
      style={{ paddingBottom: "calc(var(--mobile-nav-h) + 3rem)" }}
    >
      <header className="text-center">
        <div className="text-4xl">👟</div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          {translate("get the app")}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-[rgb(var(--text)/0.65)]">
          {translate("use sneakerfeature on your phone — native app for iOS and android.")}
        </p>
      </header>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {/* Android */}
        <section
          className={`flex flex-col rounded-2xl border p-6 ${
            platform === "android"
              ? "border-[rgb(var(--accent)/0.55)] bg-[rgb(var(--accent)/0.08)]"
              : "border-[rgb(var(--text)/0.12)]"
          }`}
        >
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" aria-hidden />
            <h2 className="text-lg font-medium">Android</h2>
            {platform === "android" ? (
              <span className="ml-auto rounded-full bg-[rgb(var(--accent)/0.18)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--accent))]">
                {translate("recommended for your device")}
              </span>
            ) : null}
          </div>

          <a
            href={apkUrl}
            target={isNative ? "_blank" : undefined}
            rel={isNative ? "noopener noreferrer" : undefined}
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[rgb(var(--text))] px-4 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90"
          >
            <Download className="h-4 w-4" aria-hidden />
            {translate("download apk")}
          </a>
          <p className="mt-3 text-xs text-[rgb(var(--text)/0.55)]">
            {translate("works on mainland china networks — no app store needed.")}
          </p>

          <div className="mt-5 border-t border-[rgb(var(--text)/0.1)] pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--text)/0.5)]">
              {translate("how to install on android")}
            </h3>
            <ol className="mt-2 space-y-1.5 text-sm text-[rgb(var(--text)/0.75)]">
              <li>1. {translate("tap download, then open the apk file.")}</li>
              <li>2. {translate("if prompted, allow installs from your browser this once.")}</li>
              <li>3. {translate("open it and you're in — it stays in sync with the website.")}</li>
            </ol>
          </div>
        </section>

        {/* iOS */}
        <section
          className={`flex flex-col rounded-2xl border p-6 ${
            platform === "ios"
              ? "border-[rgb(var(--accent)/0.55)] bg-[rgb(var(--accent)/0.08)]"
              : "border-[rgb(var(--text)/0.12)]"
          }`}
        >
          <div className="flex items-center gap-2">
            <Apple className="h-5 w-5" aria-hidden />
            <h2 className="text-lg font-medium">iOS</h2>
            {platform === "ios" ? (
              <span className="ml-auto rounded-full bg-[rgb(var(--accent)/0.18)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--accent))]">
                {translate("recommended for your device")}
              </span>
            ) : null}
          </div>

          <a
            href={IOS_APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[rgb(var(--text))] px-4 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90"
          >
            <Apple className="h-4 w-4" aria-hidden />
            {translate("get it on the app store")}
          </a>

          <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-[rgb(var(--text)/0.12)] bg-[rgb(var(--text)/0.03)] px-3 py-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgb(var(--text)/0.55)]" aria-hidden />
            <p className="text-xs leading-[1.5] text-[rgb(var(--text)/0.7)]">
              {translate("requires a us app store account.")}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowUsAccount(true)}
            className="mt-2 self-start text-xs font-medium text-[rgb(var(--accent))] underline-offset-2 transition hover:underline"
          >
            {translate("i don't have a us app store account")}
          </button>

          <div className="mt-5 border-t border-[rgb(var(--text)/0.1)] pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--text)/0.5)]">
              {translate("how to install on ios")}
            </h3>
            <ol className="mt-2 space-y-1.5 text-sm text-[rgb(var(--text)/0.75)]">
              <li>1. {translate("tap get it on the app store and install from there.")}</li>
              <li>2. {translate("if your apple id isn't us, switch storefronts or use the shared account.")}</li>
              <li>3. {translate("open it and you're in — it stays in sync with the website.")}</li>
            </ol>
            <Link
              href="/"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--text)/0.55)] hover:text-[rgb(var(--accent))] hover:underline"
            >
              {translate("or continue on web")}
            </Link>
          </div>
        </section>
      </div>

      <UsAccountModal open={showUsAccount} onClose={() => setShowUsAccount(false)} />
    </main>
  );
}

function UsAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { translate } = useLocale();
  return (
    <Modal open={open} onClose={onClose} title="" dismissible zIndexClass="z-[120]">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(var(--text)/0.06)] text-[rgb(var(--text)/0.75)]">
            <Apple className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="t-eyebrow">{translate("shared us app store account")}</span>
        </div>

        <h2 className="text-[1.4rem] font-semibold leading-[1.2] tracking-[-0.018em]">
          {translate("use this account to download")}
        </h2>

        <p className="text-sm leading-[1.6] text-[rgb(var(--text)/0.7)]">
          {translate("sign in via settings → apple account → media & purchases (not icloud!), then open the app store and download sneakerfeature.")}
        </p>

        <div className="space-y-2.5 rounded-xl border border-[rgb(var(--text)/0.12)] bg-[rgb(var(--text)/0.03)] p-4">
          <CredentialField label={translate("apple id")} value={US_APPLE_ID_EMAIL} />
          <CredentialField label={translate("password")} value={US_APPLE_ID_PASSWORD} />
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
          <p className="text-xs leading-[1.55] text-[rgb(var(--text)/0.75)]">
            <span className="font-semibold">{translate("important:")}</span>{" "}
            {translate("do not sign this account into icloud or replace your own apple id. only sign in under settings → apple account → media & purchases so it's used for app store downloads only.")}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-1 inline-flex h-10 items-center justify-center self-end rounded-lg border border-[rgb(var(--text)/0.15)] px-4 text-sm font-medium transition hover:bg-[rgb(var(--text)/0.05)]"
        >
          {translate("got it")}
        </button>
      </div>
    </Modal>
  );
}

function CredentialField({ label, value }: { label: string; value: string }) {
  const { translate } = useLocale();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the value is still visible in the field */
    }
  };
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs font-medium text-[rgb(var(--text)/0.55)]">
        {label}
      </span>
      <code className="flex-1 select-all break-all rounded-md bg-[rgb(var(--text)/0.05)] px-2 py-1.5 text-sm font-mono">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={translate("copy")}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[rgb(var(--text)/0.12)] transition hover:bg-[rgb(var(--text)/0.05)]"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5 text-[rgb(var(--text)/0.55)]" aria-hidden />
        )}
      </button>
    </div>
  );
}
