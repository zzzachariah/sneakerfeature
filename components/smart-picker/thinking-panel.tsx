"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, Sparkles, X } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { ChatStep } from "@/lib/ai/types";

// A coarse pipeline phase ("reading the catalog…"). Spins while it's the
// current phase, checks off once the next phase (or `done`) supersedes it.
function StatusRow({ step, active, isLast }: { step: Extract<ChatStep, { kind: "status" }>; active: boolean; isLast: boolean }) {
  const running = !step.done && active;
  return (
    <div className="relative flex items-start gap-3">
      {!isLast && (
        <span className="absolute left-[0.4375rem] top-5 h-full w-px bg-[rgb(var(--glass-stroke-soft)/0.5)]" />
      )}
      <span
        className={`relative z-10 mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
          running
            ? "border-[rgb(var(--text)/0.4)] bg-[rgb(var(--bg))]"
            : "border-[rgb(var(--success))] bg-[rgb(var(--success)/0.15)]"
        }`}
      >
        {running ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin text-[rgb(var(--text)/0.7)]" />
        ) : (
          <Check className="h-2.5 w-2.5 text-[rgb(var(--success))]" />
        )}
      </span>
      <p
        className={`min-w-0 flex-1 pb-2.5 text-[0.8rem] font-medium leading-relaxed ${
          running ? "text-[rgb(var(--text)/0.9)]" : "soft-text"
        }`}
      >
        {step.text}
      </p>
    </div>
  );
}

function ActivityRow({ step, isLast }: { step: Extract<ChatStep, { kind: "activity" }>; isLast: boolean }) {
  const working = step.state === "start";
  const failed = step.state === "fail";

  const dotColor = working
    ? "border-[rgb(var(--text)/0.4)] bg-[rgb(var(--bg))]"
    : failed
      ? "border-[rgb(var(--error))] bg-[rgb(var(--error)/0.15)]"
      : "border-[rgb(var(--success))] bg-[rgb(var(--success)/0.15)]";

  const icon = working ? (
    <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[rgb(var(--text)/0.6)]" />
  ) : failed ? (
    <X className="h-2.5 w-2.5 text-[rgb(var(--error))]" />
  ) : (
    <Check className="h-2.5 w-2.5 text-[rgb(var(--success))]" />
  );

  return (
    <div className="relative flex items-start gap-3">
      {/* Timeline connector */}
      {!isLast && (
        <span className="absolute left-[0.4375rem] top-5 h-full w-px bg-[rgb(var(--glass-stroke-soft)/0.5)]" />
      )}
      {/* Dot */}
      <span
        className={`relative z-10 mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${dotColor}`}
      >
        {icon}
      </span>
      <div className={`flex min-w-0 flex-1 items-center gap-1.5 pb-2.5 text-[0.8rem] leading-relaxed ${working ? "" : "soft-text"}`}>
        <Search className="h-3 w-3 shrink-0 opacity-50" />
        <span className="truncate">{step.text.replace(/^🔍\s*/, "")}</span>
      </div>
    </div>
  );
}

function ProseRow({ text, isLast }: { text: string; isLast: boolean }) {
  return (
    <div className="relative flex items-start gap-3">
      {!isLast && (
        <span className="absolute left-[0.4375rem] top-5 h-full w-px bg-[rgb(var(--glass-stroke-soft)/0.5)]" />
      )}
      <span className="relative z-10 mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--text)/0.2)] bg-[rgb(var(--text)/0.06)]">
        <span className="h-1 w-1 rounded-full bg-[rgb(var(--text)/0.5)]" />
      </span>
      <p className="min-w-0 flex-1 whitespace-pre-wrap pb-2.5 text-[0.82rem] leading-relaxed soft-text">{text}</p>
    </div>
  );
}

/**
 * @param zhInput Whether the user's request for THIS turn was Chinese. The step
 *   rows are already written in that language (the server localizes them from
 *   the machine-readable phase), so the panel's own chrome follows it too —
 *   otherwise an English timeline sat under a Chinese "思考过程" heading for any
 *   zh-UI user who typed in English. `undefined` falls back to the UI locale,
 *   which is right for the pre-send placeholder that has no request yet.
 */
export function ThinkingPanel({
  steps,
  active,
  zhInput
}: {
  steps: ChatStep[];
  active: boolean;
  zhInput?: boolean;
}) {
  const { translate } = useLocale();
  const [open, setOpen] = useState(true);
  const wasActive = useRef(active);

  useEffect(() => {
    if (wasActive.current && !active) setOpen(false);
    wasActive.current = active;
  }, [active]);

  const hasBody = steps.length > 0;
  const thinkingLabel =
    zhInput === undefined ? translate("AI is thinking…") : zhInput ? "AI 思考中…" : "AI is thinking…";
  const doneLabel =
    zhInput === undefined ? translate("Thought process") : zhInput ? "思考过程" : "Thought process";

  // While streaming, the header IS the live status line — "what is it doing
  // right now" — instead of a static "AI is thinking…". The most recent
  // unchecked status step is the current phase.
  let currentPhase: string | null = null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.kind === "status" && !s.done) {
      currentPhase = s.text;
      break;
    }
  }

  return (
    <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-md border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] px-3.5 py-2.5">
      <button
        type="button"
        onClick={() => hasBody && setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 text-left ${hasBody ? "cursor-pointer" : "cursor-default"}`}
        aria-expanded={open}
      >
        <Sparkles
          className={`h-4 w-4 shrink-0 transition-opacity ${active ? "thinking-glow text-[rgb(var(--text))]" : "opacity-50"}`}
        />
        <span className={`text-[0.82rem] font-medium ${active ? "thinking-shimmer" : "soft-text"}`}>
          {active ? currentPhase ?? thinkingLabel : doneLabel}
        </span>
        {active ? (
          <span className="ml-0.5 inline-flex items-end gap-[3px] pb-0.5">
            <span className="thinking-dot h-1 w-1 rounded-full bg-[rgb(var(--text))]" />
            <span className="thinking-dot h-1 w-1 rounded-full bg-[rgb(var(--text))] [animation-delay:0.15s]" />
            <span className="thinking-dot h-1 w-1 rounded-full bg-[rgb(var(--text))] [animation-delay:0.3s]" />
          </span>
        ) : (
          hasBody && (
            <ChevronDown
              className={`ml-auto h-4 w-4 shrink-0 soft-text transition-transform ${open ? "rotate-180" : ""}`}
            />
          )
        )}
      </button>

      {open && hasBody && (
        <div className="mt-3">
          {mergeProse(steps).map((step, i, arr) => {
            const isLast = i === arr.length - 1;
            return step.kind === "prose" ? (
              <ProseRow key={i} text={step.text} isLast={isLast} />
            ) : step.kind === "status" ? (
              <StatusRow key={i} step={step} active={active} isLast={isLast} />
            ) : (
              <ActivityRow key={i} step={step} isLast={isLast} />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Stream text deltas arrive as many tiny prose fragments (one step per token
// chunk), which used to render as a jittery dotted row per fragment. Coalesce
// consecutive prose steps into one paragraph run; activity chips stay discrete.
function mergeProse(steps: ChatStep[]): ChatStep[] {
  const merged: ChatStep[] = [];
  for (const s of steps) {
    const last = merged[merged.length - 1];
    if (s.kind === "prose" && last?.kind === "prose") last.text += s.text;
    else merged.push({ ...s });
  }
  return merged;
}
