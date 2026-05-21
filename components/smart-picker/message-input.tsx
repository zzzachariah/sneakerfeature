"use client";

import { useState, type KeyboardEvent } from "react";
import { Minus, Plus, Send } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { MAX_RECOMMENDATIONS } from "@/lib/ai/types";

type Props = {
  balance: number;
  sending: boolean;
  onSend: (message: string, count: number) => void;
  onOpenRecharge: () => void;
};

export function MessageInput({ balance, sending, onSend, onOpenRecharge }: Props) {
  const { translate } = useLocale();
  const [text, setText] = useState("");
  const [count, setCount] = useState(1);

  const insufficient = balance < count;
  const canSend = text.trim().length > 0 && !sending;

  const adjust = (delta: number) => setCount((c) => Math.min(MAX_RECOMMENDATIONS, Math.max(1, c + delta)));

  const submit = () => {
    if (!canSend) return;
    if (insufficient) {
      onOpenRecharge();
      return;
    }
    onSend(text.trim(), count);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-[rgb(var(--glass-stroke-soft)/0.4)] bg-[rgb(var(--bg)/0.6)] p-3 backdrop-blur-md">
      <div className="surface-card premium-border rounded-2xl p-2.5 transition focus-within:shadow-[0_0_0_3px_rgb(var(--text)/0.07)]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={translate("Describe what you're looking for (e.g. responsive cushioning for a guard)…")}
          className="w-full resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-[rgb(var(--subtext)/0.7)]"
        />

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[0.72rem] soft-text">{translate("Recommend")}</span>
            <div className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] p-0.5">
              <button
                type="button"
                onClick={() => adjust(-1)}
                disabled={count <= 1}
                aria-label={translate("Decrease")}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-[rgb(var(--text)/0.08)] disabled:opacity-40"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-5 text-center text-sm font-semibold tabular-nums">{count}</span>
              <button
                type="button"
                onClick={() => adjust(1)}
                disabled={count >= MAX_RECOMMENDATIONS}
                aria-label={translate("Increase")}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-[rgb(var(--text)/0.08)] disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <span className="text-[0.72rem] soft-text">{translate("shoes")}</span>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[rgb(var(--text))] px-4 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
            {translate("Send")}
          </button>
        </div>
      </div>

      <div className="mt-1.5 px-1 text-[0.72rem] soft-text">
        {insufficient ? (
          <span className="text-[rgb(var(--error))]">
            {translate("Insufficient balance")} ({translate("Balance")} {balance} {translate("credits")}).{" "}
            <button type="button" onClick={onOpenRecharge} className="font-semibold underline">
              {translate("Go recharge")}
            </button>
          </span>
        ) : (
          <span>
            {translate("This will use")} {count} {translate("credits")} · {translate("Balance")} {balance} {translate("credits")}
          </span>
        )}
      </div>
    </div>
  );
}
