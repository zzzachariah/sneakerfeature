"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import {
  Apple,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Info,
  Laptop,
  Monitor,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";

const GITHUB_REPO = "zzzachariah/sneakerfeature";
// Same-origin streaming proxy (app/api/download/android). GitHub's release CDN
// (objects.githubusercontent.com) is blocked/throttled in mainland China, where
// a direct link just hangs on a blank page. This route streams the APK through
// our own domain, which IS reachable there. It is the default/fallback; when
// the client can reach GitHub we upgrade to the direct release URL (faster,
// and keeps the bulk of downloads off our own bandwidth) — see the effects below.
const PROXY_APK_URL = "/api/download/android";
const IOS_APP_STORE_URL = "https://apps.apple.com/us/app/sneakerfeature/id6780938606";
// Shared US App Store account for users without one of their own. It's tied to
// nothing personal and only grants media-and-purchases scope (no iCloud login).
const SHARED_APPLE_EMAIL = "kevinchospi@outlook.com";
const SHARED_APPLE_PASSWORD = "Jx135790";

type Platform = "ios" | "android" | "macos" | "windows" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  // iPadOS 13+ reports as Macintosh but is touch-capable.
  const isiOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (/Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document);
  if (isiOS) return "ios";
  if (/Macintosh|Mac OS X/.test(ua)) return "macos";
  if (/Windows/.test(ua)) return "windows";
  return "other";
}

type Release = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets?: { name?: string; browser_download_url?: string; size?: number }[];
};

export function DownloadView() {
  const { locale, translate } = useLocale();
  const zh = locale === "zh";
  const [platform, setPlatform] = useState<Platform>("other");
  const [apkUrl, setApkUrl] = useState(PROXY_APK_URL);
  const [desktop, setDesktop] = useState<{
    macUrl: string;
    winUrl: string;
    version: string;
  } | null>(null);
  // Inside the Capacitor native shell the WebView has no DownloadListener, so a
  // same-window navigation to a binary just renders a blank/white page and
  // strands the app. Capacitor routes target="_blank" link taps to the system
  // browser (onCreateWindow → ACTION_VIEW), which downloads the file properly.
  // In a normal browser we keep the plain same-tab download (no _blank).
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((releases: Release[] | null) => {
        if (cancelled || !Array.isArray(releases)) return;

        // Android: newest mobile-v* release with an .apk asset.
        const mobile = releases.find(
          (r) =>
            r && !r.draft && !r.prerelease && typeof r.tag_name === "string" && r.tag_name.startsWith("mobile-v")
        );
        const apk = mobile?.assets?.find((a) => typeof a.name === "string" && a.name.endsWith(".apk"));
        if (apk?.browser_download_url) setApkUrl(apk.browser_download_url);

        // Desktop: newest desktop-v* release with .dmg + .exe assets.
        const desk = releases.find(
          (r) =>
            r && !r.draft && !r.prerelease && typeof r.tag_name === "string" && r.tag_name.startsWith("desktop-v")
        );
        if (desk) {
          const dmg = desk.assets?.find((a) => typeof a.name === "string" && a.name.endsWith(".dmg"));
          const exe = desk.assets?.find((a) => typeof a.name === "string" && a.name.endsWith(".exe"));
          if (dmg?.browser_download_url || exe?.browser_download_url) {
            setDesktop({
              macUrl: dmg?.browser_download_url ?? "",
              winUrl: exe?.browser_download_url ?? "",
              version: desk.tag_name.replace(/^desktop-v/, ""),
            });
          }
        }
      })
      .catch(() => {
        /* offline / rate-limited / blocked — leave defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isMobile = platform === "ios" || platform === "android";
  const isDesktop = platform === "macos" || platform === "windows";

  return (
    <main
      className="mx-auto w-full max-w-5xl px-5 pt-12 sm:pt-16"
      style={{ paddingBottom: "calc(var(--mobile-nav-h) + 3rem)" }}
    >
      {/* Hero */}
      <header className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--accent)/0.35)] bg-[rgb(var(--accent)/0.08)] px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-[rgb(var(--accent))]">
          <Sparkles className="h-3 w-3" />
          {zh ? "全平台已上线" : "Available on every platform"}
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
          {translate("get the app")}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[0.95rem] leading-[1.65] soft-text">
          {zh
            ? "iOS · Android · macOS · Windows — 一处账号，处处同步。"
            : "iOS, Android, macOS, Windows — one account, synced everywhere."}
        </p>
      </header>

      {/* Mobile section */}
      <SectionHeading
        eyebrow={zh ? "手机" : "Mobile"}
        title={zh ? "在手机上使用" : "Get it on your phone"}
        recommendedHere={isMobile}
      />
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <IOSCard
          zh={zh}
          highlighted={platform === "ios"}
          translate={translate}
        />
        <AndroidCard
          zh={zh}
          highlighted={platform === "android"}
          apkUrl={apkUrl}
          openInNewTab={isNative}
          translate={translate}
        />
      </div>

      {/* Desktop section */}
      <SectionHeading
        eyebrow={zh ? "电脑" : "Desktop"}
        title={zh ? "桌面端原生应用" : "Native desktop app"}
        subtitle={
          zh
            ? "和网页同源 — 一个账号，三块屏幕同步。Mac 暂无 App Store 版本，直接下载安装包即可。"
            : "Same account as the web. Mac is not on the App Store yet — just grab the installer."
        }
        recommendedHere={isDesktop}
      />
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <DesktopCard
          os="macos"
          highlighted={platform === "macos"}
          url={desktop?.macUrl ?? ""}
          version={desktop?.version}
          zh={zh}
        />
        <DesktopCard
          os="windows"
          highlighted={platform === "windows"}
          url={desktop?.winUrl ?? ""}
          version={desktop?.version}
          zh={zh}
        />
      </div>

      {/* Web fallback */}
      <div className="mt-12 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-center">
        <p className="text-sm soft-text">
          {zh ? "不想下载？" : "Don't want to install?"}
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-[rgb(var(--accent))] hover:underline"
        >
          {zh ? "在浏览器中使用" : "Continue on the web"}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </main>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
  recommendedHere,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  recommendedHere?: boolean;
}) {
  return (
    <div className="mt-12 flex flex-wrap items-end justify-between gap-3 border-b border-[rgb(var(--glass-stroke-soft)/0.4)] pb-3">
      <div>
        <p className="t-eyebrow">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.014em]">{title}</h2>
        {subtitle && (
          <p className="mt-1.5 max-w-2xl text-sm soft-text">{subtitle}</p>
        )}
      </div>
      {recommendedHere && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--accent)/0.16)] px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-[rgb(var(--accent))]">
          <Check className="h-3 w-3" />
          You&apos;re on this
        </span>
      )}
    </div>
  );
}

