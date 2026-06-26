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

  const handleCountChange = (raw: string) => {
    const v = parseInt(raw);
    if (isNaN(v)) return;
    setCount(Math.min(MAX_RECOMMENDATIONS, Math.max(1, v)));
  };

  return (
    <div className="flex justify-center px-4 pb-5 pt-2 ios-glass-composer-bar">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-[rgb(var(--glass-stroke-soft)/0.5)] bg-[rgb(var(--surface)/0.82)] shadow-[0_8px_32px_rgb(var(--glass-shadow)/0.14)] backdrop-blur-[28px] backdrop-saturate-[160%]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={translate("Describe what you're looking for (e.g. responsive cushioning for a guard)…")}
          className="w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[0.95rem] outline-none placeholder:text-[rgb(var(--subtext)/0.5)] md:text-sm"
        />

        <div className="flex items-center justify-between gap-3 px-4 pb-3.5 pt-1.5">
          {/* Inline count */}
          <div className={`flex items-center gap-1 ${insufficient ? "text-[rgb(var(--error))]" : "soft-text"}`}>
            <span className="text-[0.78rem]">×</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max={MAX_RECOMMENDATIONS}
              value={count}
              onChange={(e) => handleCountChange(e.target.value)}
              className={`w-7 appearance-none bg-transparent text-center text-sm font-semibold outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                insufficient ? "text-[rgb(var(--error))]" : "text-[rgb(var(--text))]"
              }`}
            />
            <span className="text-[0.78rem]">{translate("shoes")}</span>
          </div>

          {/* Send */}
          <button
            type="button"
            onClick={submit}
            disabled={!isReady}
            aria-label={sending ? translate("AI is thinking…") : translate("Send")}
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.2)] ${
              sending
                ? "bg-[rgb(var(--text))] text-[rgb(var(--bg))]"
                : isReady
                  ? "bg-[rgb(var(--text))] text-[rgb(var(--bg))] shadow-[0_4px_14px_rgb(var(--glass-shadow)/0.2)] hover:scale-105 active:scale-95"
                  : "cursor-not-allowed bg-[rgb(var(--text)/0.1)] text-[rgb(var(--subtext))]"
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
    </div>
  );
}
