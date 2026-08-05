"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowUp, ChevronRight, Crown, Loader2 } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { ModelPicker } from "@/components/smart-picker/model-picker";
import { MAX_RECOMMENDATIONS } from "@/lib/ai/types";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";
import { hasUnmeteredBase, tierConfig, type ModelId, type Tier } from "@/lib/subscription/tiers";

type Props = {
  balance: number;
  unlimited: boolean;
  sending: boolean;
  // Every concurrent turn is taken by OTHER conversations. Hold the send (and
  // say why) rather than accepting text that would be silently refused.
  atTurnLimit: boolean;
  tier: Tier;
  model: ModelId | null;
  onSelectModel: (id: ModelId) => void;
  onSend: (message: string, count: number) => void;
  /**
   * Mirrors the effective ×N up to the parent. The follow-up composer sends
   * straight into the same conversation and must bill at the same count the
   * user picked here — without this it would silently fall back to a default.
   */
  onCountChange?: (count: number) => void;
  prefillText?: string;
  // Bumps on every suggestion tap. Keying the prefill effect on this (not on the
  // text) makes tapping the SAME suggestion twice re-fill the box — two taps
  // produce identical text, so a text-keyed effect would skip the second one.
  prefillNonce?: number;
};

// Composer box height, in px, kept in sync with the Tailwind classes on the
// textarea (`min-h-14 sm:min-h-10`, `py-4 sm:py-2`) — JS owns the auto-grow so
// both have to agree on where a single line rests and where growth stops.
// The phone gets 56px rather than 40px: on a narrow screen the model chip, the
// ×N count and the send button eat most of the row, so at 40px the composer read
// as a sliver and sat under the 44px native tap target.
const COMPOSER_H = {
  phone: { rest: 56, max: 160 },
  wide: { rest: 40, max: 128 },
};

export function MessageInput({ balance, unlimited, sending, atTurnLimit, tier, model, onSelectModel, onSend, onCountChange, prefillText, prefillNonce = 0 }: Props) {
  const { translate } = useLocale();
  const [text, setText] = useState("");
  // String state so the user can clear "1" and retype — enforce range only on blur.
  const [countStr, setCountStr] = useState("3");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // How many picks this plan may actually ask for (Free 3 / Pro 5 / Max 8).
  // /api/ai/chat silently clamps `count` to exactly this, so letting the box go
  // to MAX_RECOMMENDATIONS promised shoes the server was never going to return —
  // and, worse, priced the request at the typed number: a free member with 5
  // credits who typed ×8 saw "insufficient" and had the send button disabled for
  // a request that would have cost 3 and succeeded.
  const maxCount = Math.min(MAX_RECOMMENDATIONS, tierConfig(tier).prompt.count);

  // Derived numeric count used for logic and credit display.
  const count = Math.min(maxCount, Math.max(1, parseInt(countStr) || 1));

  // The tier arrives asynchronously (/api/ai/credits), so a value typed against
  // the optimistic "free" cap is re-clamped once the real plan lands — upward
  // for a paid member whose cap just grew, downward after a downgrade.
  useEffect(() => {
    const typed = parseInt(countStr);
    if (!Number.isNaN(typed) && typed > maxCount) setCountStr(String(maxCount));
  }, [maxCount, countStr]);

  // Publish the effective count so the follow-up composer bills identically.
  useEffect(() => {
    onCountChange?.(count);
  }, [count, onCountChange]);

  // Only the FREE tier is metered by ai_credits. A paid plan's base model is
  // unmetered server-side, so its credit balance is irrelevant here — gate on
  // the tier as well as the flag so a stale/absent `unlimited` can never lock a
  // paying member out of the composer.
  const metered = !unlimited && !hasUnmeteredBase(tier);
  const insufficient = metered && balance < count;
  const canSend = text.trim().length > 0 && !sending;
  const isReady = canSend && !insufficient && !atTurnLimit;

  useEffect(() => {
    if (prefillNonce > 0 && prefillText) {
      setText(prefillText);
      requestAnimationFrame(() => growTextarea());
    }
    // Keyed on the nonce so every tap fires, even when prefillText is unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillNonce]);

  const growTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    // Phones get the taller box (see COMPOSER_H) — read the breakpoint at grow
    // time so a rotation into landscape falls back to the compact desktop bar.
    const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches;
    const { rest, max } = wide ? COMPOSER_H.wide : COMPOSER_H.phone;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, rest), max)}px`;
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
    setCountStr(String(isNaN(v) || v < 1 ? 1 : Math.min(maxCount, v)));
  };

  return (
    <div
      className="border-t border-[rgb(var(--glass-stroke-soft)/0.35)] bg-[rgb(var(--bg)/0.92)] backdrop-blur-[20px]"
      // env(safe-area-inset-bottom) covers the iOS home indicator — no black bar.
      style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
    >
      {/* Other conversations are already using every concurrent turn. Say so
          here — the send button is held, and a silent no-op would look broken. */}
      {atTurnLimit && (
        <p className="mx-4 mt-3 text-xs soft-text">
          {translate("Other conversations are still generating — you can send here once one of them finishes.")}
        </p>
      )}

      {/* Peak-intent upsell: a free user is out of credits right when they want
          another pick. Basic reasoning is unlimited on Pro. */}
      {insufficient && SUBSCRIBE_LIVE && (
        <Link
          href="/subscribe"
          className="mx-4 mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition active:scale-[0.99]"
          style={{ background: "linear-gradient(135deg, rgba(217,180,90,0.16), rgba(217,180,90,0.06))", border: "1px solid rgba(217,180,90,0.4)", color: "rgb(var(--text))" }}
        >
          <Crown className="h-3.5 w-3.5 shrink-0" style={{ color: "rgb(var(--gold-ink))" }} />
          <span className="flex-1">{translate("Out of credits? Go unlimited with Pro.")}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "rgb(var(--gold-ink))" }} />
        </Link>
      )}

      <div className="flex items-end gap-3 px-4 pt-3 pb-0.5">
        {/* Auto-growing textarea — rests at h-14 on phones, h-10 from sm up, with
            the single line vertically centered by the padding so it sits on the
            same line and the same height as the ×N count and the send button.
            16px font prevents iOS auto-zoom on focus. */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); growTextarea(); }}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={translate("Describe what you're looking for (e.g. responsive cushioning for a guard)…")}
          style={{ fontSize: "16px", lineHeight: "1.5" }}
          className="min-h-[3.5rem] flex-1 resize-none bg-transparent py-4 outline-none placeholder:text-[rgb(var(--subtext)/0.45)] sm:min-h-[2.5rem] sm:py-2"
        />

        {/* Model chip — a box as tall as the resting textarea (matching the count
            row and the send button) with the h-8 pill centered inside, so all
            four controls share one baseline while the pill stays visually light. */}
        <div className="flex h-14 shrink-0 items-center sm:h-10">
          <ModelPicker tier={tier} model={model} onSelect={onSelectModel} />
        </div>

        {/* Count — sized to match the send button so they sit on the same
            line with the same visual height. 16px font prevents iOS zoom. */}
        <div
          className={`flex h-14 shrink-0 items-center text-sm sm:h-10 ${
            insufficient ? "text-[rgb(var(--error))]" : "soft-text"
          }`}
        >
          <span>×</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max={maxCount}
            title={translate("Shoes per pick")}
            aria-label={translate("Shoes per pick")}
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

        {/* Send button — the h-10 circle rides in a box as tall as the resting
            textarea and the count row, so all four controls sit centered on the
            same line while the button keeps its own size. */}
        <div className="flex h-14 shrink-0 items-center sm:h-10">
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
    </div>
  );
}
