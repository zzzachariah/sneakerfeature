"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Sparkles, X } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { ChatStep } from "@/lib/ai/types";

// One live "what the AI is doing" row — a web-search attempt that is in flight
// (spinner), succeeded (check), or failed (cross). The leading 🔍 the server adds
// is dropped here so the status icon carries the meaning.
function ActivityRow({ step }: { step: Extract<ChatStep, { kind: "activity" }> }) {
  const working = step.state === "start";
  const failed = step.state === "fail";
  return (
    <div className={`flex items-start gap-2 text-[0.8rem] leading-relaxed ${working ? "text-[rgb(var(--text))]" : "soft-text"}`}>
      <span className="mt-0.5 shrink-0">
        {working ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : failed ? (
          <X className="h-3.5 w-3.5 text-[rgb(var(--error))]" />
        ) : (
          <Check className="h-3.5 w-3.5 text-[rgb(var(--success))]" />
        )}
      </span>
      <span>{step.text.replace(/^🔍\s*/, "")}</span>
    </div>
  );
}

// The reasoning timeline for one assistant turn: an animated header while the AI
// is working, and the model's natural-language reasoning + search activity below
// (never code/JSON — that is stripped server-side). Collapses to a one-line
// summary once the turn finishes so the answer + cards take focus.
export function ThinkingPanel({ steps, active }: { steps: ChatStep[]; active: boolean }) {
  const { translate } = useLocale();
  const [open, setOpen] = useState(true);
  const wasActive = useRef(active);

  // Collapse exactly once, on the streaming → done transition. After that the
  // user's manual toggle is respected (the effect no longer fires).
  useEffect(() => {
    if (wasActive.current && !active) setOpen(false);
    wasActive.current = active;
  }, [active]);

  const hasBody = steps.length > 0;

  return (
    <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-md border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] px-3.5 py-2">
      <button
        type="button"
        onClick={() => hasBody && setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 text-left ${hasBody ? "cursor-pointer" : "cursor-default"}`}
        aria-expanded={open}
      >
        <Sparkles className={`h-4 w-4 shrink-0 text-[rgb(var(--text))] ${active ? "thinking-glow" : "opacity-70"}`} />
        <span className={`text-[0.82rem] font-medium ${active ? "thinking-shimmer" : "soft-text"}`}>
          {active ? translate("AI is thinking…") : translate("Thought process")}
        </span>
        {active ? (
          <span className="ml-0.5 inline-flex items-end gap-[3px] pb-0.5">
            <span className="thinking-dot h-1 w-1 rounded-full bg-[rgb(var(--text))]" />
            <span className="thinking-dot h-1 w-1 rounded-full bg-[rgb(var(--text))] [animation-delay:0.15s]" />
            <span className="thinking-dot h-1 w-1 rounded-full bg-[rgb(var(--text))] [animation-delay:0.3s]" />
          </span>
        ) : (
          hasBody && <ChevronDown className={`ml-auto h-4 w-4 shrink-0 soft-text transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && hasBody && (
        <div className="mt-2 space-y-1.5 border-l-2 border-[rgb(var(--glass-stroke-soft)/0.5)] pl-3">
          {steps.map((step, i) =>
            step.kind === "prose" ? (
              <p key={i} className="whitespace-pre-wrap text-[0.82rem] leading-relaxed soft-text">
                {step.text}
              </p>
            ) : (
              <ActivityRow key={i} step={step} />
            )
          )}
        </div>
      )}
    </div>
  );
}
