"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Apple, Smartphone, Download, ArrowRight } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";

// Latest signed APK published by the mobile CI workflow (see MOBILE.md). The
// `releases/latest/download/<asset>` form always resolves to the newest release.
const ANDROID_APK_URL =
  "https://github.com/zzzachariah/sneakerfeature/releases/latest/download/sneakerfeature.apk";
// Set once the app is live on the App Store, e.g. https://apps.apple.com/app/id...
const IOS_APP_STORE_URL = "";

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

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:py-16">
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
            href={ANDROID_APK_URL}
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

          {IOS_APP_STORE_URL ? (
            <a
              href={IOS_APP_STORE_URL}
              className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[rgb(var(--text))] px-4 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90"
            >
              <Apple className="h-4 w-4" aria-hidden />
              {translate("get it on the app store")}
            </a>
          ) : (
            <>
              <div className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[rgb(var(--text)/0.15)] px-4 text-sm font-medium text-[rgb(var(--text)/0.6)]">
                {translate("coming soon to the app store")}
              </div>
              <p className="mt-3 text-xs text-[rgb(var(--text)/0.55)]">
                {translate("ios build is on the way. in the meantime, use the web version.")}
              </p>
              <Link
                href="/"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[rgb(var(--accent))] hover:underline"
              >
                {translate("continue on web")}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