function PlatformCard({
  children,
  highlighted,
}: {
  children: React.ReactNode;
  highlighted: boolean;
}) {
  return (
    <section
      className={`surface-card relative overflow-hidden rounded-2xl border p-6 transition ${
        highlighted
          ? "border-[rgb(var(--accent)/0.6)] shadow-[0_10px_28px_-12px_rgb(var(--accent)/0.4)]"
          : "premium-border hover:border-[rgb(var(--text)/0.22)]"
      }`}
    >
      {highlighted && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[rgb(var(--accent)/0.08)] via-transparent to-transparent"
        />
      )}
      <div className="relative">{children}</div>
    </section>
  );
}

function CardHeader({
  icon,
  label,
  highlighted,
  zh,
}: {
  icon: React.ReactNode;
  label: string;
  highlighted: boolean;
  zh: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--text)/0.06)] text-[rgb(var(--text))]">
        {icon}
      </span>
      <h3 className="text-lg font-semibold tracking-[-0.01em]">{label}</h3>
      {highlighted && (
        <span className="ml-auto rounded-full bg-[rgb(var(--accent)/0.18)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--accent))]">
          {zh ? "推荐你的设备" : "Recommended"}
        </span>
      )}
    </div>
  );
}

function IOSCard({
  zh,
  highlighted,
  translate,
}: {
  zh: boolean;
  highlighted: boolean;
  translate: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <PlatformCard highlighted={highlighted}>
      <CardHeader icon={<Apple className="h-5 w-5" />} label="iOS" highlighted={highlighted} zh={zh} />

      <a
        href={IOS_APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--text))] px-4 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90"
      >
        <Apple className="h-4 w-4" aria-hidden />
        {translate("get it on the app store")}
      </a>

      <div className="mt-3 flex items-start gap-2 rounded-xl bg-[rgb(var(--accent)/0.07)] px-3 py-2 text-xs text-[rgb(var(--text)/0.85)]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgb(var(--accent))]" aria-hidden />
        <p>
          {zh ? (
            <>
              此链接为 <strong>美国 App Store</strong>，需要美国 Apple ID 才能下载。
            </>
          ) : (
            <>
              This is the <strong>US App Store</strong> listing — you&apos;ll need a US Apple ID to install it.
            </>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-3 inline-flex w-full items-center justify-between rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)] px-3 py-2 text-xs font-medium text-[rgb(var(--text)/0.75)] transition hover:bg-[rgb(var(--text)/0.04)]"
        aria-expanded={open}
      >
        <span>{zh ? "我没有美国 App Store 账号" : "I don't have a US App Store account"}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && <SharedAppleAccountPanel zh={zh} />}
    </PlatformCard>
  );
}

