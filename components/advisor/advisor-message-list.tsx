"use client";

// The advisor conversation view: user bubbles (right, brand-tinted) and
// assistant bubbles (left, glass), an empty-state with starter prompts, and a
// typing indicator while the reply streams. Auto-scrolls to the newest turn.
// Per-skin bubble treatments come from the pui-adv--<variant> CSS.

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { PremiumVariant } from "@/components/premium/variants";

export type AdvisorMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
};

const SUGGESTIONS = [
  "I roll my ankles a lot — what should I look for?",
  "Best outdoor shoe for a heavier guard?",
  "Compare a low-to-the-ground feel vs max cushion for me.",
  "I have wide feet and flat arches — any picks?"
];

export function AdvisorMessageList({
  messages,
  variant,
  onSuggestion
}: {
  messages: AdvisorMessage[];
  variant: PremiumVariant;
  onSuggestion: (text: string) => void;
}) {
  const { translate } = useLocale();
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-10 text-center">
        <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgb(var(--brand)/0.12)] text-[rgb(var(--brand))]">
          <Sparkles className="h-6 w-6" aria-hidden />
        </span>
        <p className="text-base font-semibold">{translate("Ask me anything about your next pair")}</p>
        <p className="mt-1.5 max-w-[42ch] text-sm soft-text">
          {translate("I remember your playstyle and foot scan, so just talk to me like you would a knowledgeable friend.")}
        </p>
        <div className="mt-6 grid w-full max-w-lg gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggestion(translate(s))}
              className="pui-adv-suggestion rounded-2xl border border-[rgb(var(--muted)/0.55)] bg-[rgb(var(--bg-elev)/0.4)] px-4 py-3 text-left text-[0.82rem] transition hover:border-[rgb(var(--brand)/0.5)] hover:bg-[rgb(var(--brand)/0.06)]"
            >
              {translate(s)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-1 py-2 pui-adv-scroll pui-adv--${variant}`}>
      {messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="flex justify-end">
            <div className="pui-adv-bubble pui-adv-bubble--user max-w-[85%] rounded-2xl px-4 py-2.5 text-[0.9rem] leading-relaxed">
              {m.content}
            </div>
          </div>
        ) : (
          <div key={m.id} className="flex justify-start">
            <div className="pui-adv-bubble pui-adv-bubble--bot max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[0.9rem] leading-relaxed">
              {m.content ? (
                m.content
              ) : m.streaming ? (
                <TypingDots />
              ) : null}
            </div>
          </div>
        )
      )}
      <div ref={endRef} />
    </div>
  );
}

function TypingDots() {
  return (
    <span className="pui-adv-typing inline-flex items-center gap-1" aria-label="…">
      <span />
      <span />
      <span />
    </span>
  );
}
