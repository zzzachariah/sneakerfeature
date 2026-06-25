"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import {
  Apple,
  ArrowLeft,
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
  type LucideIcon,
} from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";

const GITHUB_REPO = "zzzachariah/sneakerfeature";
// Same-origin streaming proxy (app/api/download/android). GitHub's release CDN
// (objects.githubusercontent.com) is blocked/throttled in mainland China, where
// a direct link just hangs on a blank page. This route streams the APK through
// our own domain, which IS reachable there. It is the default/fallback; when
// the client can reach GitHub we upgrade to the direct release URL (faster,
// and keeps the bulk of downloads off our own bandwidth) — see the effect below.
const PROXY_APK_URL = "/api/download/android";
const IOS_APP_STORE_URL = "https://apps.apple.com/us/app/sneakerfeature/id6780938606";
// Shared US App Store account for users without one of their own. It's tied to
// nothing personal and only grants media-and-purchases scope (no iCloud login).
const SHARED_APPLE_EMAIL = "kevinchospi@outlook.com";
const SHARED_APPLE_PASSWORD = "Jx135790";

type Platform = "ios" | "android" | "macos" | "windows";

function detectPlatform(): Platform | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  const isiOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (/Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document);
  if (isiOS) return "ios";
  if (/Macintosh|Mac OS X/.test(ua)) return "macos";
  if (/Windows/.test(ua)) return "windows";
  return null;
}

type Release = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets?: { name?: string; browser_download_url?: string; size?: number }[];
};

type PlatformMeta = {
  id: Platform;
  label: string;
  icon: LucideIcon;
  /** Tailwind tint applied behind the icon tile + as the gradient backdrop on
   * the detail card. Each platform gets a different hue so the page feels
   * alive when you switch between them. */
  accent: string;
  glow: string;
};

const PLATFORMS: PlatformMeta[] = [
  {
    id: "ios",
    label: "iOS",
    icon: Apple,
    accent: "from-[rgb(148,163,184,0.16)] to-[rgb(148,163,184,0.02)]",
    glow: "shadow-[0_24px_60px_-30px_rgb(148,163,184,0.55)]",
  },
  {
    id: "android",
    label: "Android",
    icon: Smartphone,
    accent: "from-[rgb(132,204,22,0.16)] to-[rgb(132,204,22,0.02)]",
    glow: "shadow-[0_24px_60px_-30px_rgb(132,204,22,0.55)]",
  },
  {
    id: "macos",
    label: "macOS",
    icon: Laptop,
    accent: "from-[rgb(56,189,248,0.18)] to-[rgb(56,189,248,0.02)]",
    glow: "shadow-[0_24px_60px_-30px_rgb(56,189,248,0.55)]",
  },
  {
    id: "windows",
    label: "Windows",
    icon: Monitor,
    accent: "from-[rgb(99,102,241,0.18)] to-[rgb(99,102,241,0.02)]",
    glow: "shadow-[0_24px_60px_-30px_rgb(99,102,241,0.55)]",
  },
];