function SharedAppleAccountPanel({ zh }: { zh: boolean }) {
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.5)] bg-[rgb(var(--bg-elev)/0.7)] p-3 text-xs">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgb(var(--accent))]" aria-hidden />
        <p className="leading-[1.55] text-[rgb(var(--text)/0.85)]">
          {zh ? (
            <>
              这是一个 <strong>共享美国 Apple 账号</strong>，仅供下载使用。请勿修改密码或开启 iCloud 同步。
            </>
          ) : (
            <>
              This is a <strong>shared US Apple account</strong> for downloads only. Please don&apos;t
              change the password or enable iCloud sync on it.
            </>
          )}
        </p>
      </div>

      <CopyField label={zh ? "邮箱" : "Email"} value={SHARED_APPLE_EMAIL} />
      <CopyField label={zh ? "密码" : "Password"} value={SHARED_APPLE_PASSWORD} mono />

      <div className="rounded-lg bg-[rgb(var(--text)/0.04)] p-2.5">
        <p className="font-semibold text-[rgb(var(--text)/0.85)]">
          {zh ? "登录步骤" : "How to sign in"}
        </p>
        <ol className="mt-1.5 space-y-1 leading-[1.55] text-[rgb(var(--text)/0.7)]">
          {zh ? (
            <>
              <li>1. 打开 iPhone <strong>设置</strong></li>
              <li>2. 进入 <strong>Apple 账户 → 媒体与购买项目</strong></li>
              <li>3. 退出当前账号，登录上面的邮箱与密码</li>
              <li>4. 回到 App Store，再次打开本页链接下载即可</li>
            </>
          ) : (
            <>
              <li>1. Open <strong>Settings</strong> on your iPhone</li>
              <li>2. Go to <strong>Apple Account → Media &amp; Purchases</strong></li>
              <li>3. Sign out, then sign in with the credentials above</li>
              <li>4. Reopen the App Store link above and tap Install</li>
            </>
          )}
        </ol>
      </div>
    </div>
  );
}

function CopyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }, [value]);
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[0.7rem] font-semibold uppercase tracking-wide text-[rgb(var(--text)/0.55)]">
        {label}
      </span>
      <code
        className={`min-w-0 flex-1 select-all truncate rounded-md bg-[rgb(var(--text)/0.05)] px-2 py-1 text-[0.75rem] text-[rgb(var(--text))] ${
          mono ? "font-mono tracking-wide" : ""
        }`}
      >
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-[rgb(var(--glass-stroke-soft)/0.55)] px-2 text-[0.7rem] font-medium text-[rgb(var(--text)/0.75)] transition hover:bg-[rgb(var(--text)/0.05)]"
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function AndroidCard({
  zh,
  highlighted,
  apkUrl,
  openInNewTab,
  translate,
}: {
  zh: boolean;
  highlighted: boolean;
  apkUrl: string;
  openInNewTab: boolean;
  translate: (key: string) => string;
}) {
  return (
    <PlatformCard highlighted={highlighted}>
      <CardHeader icon={<Smartphone className="h-5 w-5" />} label="Android" highlighted={highlighted} zh={zh} />
      <a
        href={apkUrl}
        target={openInNewTab ? "_blank" : undefined}
        rel={openInNewTab ? "noopener noreferrer" : undefined}
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--text))] px-4 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90"
      >
        <Download className="h-4 w-4" aria-hidden />
        {translate("download apk")}
      </a>
      <p className="mt-3 text-xs text-[rgb(var(--text)/0.55)]">
        {translate("works on mainland china networks — no app store needed.")}
      </p>
      <div className="mt-5 border-t border-[rgb(var(--text)/0.1)] pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--text)/0.5)]">
          {translate("how to install on android")}
        </h4>
        <ol className="mt-2 space-y-1.5 text-sm text-[rgb(var(--text)/0.75)]">
          <li>1. {translate("tap download, then open the apk file.")}</li>
          <li>2. {translate("if prompted, allow installs from your browser this once.")}</li>
          <li>3. {translate("open it and you're in — it stays in sync with the website.")}</li>
        </ol>
      </div>
    </PlatformCard>
  );
}

