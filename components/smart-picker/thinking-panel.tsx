"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Circle, Loader2, Search, X } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { ChatStep } from "@/lib/ai/types";
import styles from "./thinking-panel.module.css";

/** A single live phase; the full event history is available on demand. */
export function ThinkingPanel({ steps, active, zhInput }: {
  steps: ChatStep[];
  active: boolean;
  zhInput?: boolean;
}) {
  const { locale } = useLocale();
  const zh = zhInput ?? locale === "zh";
  const [open, setOpen] = useState(false);
  const wasActive = useRef(active);
  const detailsId = useId();

  useEffect(() => {
    if (wasActive.current && !active) setOpen(false);
    wasActive.current = active;
  }, [active]);

  const hasBody = steps.length > 0;
  // Do not invent stages or timed progress. Use the latest real server phase.
  let currentPhase: string | null = null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.kind === "status" && !step.done) {
      currentPhase = step.text;
      break;
    }
  }

  return (
    <div className={styles.panel} data-picker-progress={active ? "active" : "idle"}>
      <button
        type="button"
        onClick={() => hasBody && setOpen(value => !value)}
        className={styles.header}
        aria-expanded={hasBody ? open : undefined}
        aria-controls={hasBody ? detailsId : undefined}
        aria-disabled={!hasBody}
      >
        {active ? <Loader2 size={14} className={styles.spinner} aria-hidden="true" /> : <Search size={14} className={styles.idleIcon} aria-hidden="true" />}
        <span className={styles.label} role="status" aria-live="polite">
          {active ? currentPhase ?? (zh ? "正在处理…" : "Working on it…") : (zh ? "查看处理过程" : "Process details")}
        </span>
        {hasBody && <ChevronDown size={14} className={styles.chevron} data-open={open} aria-hidden="true" />}
      </button>
      {open && hasBody && (
        <div id={detailsId} className={styles.details}>
          {mergeProse(steps).map((step, i) => (
            <div key={i} className={styles.row} data-failed={step.kind === "activity" && step.state === "fail"}>
              <span className={styles.stepIcon} aria-hidden="true">
                {step.kind === "activity" && step.state === "fail" ? <X size={12} /> :
                  (step.kind === "status" && step.done) || (step.kind === "activity" && step.state === "ok") ? <Check size={12} /> :
                    step.kind === "activity" ? <Search size={12} /> : <Circle size={7} />}
              </span>
              <p>{step.kind === "activity" ? step.text.replace(/^🔍\s*/, "") : step.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Coalesce token fragments only when the member opens the detail view. The
// collapsed live header never rebuilds a long timeline on every streamed token.
function mergeProse(steps: ChatStep[]): ChatStep[] {
  const merged: ChatStep[] = [];
  for (const step of steps) {
    const last = merged[merged.length - 1];
    if (step.kind === "prose" && last?.kind === "prose") last.text += step.text;
    else merged.push({ ...step });
  }
  return merged;
}
