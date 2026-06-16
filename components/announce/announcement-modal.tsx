"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useLocale } from "@/components/i18n/locale-provider";

// Site-wide announcement popup. Content is published by the "Publish
// Announcement" GitHub Action (.github/workflows/announcement.yml), which writes
// public/announcement.json on main and triggers a deploy. Because the iOS /
// Android apps are thin shells that load the live site, the same popup reaches
// web + both apps with no rebuild.
//
// `frequency` controls how often a given announcement (keyed by `id`) reappears:
//   - "once"    → shown once per user, ever (localStorage).      [default]
//   - "session" → shown once per app/tab open (sessionStorage).
//   - "always"  → shown on every page load.
// Publishing a new announcement always gets a fresh `id`, so it re-pops for
// everyone regardless of the previous one being dismissed.
type Frequency = "once" | "session" | "always";

type Announcement = {
  id: string;
  enabled?: boolean;
  frequency?: Frequency;
  dismissible?: boolean;
  title?: string;
  body?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  titleZh?: string;
  bodyZh?: string;
  buttonLabelZh?: string;
};

const SEEN_KEY = "sf-announcement-seen";

function seenStore(freq: Frequency): Storage | null {
  if (typeof window === "undefined") return null;
  if (freq === "session") return window.sessionStorage;
  if (freq === "once") return window.localStorage;
  return null; // "always" — never remember
}

export function AnnouncementModal() {
  const { locale } = useLocale();
  const [data, setData] = useState<Announcement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Cache-bust + no-store so a freshly published announcement shows up without
    // waiting on any CDN/static caching.
    fetch(`/announcement.json?ts=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((a: Announcement | null) => {
        if (cancelled || !a || !a.enabled || !a.id) return;
        const freq: Frequency = a.frequency ?? "once";
        try {
          if (seenStore(freq)?.getItem(SEEN_KEY) === a.id) return;
        } catch {
          /* storage blocked (private mode) — just show it */
        }
        setData(a);
        // Small delay so it doesn't fight the first-run language / cookie flows.
        timer = setTimeout(() => {
          if (!cancelled) setOpen(true);
        }, 400);
      })
      .catch(() => {
        /* offline / no announcement — show nothing */
      });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
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

        {title ? (
          <h2 className="pr-8 text-xl font-semibold tracking-[0.01em]">{title}</h2>
        ) : null}

        {body ? (
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[rgb(var(--text)/0.75)]">
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
          </a>
        ) : null}
      </div>
    </Modal>
  );
}
