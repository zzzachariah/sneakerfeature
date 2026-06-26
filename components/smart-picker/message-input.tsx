"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { MAX_RECOMMENDATIONS } from "@/lib/ai/types";

type Props = {
  balance: number;
  unlimited: boolean;
  sending: boolean;
  onSend: (message: string, count: number) => void;
  prefillText?: string;
};

const QUICK_COUNTS = [1, 3, 5, 10].filter((n) => n <= MAX_RECOMMENDATIONS);

export function MessageInput({ balance, unlimited, sending, onSend, prefillText }: Props) {
  const { translate } = useLocale();
  const [text, setText] = useState("");
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (prefillText) setText(prefillText);
  }, [prefillText]);

  const insufficient = !unlimited && balance < count;
  const canSend = text.trim().length > 0 && !sending;
  const isReady = canSend && !insufficient;

  const submit = () => {
    if (!isReady) return;
    onSend(text.trim(), count);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-[rgb(var(--glass-stroke-soft)/0.4)] bg-[rgb(var(--bg)/0.66)] p-3 backdrop-blur-[26px] backdrop-saturate-[180%] ios-glass-composer-bar">
      <div className="surface-card premium-border rounded-2xl transition focus-within:shadow-[0_0_0_3px_rgb(var(--text)/0.07)]">
        {/* Textarea */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={translate("Describe what you're looking for (e.g. responsive cushioning for a guard)…")}
          className="w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-base md:text-sm outline-none placeholder:text-[rgb(var(--subtext)/0.6)]"
        />

        {/* Toolbar row */}
        <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
          {/* Count chips */}
          <div className="flex items-center gap-1.5">
            {QUICK_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={`h-7 min-w-[1.75rem] rounded-full px-2 text-[0.76rem] font-semibold transition-all ${
                  count === n
                    ? "bg-[rgb(var(--text))] text-[rgb(var(--bg))] shadow-[0_2px_8px_rgb(var(--glass-shadow)/0.18)]"
                    : "bg-[rgb(var(--text)/0.06)] text-[rgb(var(--subtext))] hover:bg-[rgb(var(--text)/0.12)] hover:text-[rgb(var(--text))]"
                }`}
              >
                {n}
              </button>
            ))}
            <span className="ml-0.5 text-[0.72rem] soft-text">
              {translate("shoes")}
            </span>
          </div>

          {/* Send button */}
          <button
            type="button"
            onClick={submit}
            disabled={!isReady}
            aria-label={sending ? translate("AI is thinking…") : translate("Send")}
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)] ${
              sending
                ? "bg-[rgb(var(--text))] text-[rgb(var(--bg))]"
                : isReady
                  ? "bg-[rgb(var(--text))] text-[rgb(var(--bg))] shadow-[0_4px_14px_rgb(var(--glass-shadow)/0.22)] hover:scale-105 active:scale-95"
                  : "cursor-not-allowed bg-[rgb(var(--text)/0.12)] text-[rgb(var(--subtext))]"
            }`}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" strokeWidth={2.4} />
            )}
          </button>
        </div>
      </div>

      {/* Credit status — below card */}
      <div className="mt-1.5 px-1 text-[0.71rem]">
        {insufficient ? (
          <span className="font-medium text-[rgb(var(--error))]">
            {translate("Insufficient balance")} · {balance} {translate("credits")} {translate("remaining")}
          </span>
        ) : (
          <span className="soft-text">
            {count} {translate("credits")} · {translate("Balance")} {unlimited ? "∞" : balance}
          </span>
        )}
      </div>
    </div>
  );
}
