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
            <div className="flex items-center gap-1">
              {QUICK_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={`h-6 min-w-[1.5rem] rounded-full px-1.5 text-[0.72rem] font-semibold transition ${
                    count === n
                      ? "bg-[rgb(var(--text))] text-[rgb(var(--bg))]"
                      : "border border-[rgb(var(--glass-stroke-soft)/0.6)] hover:bg-[rgb(var(--text)/0.07)]"
                  }`}
                >
                  {n}
                </button>
              ))}
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
          <span className="font-medium text-[rgb(var(--error))]">
            {translate("Insufficient balance")} · {translate("Balance")} {balance} {translate("credits")}
          </span>
        ) : (
          <span>
            {translate("This will use")} <span className="font-semibold text-[rgb(var(--text))]">{count}</span>{" "}
            {translate("credits")} · {translate("Balance")} {unlimited ? "∞" : balance} {translate("credits")}
          </span>
        )}
      </div>
    </div>
  );
}
