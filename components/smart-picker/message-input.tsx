"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
  // String state so the user can clear "1" and retype — enforce range only on blur.
  const [countStr, setCountStr] = useState("3");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Derived numeric count used for logic and credit display.
  const count = Math.min(MAX_RECOMMENDATIONS, Math.max(1, parseInt(countStr) || 1));
  const insufficient = !unlimited && balance < count;
  const canSend = text.trim().length > 0 && !sending;
  const isReady = canSend && !insufficient;

  useEffect(() => {
    if (prefillText) {
      setText(prefillText);
      requestAnimationFrame(() => growTextarea());
    }
  }, [prefillText]);

  const growTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  };

  const submit = () => {
    if (!isReady) return;
    onSend(text.trim(), count);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleCountChange = (v: string) => {
    // Allow empty string and digits while editing — no NaN hard-stop.
    if (/^\d*$/.test(v)) setCountStr(v);
  };

  const handleCountBlur = () => {
    const v = parseInt(countStr);
    setCountStr(String(isNaN(v) || v < 1 ? 1 : Math.min(MAX_RECOMMENDATIONS, v)));
  };

  return (
    <div
      className="border-t border-[rgb(var(--glass-stroke-soft)/0.35)] bg-[rgb(var(--bg)/0.92)] backdrop-blur-[20px]"
      // env(safe-area-inset-bottom) covers the iOS home indicator — no black bar.
      style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-end gap-3 px-4 pt-3 pb-0.5">
        {/* Auto-growing textarea — h-10 (2.5rem) min-height matches the count
            row and send button so all three sit at the same height on one line.
            py-2 vertically centers the single-line text; 16px prevents iOS
            auto-zoom on focus. */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); growTextarea(); }}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={translate("Describe your ideal sneaker")}
          style={{ fontSize: "16px", lineHeight: "1.5", minHeight: "2.5rem" }}
          className="min-h-0 flex-1 resize-none bg-transparent py-2 outline-none placeholder:text-[rgb(var(--subtext)/0.45)]"
        />

        {/* Count — sized to match the send button so they sit on the same
            line with the same visual height. 16px font prevents iOS zoom. */}
        <div
          className={`flex h-10 shrink-0 items-center text-sm ${
            insufficient ? "text-[rgb(var(--error))]" : "soft-text"
          }`}
        >
          <span>×</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max={MAX_RECOMMENDATIONS}
            value={countStr}
            onChange={(e) => handleCountChange(e.target.value)}
            onBlur={handleCountBlur}
            style={{ fontSize: "16px" }}
            className={`w-8 appearance-none bg-transparent text-center font-semibold outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
              insufficient ? "text-[rgb(var(--error))]" : "text-[rgb(var(--text))]"
            }`}
          />
          <span>{translate("shoes")}</span>
        </div>

        {/* Send button — h-10 matches the count row so both sit at the same
            height on the same line, with a more prominent tappable target. */}
        <button
          type="button"
          onClick={submit}
          disabled={!isReady}
          aria-label={sending ? translate("AI is thinking…") : translate("Send")}
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.2)] ${
            sending
              ? "bg-[rgb(var(--text))] text-[rgb(var(--bg))]"
              : isReady
                ? "bg-[rgb(var(--text))] text-[rgb(var(--bg))] shadow-[0_3px_10px_rgb(var(--glass-shadow)/0.18)] hover:scale-105 active:scale-95"
                : "cursor-not-allowed bg-[rgb(var(--text)/0.1)] text-[rgb(var(--subtext))]"
          }`}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          )}
        </button>
      </div>
    </div>
  );
}
