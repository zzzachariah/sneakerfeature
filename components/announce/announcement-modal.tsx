"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { ArrowUpRight, ChevronLeft, ChevronRight, Megaphone, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useLocale } from "@/components/i18n/locale-provider";

// Site-wide announcement popup. Content is published either from
// /admin/announcements (writes to the `announcements` table) or — for
// back-compat — by the "Publish Announcement" GitHub Action
// (.github/workflows/announcement.yml), which writes public/announcement.json.
// The popup polls /api/announcements/active which returns the FULL set of
// enabled + non-expired announcements (newest first), falling back to the
// static JSON file so legacy publishes keep showing up. Because the iOS /
// Android apps are thin shells that load the live site, the same popup
// reaches web + both apps with no rebuild.
//
// When more than one announcement is live at once, the popup renders a
// swipeable card stack: each card has its own dismiss button + per-id seen
// tracking so dismissing one doesn't dismiss the rest. When only one is live,
// the popup collapses to its classic single-card layout.
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

// Per-id seen map. Replaces the previous single-key SEEN_KEY so the user can
// dismiss one announcement at a time when multiple are live without losing the
// others' dismissal state. Stored separately for "once" (localStorage) and
// "session" (sessionStorage) tiers — the storage choice matches frequency.
const SEEN_MAP_KEY = "sf-announcement-seen-map";
const LEGACY_SEEN_KEY = "sf-announcement-seen"; // pre-stack single-id storage
const CLIENT_ID_KEY = "sf-client-id";

function freqStore(freq: Frequency): Storage | null {
  if (typeof window === "undefined") return null;
  if (freq === "session") return window.sessionStorage;
  if (freq === "once") return window.localStorage;
  return null; // "always" — never remember
}

function readSeenIds(freq: Frequency): Set<string> {
  const store = freqStore(freq);
  if (!store) return new Set();
  const seen = new Set<string>();
  try {
    const raw = store.getItem(SEEN_MAP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") {
        for (const id of Object.keys(parsed)) if (id) seen.add(id);
      }
    }
    // Back-compat: pre-stack builds wrote a single id under SEEN_KEY. Treat
    // that id as also seen so an upgrade doesn't re-pop the last dismissed
    // announcement. Read-only — leave the old key in place harmlessly.
    const legacy = store.getItem(LEGACY_SEEN_KEY);
    if (legacy) seen.add(legacy);
  } catch {
    /* storage blocked (private mode) — fall through with empty set */
  }
  return seen;
}

