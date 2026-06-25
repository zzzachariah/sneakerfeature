"use client";

import { useState, type KeyboardEvent } from "react";
import { ArrowUp, Loader2, Minus, Plus } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { MAX_RECOMMENDATIONS } from "@/lib/ai/types";

type Props = {
  balance: number;
  unlimited: boolean;
  sending: boolean;
  onSend: (message: string, count: number) => void;
};

export function MessageInput({ balance, unlimited, sending, onSend }: Props) {
  const { translate } = useLocale();
  const [text, setText] = useState("");
  const [count, setCount] = useState(1);

  const insufficient = !unlimited && balance < count;
  const canSend = text.trim().length > 0 && !sending;
  const isReady = canSend && !insufficient;

  const adjust = (delta: number) => setCount((c) => Math.min(MAX_RECOMMENDATIONS, Math.max(1, c + delta)));

  const submit = () => {
    if (!canSend) return;
    if (insufficient) return;
    onSend(text.trim(), count);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // While a CJK IME is composing a character, Enter confirms the candidate —
    // it must NOT submit. `isComposing` covers modern browsers; keyCode 229 is
    // the legacy WebKit/IE signal for the same state.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-[rgb(var(--glass-stroke-soft)/0.4)] bg-[rgb(var(--bg)/0.66)] p-3 backdrop-blur-[26px] backdrop-saturate-[180%] ios-glass-composer-bar">
      <div className="surface-card premium-border rounded-2xl p-2.5 transition focus-within:shadow-[0_0_0_3px_rgb(var(--text)/0.07)]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={translate("Describe what you're looking for (e.g. responsive cushioning for a guard)…")}
          className="w-full resize-none bg-transparent px-1.5 py-1 text-base md:text-sm outline-none placeholder:text-[rgb(var(--subtext)/0.7)]"
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
                className="tap-44 relative inline-flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-[rgb(var(--text)/0.08)] disabled:opacity-50"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-5 text-center text-sm font-semibold tabular-nums">{count}</span>
              <button
                type="button"
                onClick={() => adjust(1)}
                disabled={count >= MAX_RECOMMENDATIONS}
                aria-label={translate("Increase")}
                className="tap-44 relative inline-flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-[rgb(var(--text)/0.08)] disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <span className="text-[0.72rem] soft-text">{translate("shoes")}</span>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={!isReady}
            aria-label={sending ? translate("AI is thinking…") : translate("Send")}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)] ${
              sending
                ? "bg-[rgb(var(--text))] text-[rgb(var(--bg))]"
                : isReady
                  ? "bg-[rgb(var(--text))] text-[rgb(var(--bg))] shadow-[0_6px_16px_rgb(var(--glass-shadow)/0.22)] hover:scale-105 active:scale-95"
                  : "cursor-not-allowed bg-[rgb(var(--text)/0.14)] text-[rgb(var(--subtext))]"
            }`}
          >
            {sending ? (
              <Loader2 className="h-[1.05rem] w-[1.05rem] animate-spin" />
            ) : (
              <ArrowUp className="h-[1.05rem] w-[1.05rem]" strokeWidth={2.4} />
            )}
          </button>
        </div>
      </div>

      <div className="mt-1.5 px-1 text-[0.72rem] soft-text">
        {insufficient ? (
          <span className="text-[rgb(var(--error))]">
            {translate("Insufficient balance")} ({translate("Balance")} {balance} {translate("credits")}).
          </span>
        ) : (
          <span>
            {translate("This will use")} {count} {translate("credits")} · {translate("Balance")} {unlimited ? "∞" : balance} {translate("credits")}
          </span>
        )}
      </div>
    </div>
  );
}