export function DownloadView() {
  const { locale, translate } = useLocale();
  const zh = locale === "zh";
  const reduce = useReducedMotion();
  const [detected, setDetected] = useState<Platform | null>(null);
  const [selected, setSelected] = useState<Platform | null>(null);
  const [apkUrl, setApkUrl] = useState(PROXY_APK_URL);
  const [desktop, setDesktop] = useState<{ macUrl: string; winUrl: string; version: string } | null>(
    null
  );
  // Inside the Capacitor native shell the WebView has no DownloadListener, so a
  // same-window navigation to a binary just renders a blank/white page and
  // strands the app. Capacitor routes target="_blank" link taps to the system
  // browser, which downloads the file properly. In a normal browser we keep
  // the plain same-tab download.
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    const d = detectPlatform();
    setDetected(d);
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
        const mobile = releases.find(
          (r) =>
            r && !r.draft && !r.prerelease && typeof r.tag_name === "string" && r.tag_name.startsWith("mobile-v")
        );
        const apk = mobile?.assets?.find((a) => typeof a.name === "string" && a.name.endsWith(".apk"));
        if (apk?.browser_download_url) setApkUrl(apk.browser_download_url);

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

  const selectedMeta = useMemo(
    () => (selected ? PLATFORMS.find((p) => p.id === selected) ?? null : null),
    [selected]
  );

  return (
    <main
      className="mx-auto w-full max-w-4xl px-5 pt-12 sm:pt-16"
      style={{ paddingBottom: "calc(var(--mobile-nav-h) + 3rem)" }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {selected === null ? (
          <motion.section
            key="picker"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -12 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <DevicePicker
              zh={zh}
              translate={translate}
              detected={detected}
              onSelect={setSelected}
              reduce={reduce ?? false}
            />
          </motion.section>
        ) : (
          <motion.section
            key={`detail-${selected}`}
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
          >
            <DeviceDetail
              meta={selectedMeta!}
              zh={zh}
              translate={translate}
              detected={detected}
              apkUrl={apkUrl}
              desktop={desktop}
              openInNewTab={isNative}
              onBack={() => setSelected(null)}
            />
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Picker                                                                     */
/* -------------------------------------------------------------------------- */

function DevicePicker({
  zh,
  translate,
  detected,
  onSelect,
  reduce,
}: {
  zh: boolean;
  translate: (k: string) => string;
  detected: Platform | null;
  onSelect: (p: Platform) => void;
  reduce: boolean;
}) {
  return (
    <>
      <header className="text-center">
        <motion.span
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--accent)/0.35)] bg-[rgb(var(--accent)/0.08)] px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-[rgb(var(--accent))]"
        >
          <Sparkles className="h-3 w-3" />
          {zh ? "全平台已上线" : "Available on every platform"}
        </motion.span>
        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="mt-4 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl"
        >
          {translate("get the app")}
        </motion.h1>
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="mx-auto mt-3 max-w-xl text-[0.95rem] leading-[1.65] soft-text"
        >
          {zh
            ? "选择你的设备 — 我们只显示你需要的下载方式。"
            : "Pick your device — we'll show only the way that works for you."}
        </motion.p>
      </header>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {PLATFORMS.map((p, i) => (
          <PlatformTile
            key={p.id}
            meta={p}
            recommended={detected === p.id}
            onSelect={() => onSelect(p.id)}
            index={i}
            zh={zh}
            reduce={reduce}
          />
        ))}
      </div>

      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.32 }}
        className="mt-10 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-center"
      >
        <p className="text-sm soft-text">{zh ? "不想下载？" : "Don't want to install?"}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-[rgb(var(--accent))] hover:underline"
        >
          {zh ? "在浏览器中使用" : "Continue on the web"}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </motion.div>
    </>
  );
}

