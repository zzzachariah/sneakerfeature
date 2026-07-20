"use client";

// The advisor's message composer: an auto-growing textarea with a send button,
// Enter-to-send (Shift+Enter for newline), plus the insufficient-allowance and
// error banners. Sends on submit and clears; disabled while a reply streams.

import Link from "next/link";
import type { Route } from "next";
import { useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";

export function AdvisorComposer({
  onSend,
  disabled,
  insufficient,
  error,
  initialValue
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  insufficient: boolean;
  error: string | null;
  /** Pre-fill (e.g. the shoe-page concierge question). Not auto-sent. */
  initialValue?: string;
}) {
  const { translate } = useLocale();
  const [value, setValue] = useState(initialValue ?? "");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const grow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    });
  };

  return (
    <div className="pt-3">
      {insufficient ? (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--brand)/0.4)] bg-[rgb(var(--brand)/0.08)] px-3.5 py-2.5 text-sm">
          <span>{translate("You've used this month's allowance. It refreshes on your next cycle.")}</span>
          {SUBSCRIBE_LIVE ? (
            <Link href={"/subscribe" as Route} className="shrink-0 font-semibold text-[rgb(var(--brand))] underline-offset-2 hover:underline">
              {translate("Details")}
            </Link>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div className="mb-2 rounded-xl border border-[rgb(var(--error)/0.4)] bg-[rgb(var(--error)/0.08)] px-3.5 py-2.5 text-sm text-[rgb(var(--error))]">
          {error}
        </div>
      ) : null}

      <div className="pui-adv-composer flex items-end gap-2 rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] p-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            grow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={translate("Ask your advisor…")}
          className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2 text-[0.92rem] outline-none placeholder:text-[rgb(var(--subtext)/0.7)]"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          aria-label={translate("Send")}
          className="tap-44 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--brand))] text-[rgb(var(--brand-contrast))] transition hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
