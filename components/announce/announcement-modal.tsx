"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Megaphone, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useLocale } from "@/components/i18n/locale-provider";

// Site-wide announcement popup. Content is published either from
// /admin/announcements (writes to the `announcements` table) or — for
// back-compat — by the "Publish Announcement" GitHub Action
// (.github/workflows/announcement.yml), which writes public/announcement.json.
// The popup polls /api/announcements/active which prefers the DB and falls
// back to the static JSON file so legacy publishes keep showing up. Because
// the iOS / Android apps are thin shells that load the live site, the same
// popup reaches web + both apps with no rebuild.
//
// `frequency` controls how often a given announcement (keyed by `id`) reappears:
//   - "once"    → shown once per user, ever (localStorage).      [default]
//   - "session" → shown once per app/tab open (sessionStorage).
//   - "always"  → shown on every page load.
// `expiresAt` is an absolute hard cap — past it, the popup never shows again
// regardless of `frequency`. Publishing a new announcement always gets a fresh
// `id`, so it re-pops for everyone regardless of the previous one being
// dismissed.
type Frequency = "once" | "session" | "always";

type Announcement = {
  id: string;
  enabled?: boolean;
  frequency?: Frequency;
  dismissible?: boolean;
  publishedAt?: string | null;
  expiresAt?: string | null;
  title?: string;
  body?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  titleZh?: string;
  bodyZh?: string;
  buttonLabelZh?: string;
};

const SEEN_KEY = "sf-announcement-seen";
const CLIENT_ID_KEY = "sf-client-id";

function seenStore(freq: Frequency): Storage | null {
  if (typeof window === "undefined") return null;
  if (freq === "session") return window.sessionStorage;
  if (freq === "once") return window.localStorage;
  return null; // "always" — never remember
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return false;
  return Date.now() >= t;
}

/** Stable per-browser id so the admin "reach" count can dedupe anonymous
 * viewers. Stored in localStorage; cleared on browser/cookie reset. Falls
 * back to a noisy in-memory id when localStorage is unavailable. */
function getOrCreateClientId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(CLIENT_ID_KEY, fresh);
    return fresh;
  } catch {
    return "";
  }
}

export function AnnouncementModal() {
  const { locale } = useLocale();
  const [data, setData] = useState<Announcement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Tracks the last id we've already processed in this session — keeps the
    // poll loop from re-opening for the same announcement and avoids fighting
    // dismissal state for frequency "always" (which intentionally has no
    // storage-side memory).
    let lastSeenId: string | null = null;

    const check = async () => {
      if (cancelled) return;
      try {
        // Cache-bust + no-store so a freshly published announcement shows up
        // without waiting on any CDN/static caching. The endpoint reads the
        // DB first and falls back to public/announcement.json so legacy
        // GitHub-Action publishes keep working.
        const res = await fetch(`/api/announcements/active?ts=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const a = (await res.json()) as Announcement | null;
        if (cancelled || !a || !a.enabled || !a.id) return;
        if (isExpired(a.expiresAt)) return;
        if (a.id === lastSeenId) return;
        const freq: Frequency = a.frequency ?? "once";
        try {
          if (seenStore(freq)?.getItem(SEEN_KEY) === a.id) {
            lastSeenId = a.id;
            return;
          }
        } catch {
          /* storage blocked (private mode) — just show it */
        }
        lastSeenId = a.id;
        setData(a);
        if (timer) clearTimeout(timer);
        // Small delay so it doesn't fight the first-run language / cookie flows.
        timer = setTimeout(() => {
          if (!cancelled) setOpen(true);
        }, 400);
        // Fire-and-forget: tell the server this viewer saw this announcement
        // so the admin reach counter can dedupe by (user|client) per id. The
        // endpoint is idempotent — re-posts from the same viewer are ignored.
        const clientId = getOrCreateClientId();
        fetch(`/api/announcements/${encodeURIComponent(a.id)}/view`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId }),
          keepalive: true,
        }).catch(() => {
          /* network error — view count will be off by one, not fatal */
        });
      } catch {
        /* offline / fetch failed — try again on the next poll */
      }
    };

    // First check immediately on mount, then keep checking in the background so
    // a long-open tab will pick up newly published announcements without a
    // reload. Browsers throttle setInterval in hidden tabs, so we also re-check
    // on visibilitychange to wake up cleanly after sleep / tab switches.
    check();
    const POLL_MS = 5 * 60 * 1000;
    const interval = window.setInterval(check, POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (!data) return null;

  const zh = locale === "zh";
  const title = (zh && data.titleZh) || data.title || "";
  const body = (zh && data.bodyZh) || data.body || "";
  const buttonLabel = (zh && data.buttonLabelZh) || data.buttonLabel || "";
  const buttonUrl = data.buttonUrl || "";
  const dismissible = data.dismissible !== false;
  const isExternal = /^https?:\/\//i.test(buttonUrl);

  const close = () => {
    setOpen(false);
    try {
      seenStore(data.frequency ?? "once")?.setItem(SEEN_KEY, data.id);
    } catch {
      /* storage blocked — fine */
    }
  };

  return (
    <Modal open={open} onClose={close} title="" dismissible={dismissible} zIndexClass="z-[120]">
      <div className="relative flex flex-col">
        {dismissible ? (
          <button
            type="button"
            onClick={close}
            aria-label={zh ? "关闭" : "Close"}
            className="absolute -right-1 -top-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-[rgb(var(--text)/0.5)] transition hover:bg-[rgb(var(--text)/0.08)] hover:text-[rgb(var(--text))]"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}

        <div className="flex items-center gap-2 pr-8">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(var(--text)/0.06)] text-[rgb(var(--text)/0.75)]">
            <Megaphone className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="t-eyebrow">{zh ? "公告" : "Announcement"}</span>
        </div>

        {title ? (
          <h2 className="mt-3 pr-8 text-[1.55rem] font-semibold leading-[1.18] tracking-[-0.018em]">
            {title}
          </h2>
        ) : null}

        {body ? (
          <p className="mt-3 whitespace-pre-line text-[0.95rem] leading-[1.65] text-[rgb(var(--text)/0.78)]">
            {body}
          </p>
        ) : null}

        {buttonLabel && buttonUrl ? (
          <a
            href={buttonUrl}
            {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            onClick={close}
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 self-start rounded-xl bg-[rgb(var(--text))] px-5 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90"
          >
            {buttonLabel}
            {isExternal ? <ArrowUpRight className="h-4 w-4" aria-hidden /> : null}
          </a>
        ) : null}

        <div className="mt-6 flex items-center justify-between border-t border-[rgb(var(--glass-stroke-soft)/0.5)] pt-4">
          <Link
            href="/announcements"
            onClick={close}
            className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--text)/0.6)] underline-offset-4 transition hover:text-[rgb(var(--text))] hover:underline"
          >
            {zh ? "查看历史公告" : "View past announcements"}
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </div>
    </Modal>
  );
}
