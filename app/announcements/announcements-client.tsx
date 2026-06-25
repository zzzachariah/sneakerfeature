"use client";

import { ArrowUpRight, Megaphone } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";

export type HistoryEntry = {
  id: string;
  publishedAt?: string | null;
  expiresAt?: string | null;
  duration?: string;
  frequency?: string;
  dismissible?: boolean;
  enabled?: boolean;
  title?: string;
  body?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  titleZh?: string;
  bodyZh?: string;
  buttonLabelZh?: string;
};

function formatDate(iso: string | null | undefined, locale: "en" | "zh"): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const d = new Date(ts);
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

function isExpired(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() >= t;
}

export function AnnouncementsHistory({ items }: { items: HistoryEntry[] }) {
  const { locale } = useLocale();
  const zh = locale === "zh";

  const heading = zh ? "历史公告" : "Past announcements";
  const subtitle = zh
    ? "每一条全站公告的归档记录，最新在前。"
    : "Every site-wide announcement we've sent, newest first.";
  const emptyTitle = zh ? "暂无公告" : "Nothing here yet";
  const emptyBody = zh
    ? "我们还没有发布过站内公告。等之后有新的公告，这里会自动出现。"
    : "We haven't sent out a site-wide announcement yet. When we do, it'll show up here automatically.";

  return (
    <main
      className="container-shell pt-10 md:pt-16"
      style={{ paddingBottom: "calc(var(--mobile-nav-h) + 2rem)" }}
    >
      <div className="mx-auto max-w-3xl">
        <header>
          <p className="t-eyebrow">{zh ? "公告" : "Announcements"}</p>
          <h1 className="t-display-sm mt-2">{heading}</h1>
          <p className="mt-3 text-[0.95rem] leading-[1.7] soft-text">{subtitle}</p>
        </header>

        {items.length === 0 ? (
          <section className="surface-card premium-border ios-glass-announce-empty relative mt-8 flex flex-col items-center gap-3 rounded-3xl p-10 text-center">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[rgb(var(--text)/0.06)] text-[rgb(var(--text)/0.7)]">
              <Megaphone className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="text-lg font-semibold tracking-[-0.01em]">{emptyTitle}</h2>
            <p className="max-w-md text-[0.92rem] leading-[1.7] soft-text">{emptyBody}</p>
          </section>
        ) : (
          <ol className="mt-8 space-y-5">
            {items.map((entry) => (
              <AnnouncementCard key={entry.id} entry={entry} zh={zh} />
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}

function AnnouncementCard({ entry, zh }: { entry: HistoryEntry; zh: boolean }) {
  const title = (zh && entry.titleZh) || entry.title || "";
  const body = (zh && entry.bodyZh) || entry.body || "";
  const buttonLabel = (zh && entry.buttonLabelZh) || entry.buttonLabel || "";
  const buttonUrl = entry.buttonUrl || "";
  const isExternal = /^https?:\/\//i.test(buttonUrl);
  const dateLabel = formatDate(entry.publishedAt, zh ? "zh" : "en");
  const expired = isExpired(entry.expiresAt);

  return (
    <li className="surface-card premium-border rounded-3xl p-6 md:p-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {dateLabel ? (
          <time
            dateTime={entry.publishedAt ?? undefined}
            className="t-eyebrow"
          >
            {dateLabel}
          </time>
        ) : null}
        {expired ? (
          <span className="inline-flex items-center rounded-full border border-[rgb(var(--glass-stroke-soft)/0.6)] px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.18em] text-[rgb(var(--text)/0.55)]">
            {zh ? "已结束" : "Ended"}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-[rgb(var(--accent)/0.45)] bg-[rgb(var(--accent)/0.12)] px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.18em] text-[rgb(var(--text))]">
            {zh ? "进行中" : "Live"}
          </span>
        )}
      </div>

      {title ? (
        <h2 className="mt-2 text-xl font-semibold leading-[1.25] tracking-[-0.014em] md:text-[1.4rem]">
          {title}
        </h2>
      ) : null}

      {body ? (
        <p className="mt-3 whitespace-pre-line text-[0.95rem] leading-[1.7] soft-text">
          {body}
        </p>
      ) : null}

      {buttonLabel && buttonUrl ? (
        <a
          href={buttonUrl}
          {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="mt-5 inline-flex h-10 items-center justify-center gap-1.5 self-start rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.7)] px-4 text-[0.85rem] font-medium text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.04)]"
        >
          {buttonLabel}
          {isExternal ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : null}
        </a>
      ) : null}
    </li>
  );
}