function markSeen(id: string, freq: Frequency): void {
  const store = freqStore(freq);
  if (!store) return;
  try {
    const raw = store.getItem(SEEN_MAP_KEY);
    const map: Record<string, number> =
      raw && typeof raw === "string"
        ? ((): Record<string, number> => {
            try {
              const parsed = JSON.parse(raw);
              return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
            } catch {
              return {};
            }
          })()
        : {};
    map[id] = Date.now();
    store.setItem(SEEN_MAP_KEY, JSON.stringify(map));
  } catch {
    /* storage blocked — fine, popup will simply re-show next time */
  }
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
  const [items, setItems] = useState<Announcement[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  // ids we've already POSTed a view for in this tab so we don't spam the
  // /view endpoint when the user swipes back and forth across the stack.
  const viewedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Stable signature of the last opened set so the poll loop doesn't
    // re-pop the same stack — including across the "always" tier which has no
    // storage-side memory.
    let lastOpenedSig: string | null = null;

    const computeStack = (raw: Announcement[]): Announcement[] => {
      const live: Announcement[] = [];
      // We need to filter per-frequency since the seen set lives in different
      // stores ("once" → localStorage, "session" → sessionStorage, "always"
      // → never remembered). Read both stores once and reuse.
      const seenOnce = readSeenIds("once");
      const seenSession = readSeenIds("session");
      for (const a of raw) {
        if (!a || !a.id || !a.enabled) continue;
        if (isExpired(a.expiresAt)) continue;
        const freq: Frequency = a.frequency ?? "once";
        const seen = freq === "session" ? seenSession : freq === "once" ? seenOnce : null;
        if (seen?.has(a.id)) continue;
        live.push(a);
      }
      return live;
    };

    const check = async () => {
      if (cancelled) return;
      try {
        // Cache-bust + no-store so a freshly published announcement shows up
        // without waiting on any CDN/static caching. The endpoint now returns
        // the full active list (newest first); it also accepts an array shape
        // historically returned as a single object — we tolerate both.
        const res = await fetch(`/api/announcements/active?ts=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json()) as Announcement | Announcement[] | null;
        const raw: Announcement[] = Array.isArray(payload)
          ? payload
          : payload && typeof payload === "object"
          ? [payload]
          : [];
        if (cancelled) return;
        const next = computeStack(raw);
        if (next.length === 0) return;
        const sig = next.map((n) => n.id).join("|");
        if (sig === lastOpenedSig) return;
        lastOpenedSig = sig;

        setItems(next);
        setActive(0);
        if (timer) clearTimeout(timer);
        // Small delay so it doesn't fight the first-run language / cookie flows.
        timer = setTimeout(() => {
          if (!cancelled) setOpen(true);
        }, 400);

        // Fire-and-forget: tell the server this viewer saw each card. The
        // endpoint dedupes by (user|client) per id, so re-posts from the same
        // viewer are ignored. Track in `viewedRef` to avoid re-POSTing on
        // every swipe within this tab.
        const clientId = getOrCreateClientId();
        for (const a of next) {
          if (viewedRef.current.has(a.id)) continue;
          viewedRef.current.add(a.id);
          fetch(`/api/announcements/${encodeURIComponent(a.id)}/view`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId }),
            keepalive: true,
          }).catch(() => {
            /* network error — view count will be off by one, not fatal */
          });
        }
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

  const zh = locale === "zh";

  const dismissOne = useCallback(
    (id: string) => {
      const target = items.find((it) => it.id === id);
      if (!target) return;
      markSeen(target.id, target.frequency ?? "once");
      setItems((prev) => {
        const next = prev.filter((p) => p.id !== id);
        if (next.length === 0) setOpen(false);
        return next;
      });
      // Keep the active index valid against the shrinking stack.
      // - Card BEFORE the active one was dismissed → indices shifted left by 1.
      // - Card AT the active index was dismissed → keep `prev` so the slot now
      //   shows what was the next card, clamped to the new tail.
      // - Card AFTER the active one → active stays put, just clamp.
      setActive((prev) => {
        const removedIdx = items.findIndex((it) => it.id === id);
        const newLen = items.length - 1;
        if (newLen <= 0) return 0;
        if (removedIdx === -1) return Math.min(prev, newLen - 1);
        if (removedIdx < prev) return Math.max(0, prev - 1);
        return Math.min(prev, newLen - 1);
      });
    },
    [items]
  );

  const dismissAll = useCallback(() => {
    for (const it of items) markSeen(it.id, it.frequency ?? "once");
    setItems([]);
    setOpen(false);
  }, [items]);

  const onModalClose = useCallback(() => {
    // The X / scrim close = "dismiss all remaining". This matches the previous
    // single-card behaviour (close = remembered). Frequency rules still apply
    // — markSeen is a no-op for the "always" tier.
    dismissAll();
  }, [dismissAll]);

  if (items.length === 0) return null;

  const current = items[Math.max(0, Math.min(active, items.length - 1))];
  if (!current) return null;

  // Overall modal dismissibility = every card in the stack allows dismissal.
  // If any one is non-dismissible we suppress the scrim/X close so the user
  // has to interact with it deliberately (single-card historical behaviour).
  const modalDismissible = items.every((it) => it.dismissible !== false);

  return (
    <Modal
      open={open}
      onClose={onModalClose}
      title=""
      dismissible={modalDismissible}
      zIndexClass="z-[120]"
    >
      {items.length === 1 ? (
        <SingleAnnouncementBody
          item={current}
          zh={zh}
          onDismiss={() => dismissOne(current.id)}
        />
      ) : (
        <CardStackBody
          items={items}
          active={active}
          setActive={setActive}
          zh={zh}
          onDismissOne={dismissOne}
          onDismissAll={dismissAll}
        />
      )}
    </Modal>
  );
}

/* ── Layouts ──────────────────────────────────────────────────────────────── */

function SingleAnnouncementBody({
  item,
  zh,
  onDismiss,
}: {
  item: Announcement;
  zh: boolean;
  onDismiss: () => void;
}) {
  const title = (zh && item.titleZh) || item.title || "";
  const body = (zh && item.bodyZh) || item.body || "";
  const buttonLabel = (zh && item.buttonLabelZh) || item.buttonLabel || "";
  const buttonUrl = item.buttonUrl || "";
  const dismissible = item.dismissible !== false;
  const isExternal = /^https?:\/\//i.test(buttonUrl);

  return (
    <div className="relative flex flex-col">
      {dismissible ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={zh ? "关闭" : "Close"}
          className="absolute -right-1 -top-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-[rgb(var(--text)/0.5)] transition hover:bg-[rgb(var(--text)/0.08)] hover:text-[rgb(var(--text))] sm:h-9 sm:w-9"
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
          onClick={onDismiss}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 self-start rounded-xl bg-[rgb(var(--text))] px-5 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90"
        >
          {buttonLabel}
          {isExternal ? <ArrowUpRight className="h-4 w-4" aria-hidden /> : null}
        </a>
      ) : null}

      <div className="mt-6 flex items-center justify-between border-t border-[rgb(var(--glass-stroke-soft)/0.5)] pt-4">
        <Link
          href="/announcements"
          onClick={onDismiss}
          className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--text)/0.6)] underline-offset-4 transition hover:text-[rgb(var(--text))] hover:underline"
        >
          {zh ? "查看历史公告" : "View past announcements"}
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function CardStackBody({
  items,
  active,
  setActive,
  zh,
  onDismissOne,
  onDismissAll,
}: {
  items: Announcement[];
  active: number;
  setActive: (n: number | ((prev: number) => number)) => void;
  zh: boolean;
  onDismissOne: (id: string) => void;
  onDismissAll: () => void;
}) {
  const total = items.length;
  const current = items[active];

  const go = useCallback(
    (delta: number) => {
      setActive((prev) => {
        const next = (prev + delta + total) % total;
        return next;
      });
    },
    [setActive, total]
  );

  // Keyboard ← / → flip the stack.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.stopPropagation();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.stopPropagation();
        go(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const SWIPE = 60;
      if (info.offset.x < -SWIPE || info.velocity.x < -500) go(1);
      else if (info.offset.x > SWIPE || info.velocity.x > 500) go(-1);
    },
    [go]
  );

  // Pre-compute the visible stack window (active + up to 2 behind) so the
  // animation can show a sense of depth without rendering every card.
  const visible = useMemo(() => {
    const window: { item: Announcement; offset: number }[] = [];
    for (let i = 0; i < total; i++) {
      const offset = i - active;
      if (offset >= -1 && offset <= 2) window.push({ item: items[i], offset });
    }
    return window;
  }, [items, active, total]);

  return (
    <div className="relative flex flex-col">
      {/* Header row: counter + dismiss-all. The per-card X lives ON each card. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(var(--text)/0.06)] text-[rgb(var(--text)/0.75)]">
            <Megaphone className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="t-eyebrow">
            {zh ? "公告" : "Announcements"} ·{" "}
            <span className="num-display">
              {active + 1} / {total}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={onDismissAll}
          className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--glass-stroke-soft)/0.6)] px-2.5 py-1 text-[0.7rem] font-medium text-[rgb(var(--text)/0.6)] transition hover:border-[rgb(var(--glass-stroke-soft))] hover:text-[rgb(var(--text))]"
        >
          {zh ? "全部关闭" : "Dismiss all"}
        </button>
      </div>

      {/* Stack viewport. min-h keeps short cards from collapsing the area so
          the depth illusion + swipe gesture remain stable across card sizes. */}
      <div className="relative mt-4 min-h-[20rem] sm:min-h-[22rem]">
        <AnimatePresence initial={false}>
          {visible.map(({ item, offset }) => {
            const isActive = offset === 0;
            return (
              <motion.div
                key={item.id}
                className="absolute inset-0 flex"
                drag={isActive ? "x" : false}
                dragElastic={0.18}
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={isActive ? handleDragEnd : undefined}
                initial={{ opacity: 0, scale: 0.94, y: 16 }}
                animate={{
                  opacity: offset < 0 ? 0 : Math.max(0.45, 1 - offset * 0.18),
                  scale: 1 - Math.max(0, offset) * 0.04,
                  y: Math.max(0, offset) * 14,
                  zIndex: 50 - Math.abs(offset),
                  pointerEvents: isActive ? "auto" : "none",
                }}
                exit={{ opacity: 0, scale: 0.92, y: -24, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 320, damping: 32 }}
                style={{ touchAction: isActive ? "pan-y" : "none" }}
              >
                <StackCard item={item} zh={zh} onDismiss={() => onDismissOne(item.id)} />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Dots + prev/next. Dots are tappable for direct jumps. */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label={zh ? "上一条" : "Previous"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgb(var(--glass-stroke-soft)/0.6)] text-[rgb(var(--text)/0.7)] transition hover:border-[rgb(var(--glass-stroke-soft))] hover:text-[rgb(var(--text))] sm:h-9 sm:w-9"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1.5" role="tablist" aria-label="Announcement cards">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`${zh ? "公告" : "Announcement"} ${i + 1}`}
              onClick={() => setActive(i)}
              className={
                i === active
                  ? "h-2 w-6 rounded-full bg-[rgb(var(--text))] transition-all"
                  : "h-2 w-2 rounded-full bg-[rgb(var(--text)/0.25)] transition-all hover:bg-[rgb(var(--text)/0.45)]"
              }
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => go(1)}
          aria-label={zh ? "下一条" : "Next"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgb(var(--glass-stroke-soft)/0.6)] text-[rgb(var(--text)/0.7)] transition hover:border-[rgb(var(--glass-stroke-soft))] hover:text-[rgb(var(--text))] sm:h-9 sm:w-9"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 border-t border-[rgb(var(--glass-stroke-soft)/0.5)] pt-3">
        <Link
          href="/announcements"
          onClick={onDismissAll}
          className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--text)/0.6)] underline-offset-4 transition hover:text-[rgb(var(--text))] hover:underline"
        >
          {zh ? "查看历史公告" : "View past announcements"}
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function StackCard({
  item,
  zh,
  onDismiss,
}: {
  item: Announcement;
  zh: boolean;
  onDismiss: () => void;
}) {
  const title = (zh && item.titleZh) || item.title || "";
  const body = (zh && item.bodyZh) || item.body || "";
  const buttonLabel = (zh && item.buttonLabelZh) || item.buttonLabel || "";
  const buttonUrl = item.buttonUrl || "";
  const dismissible = item.dismissible !== false;
  const isExternal = /^https?:\/\//i.test(buttonUrl);

  return (
    <div className="surface-card premium-border ios-glass-announce-stack-card relative flex w-full flex-col overflow-hidden rounded-2xl p-5">
      {dismissible ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={zh ? "关闭这条" : "Dismiss"}
          className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-[rgb(var(--text)/0.5)] transition hover:bg-[rgb(var(--text)/0.08)] hover:text-[rgb(var(--text))]"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      {title ? (
        <h2 className="pr-10 text-[1.3rem] font-semibold leading-[1.22] tracking-[-0.014em]">
          {title}
        </h2>
      ) : null}

      {body ? (
        <p className="mt-2 whitespace-pre-line text-[0.92rem] leading-[1.6] text-[rgb(var(--text)/0.78)]">
          {body}
        </p>
      ) : null}

      {buttonLabel && buttonUrl ? (
        <a
          href={buttonUrl}
          {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          onClick={onDismiss}
          className="mt-4 inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl bg-[rgb(var(--text))] px-4 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90"
        >
          {buttonLabel}
          {isExternal ? <ArrowUpRight className="h-4 w-4" aria-hidden /> : null}
        </a>
      ) : null}
    </div>
  );
}
