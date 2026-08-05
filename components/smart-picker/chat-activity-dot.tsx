"use client";

import { useLocale } from "@/components/i18n/locale-provider";

/**
 * Status dot on a conversation row. A conversation keeps generating after the
 * user switches away, so history has to say which one is still working
 * ("generating", pulsing) and which one finished while they were elsewhere
 * ("new reply", solid). Renders nothing when neither applies.
 */
export function ChatActivityDot({ streaming, unseen }: { streaming: boolean; unseen: boolean }) {
  const { translate } = useLocale();
  if (!streaming && !unseen) return null;
  const label = translate(streaming ? "Generating…" : "New reply");
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={`mr-1.5 h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--brand))] ${streaming ? "animate-pulse" : ""}`}
    />
  );
}