function PlatformTile({
  meta,
  recommended,
  onSelect,
  index,
  zh,
  reduce,
}: {
  meta: PlatformMeta;
  recommended: boolean;
  onSelect: () => void;
  index: number;
  zh: boolean;
  reduce: boolean;
}) {
  const Icon = meta.icon;
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      layoutId={`tile-${meta.id}`}
      initial={reduce ? false : { opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.5,
        delay: 0.12 + index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={reduce ? undefined : { y: -3, scale: 1.015 }}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      className={`group relative overflow-hidden rounded-3xl border p-6 text-left transition-colors ios-glass-platform-tile ${
        recommended
          ? "border-[rgb(var(--accent)/0.6)] bg-[rgb(var(--bg-elev)/0.96)]"
          : "border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--bg-elev)/0.92)] hover:border-[rgb(var(--text)/0.22)]"
      }`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${meta.accent} opacity-90`}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gradient-to-br ${meta.accent} blur-2xl opacity-70`}
      />

      <div className="relative flex items-center gap-4">
        <span
          className={`relative inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--bg-elev)/0.9)] text-[rgb(var(--text))] ring-1 ring-[rgb(var(--glass-stroke-soft)/0.6)] ${
            recommended ? meta.glow : ""
          }`}
        >
          <Icon className="h-6 w-6" aria-hidden />
          {recommended && !reduce && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-2xl ring-2 ring-[rgb(var(--accent)/0.55)]"
              animate={{ opacity: [0.25, 0.9, 0.25], scale: [1, 1.06, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-[-0.014em]">{meta.label}</h2>
            {recommended && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--accent)/0.16)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[rgb(var(--accent))]">
                <Check className="h-3 w-3" />
                {zh ? "你的设备" : "Your device"}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm soft-text">
            {meta.id === "ios" && (zh ? "美区 App Store 下载" : "Get it on the US App Store")}
            {meta.id === "android" && (zh ? "直接安装 APK" : "Install the APK directly")}
            {meta.id === "macos" && (zh ? "通用 .dmg 安装包" : "Universal .dmg installer")}
            {meta.id === "windows" && (zh ? "Windows 10/11 64 位" : "Windows 10/11 64-bit")}
          </p>
        </div>

        <ArrowRight className="h-4 w-4 shrink-0 text-[rgb(var(--subtext))] transition group-hover:translate-x-0.5 group-hover:text-[rgb(var(--text))]" />
      </div>
    </motion.button>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                     */
/* -------------------------------------------------------------------------- */

function DeviceDetail({
  meta,
  zh,
  translate,
  detected,
  apkUrl,
  desktop,
  openInNewTab,
  onBack,
}: {
  meta: PlatformMeta;
  zh: boolean;
  translate: (k: string) => string;
  detected: Platform | null;
  apkUrl: string;
  desktop: { macUrl: string; winUrl: string; version: string } | null;
  openInNewTab: boolean;
  onBack: () => void;
}) {
  const Icon = meta.icon;
  const isOnThisDevice = detected === meta.id;

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--bg-elev)/0.85)] px-3 py-1.5 text-xs font-medium text-[rgb(var(--text)/0.75)] transition hover:border-[rgb(var(--text)/0.3)] hover:text-[rgb(var(--text))]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        {zh ? "选择其他设备" : "Switch device"}
      </button>

      <motion.div
        layoutId={`tile-${meta.id}`}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        className="relative mt-5 overflow-hidden rounded-3xl border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--bg-elev)/0.96)]"
      >
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${meta.accent} opacity-90`}
        />
        <span
          aria-hidden
          className={`pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-gradient-to-br ${meta.accent} blur-3xl opacity-80`}
        />

        <div className="relative p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <span
              className={`inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--bg-elev)/0.95)] text-[rgb(var(--text))] ring-1 ring-[rgb(var(--glass-stroke-soft)/0.6)] ${meta.glow}`}
            >
              <Icon className="h-7 w-7" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="t-eyebrow">{zh ? "下载" : "Download"}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] sm:text-[1.7rem]">
                {meta.label}
              </h1>
              {isOnThisDevice && (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[rgb(var(--accent)/0.16)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[rgb(var(--accent))]">
                  <Check className="h-3 w-3" />
                  {zh ? "你的设备" : "Your device"}
                </span>
              )}
            </div>
          </div>

          <div className="mt-7">
            {meta.id === "ios" && <IOSContent zh={zh} translate={translate} />}
            {meta.id === "android" && (
              <AndroidContent
                translate={translate}
                apkUrl={apkUrl}
                openInNewTab={openInNewTab}
              />
            )}
            {meta.id === "macos" && (
              <DesktopContent
                os="macos"
                zh={zh}
                url={desktop?.macUrl ?? ""}
                version={desktop?.version}
              />
            )}
            {meta.id === "windows" && (
              <DesktopContent
                os="windows"
                zh={zh}
                url={desktop?.winUrl ?? ""}
                version={desktop?.version}
              />
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* iOS detail                                                                 */
/* -------------------------------------------------------------------------- */

function IOSContent({ zh, translate }: { zh: boolean; translate: (k: string) => string }) {
  const [showAccount, setShowAccount] = useState(false);
  return (
    <div className="space-y-4">
      <PrimaryCTA
        href={IOS_APP_STORE_URL}
        external
        icon={<Apple className="h-4 w-4" aria-hidden />}
        label={translate("get it on the app store")}
      />

      <div className="flex items-start gap-2 rounded-2xl bg-[rgb(var(--accent)/0.07)] px-4 py-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--accent))]" aria-hidden />
        <p className="leading-[1.55] text-[rgb(var(--text)/0.85)]">
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
        onClick={() => setShowAccount((o) => !o)}
        className="inline-flex w-full items-center justify-between rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--bg-elev)/0.6)] px-4 py-3 text-sm font-medium text-[rgb(var(--text)/0.85)] transition hover:border-[rgb(var(--text)/0.25)] hover:bg-[rgb(var(--bg-elev)/0.9)]"
        aria-expanded={showAccount}
      >
        <span>{zh ? "我没有美国 App Store 账号" : "I don't have a US App Store account"}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-300 ${showAccount ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {showAccount && <SharedAppleAccountPanel zh={zh} key="shared-acct" />}
      </AnimatePresence>
    </div>
  );
}

function SharedAppleAccountPanel({ zh }: { zh: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="space-y-4 rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--bg-elev)/0.92)] p-5">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--accent))]" aria-hidden />
          <p className="text-xs leading-[1.6] text-[rgb(var(--text)/0.85)]">
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

        <div className="space-y-3">
          <CopyField label={zh ? "邮箱" : "Email"} value={SHARED_APPLE_EMAIL} />
          <CopyField label={zh ? "密码" : "Password"} value={SHARED_APPLE_PASSWORD} mono />
        </div>

        <div className="rounded-xl bg-[rgb(var(--text)/0.04)] p-3.5">
          <p className="text-xs font-semibold text-[rgb(var(--text)/0.85)]">
            {zh ? "登录步骤" : "How to sign in"}
          </p>
          <ol className="mt-2 space-y-1.5 text-xs leading-[1.6] text-[rgb(var(--text)/0.72)]">
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
    </motion.div>
  );
}

/* Stacked label/value so the label can never crowd the value. The copy button
 * lives on the same row as the value for easy reach. */
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
    <div className="space-y-1.5">
      <label className="block text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--text)/0.55)]">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <code
          className={`min-w-0 flex-1 select-all truncate rounded-lg bg-[rgb(var(--text)/0.05)] px-3 py-2 text-sm text-[rgb(var(--text))] ${
            mono ? "font-mono tracking-wide" : ""
          }`}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--bg-elev)/0.7)] px-3 text-xs font-medium text-[rgb(var(--text)/0.75)] transition hover:border-[rgb(var(--text)/0.3)] hover:text-[rgb(var(--text))]"
          aria-label={`Copy ${label}`}
        >
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.span
                key="copied"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.18 }}
                className="inline-flex items-center gap-1 text-[rgb(var(--success))]"
              >
                <Check className="h-3.5 w-3.5" />
                Copied
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.18 }}
                className="inline-flex items-center gap-1"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Android detail                                                             */
/* -------------------------------------------------------------------------- */

function AndroidContent({
  translate,
  apkUrl,
  openInNewTab,
}: {
  translate: (k: string) => string;
  apkUrl: string;
  openInNewTab: boolean;
}) {
  return (
    <div className="space-y-4">
      <PrimaryCTA
        href={apkUrl}
        external={openInNewTab}
        icon={<Download className="h-4 w-4" aria-hidden />}
        label={translate("download apk")}
      />
      <p className="text-sm soft-text">
        {translate("works on mainland china networks — no app store needed.")}
      </p>
      <Steps
        title={translate("how to install on android")}
        steps={[
          translate("tap download, then open the apk file."),
          translate("if prompted, allow installs from your browser this once."),
          translate("open it and you're in — it stays in sync with the website."),
        ]}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Desktop detail                                                             */
/* -------------------------------------------------------------------------- */

function DesktopContent({
  os,
  zh,
  url,
  version,
}: {
  os: "macos" | "windows";
  zh: boolean;
  url: string;
  version?: string;
}) {
  const meta = useMemo(() => {
    if (os === "macos") {
      return {
        cta: zh ? "下载 .dmg" : "Download .dmg",
        empty: zh ? "Mac 版本即将发布 — 稍后再来" : "Mac build coming soon",
        note: zh ? "通用包：支持 Apple Silicon 与 Intel。" : "Universal build — Apple Silicon + Intel.",
        steps: zh
          ? [
              "下载并打开 .dmg",
              "把 sneakerfeature 拖入「应用程序」",
              "首次打开时若提示「无法验证开发者」，在「系统设置 → 隐私与安全性」中点 “仍要打开”",
            ]
          : [
              "Open the downloaded .dmg",
              "Drag sneakerfeature into Applications",
              'First launch: if blocked, open from System Settings → Privacy & Security → "Open Anyway"',
            ],
        appStoreNote: zh
          ? "Mac 版本暂未上架 App Store — 请直接下载安装包。"
          : "Not on the Mac App Store yet — please install via the .dmg above.",
      };
    }
    return {
      cta: zh ? "下载 .exe 安装包" : "Download .exe",
      empty: zh ? "Windows 版本即将发布 — 稍后再来" : "Windows build coming soon",
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
      appStoreNote: null,
    };
  }, [os, zh]);

  const available = Boolean(url);

  return (
    <div className="space-y-4">
      {available ? (
        <PrimaryCTA href={url} icon={<Download className="h-4 w-4" aria-hidden />} label={meta.cta} />
      ) : (
        <div className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-[rgb(var(--text)/0.15)] px-4 text-sm font-medium text-[rgb(var(--subtext))]">
          {meta.empty}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm soft-text">
        <span>{meta.note}</span>
        {version && (
          <span className="rounded-full bg-[rgb(var(--text)/0.06)] px-2 py-0.5 text-[0.65rem] font-medium tracking-wide text-[rgb(var(--text)/0.65)]">
            v{version}
          </span>
        )}
      </div>

      {meta.appStoreNote && (
        <div className="flex items-start gap-2 rounded-2xl bg-[rgb(var(--accent)/0.07)] px-4 py-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--accent))]" aria-hidden />
          <p className="leading-[1.55] text-[rgb(var(--text)/0.85)]">{meta.appStoreNote}</p>
        </div>
      )}

      <Steps title={zh ? "安装步骤" : "How to install"} steps={meta.steps} />

      {available && (
        <a
          href={`https://github.com/${GITHUB_REPO}/releases/latest`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--subtext))] hover:text-[rgb(var(--text))]"
        >
          {zh ? "查看所有版本" : "All releases"}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                */
/* -------------------------------------------------------------------------- */

function PrimaryCTA({
  href,
  external,
  icon,
  label,
}: {
  href: string;
  external?: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      whileHover={reduce ? undefined : { y: -1 }}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[rgb(var(--text))] px-5 text-sm font-semibold text-[rgb(var(--bg))] shadow-[0_8px_24px_-12px_rgb(var(--shadow)/0.6)] transition hover:opacity-95"
    >
      {icon}
      {label}
    </motion.a>
  );
}

function Steps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="relative ios-glass-download-steps rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.5)] bg-[rgb(var(--bg-elev)/0.6)] p-4">
      <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--text)/0.55)]">
        {title}
      </h4>
      <ol className="mt-3 space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-[rgb(var(--text)/0.8)]">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--text)/0.08)] text-[0.65rem] font-semibold text-[rgb(var(--text)/0.85)]">
              {i + 1}
            </span>
            <span className="leading-[1.55]">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