function DesktopCard({
  os,
  highlighted,
  url,
  version,
  zh,
}: {
  os: "macos" | "windows";
  highlighted: boolean;
  url: string;
  version?: string;
  zh: boolean;
}) {
  const meta = useMemo(() => {
    if (os === "macos") {
      return {
        label: "macOS",
        icon: <Laptop className="h-5 w-5" />,
        cta: zh ? "下载 .dmg" : "Download .dmg",
        empty: zh ? "稍后再来 — Mac 版本即将发布" : "Mac build coming soon",
        note: zh
          ? "支持 Apple Silicon 与 Intel — 通用包。"
          : "Universal build — Apple Silicon + Intel.",
        steps: zh
          ? [
              "下载并打开 .dmg",
              "把 sneakerfeature 拖入「应用程序」",
              "首次打开时若提示「无法验证开发者」，在「系统设置 → 隐私与安全性」中点 “仍要打开”",
            ]
          : [
              "Open the downloaded .dmg",
              "Drag sneakerfeature into Applications",
              'First launch: if blocked, open it from System Settings → Privacy & Security → "Open Anyway"',
            ],
      };
    }
    return {
      label: "Windows",
      icon: <Monitor className="h-5 w-5" />,
      cta: zh ? "下载 .exe 安装包" : "Download .exe",
      empty: zh ? "稍后再来 — Windows 版本即将发布" : "Windows build coming soon",
      note: zh ? "Windows 10 / 11，64 位。" : "Windows 10 / 11, 64-bit.",
      steps: zh
        ? [
            "运行下载的 .exe 安装包",
            "若 SmartScreen 提示，选择「更多信息 → 仍要运行」",
            "完成后在开始菜单中打开 sneakerfeature",
          ]
        : [
            "Run the downloaded .exe installer",
            'If SmartScreen warns, click "More info → Run anyway"',
            "Launch sneakerfeature from the Start menu",
          ],
    };
  }, [os, zh]);

  const available = Boolean(url);

  return (
    <PlatformCard highlighted={highlighted}>
      <CardHeader icon={meta.icon} label={meta.label} highlighted={highlighted} zh={zh} />

      {available ? (
        <a
          href={url}
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--text))] px-4 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90"
        >
          <Download className="h-4 w-4" aria-hidden />
          {meta.cta}
        </a>
      ) : (
        <div className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[rgb(var(--text)/0.15)] px-4 text-sm font-medium text-[rgb(var(--text)/0.55)]">
          {meta.empty}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 text-xs soft-text">
        <span>{meta.note}</span>
        {version && (
          <span className="rounded-full bg-[rgb(var(--text)/0.06)] px-2 py-0.5 text-[0.65rem] font-medium tracking-wide text-[rgb(var(--text)/0.65)]">
            v{version}
          </span>
        )}
      </div>

      {os === "macos" && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-[rgb(var(--accent)/0.07)] px-3 py-2 text-xs text-[rgb(var(--text)/0.85)]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgb(var(--accent))]" aria-hidden />
          <p>
            {zh
              ? "Mac 版本暂未上架 App Store — 请直接下载安装包。"
              : "Not on the Mac App Store yet — please install via the .dmg above."}
          </p>
        </div>
      )}

      <div className="mt-5 border-t border-[rgb(var(--text)/0.1)] pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--text)/0.5)]">
          {zh ? "安装步骤" : "How to install"}
        </h4>
        <ol className="mt-2 space-y-1.5 text-sm text-[rgb(var(--text)/0.75)]">
          {meta.steps.map((step, i) => (
            <li key={i}>
              {i + 1}. {step}
            </li>
          ))}
        </ol>
      </div>

      {available && (
        <a
          href={`https://github.com/${GITHUB_REPO}/releases/latest`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1 text-[0.7rem] font-medium text-[rgb(var(--text)/0.55)] hover:text-[rgb(var(--text))]"
        >
          {zh ? "查看所有版本" : "All releases"}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
    </PlatformCard>
  );
}
