"use client";

// The running-session bar: a floating Liquid Glass capsule that follows you
// around the app while the court timer is going.
//
// It exists because the timer is not a page — it's a state you're in. Once a
// run starts you go and look at shoes; without this you'd have to navigate back
// to /closet to stop it, and a timer you can't reach is a timer that gets left
// running. Same reason it mirrors the Dynamic Island's controls exactly: the
// two are the same object, seen from inside and outside the app.
//
// Nothing renders when no run is going, so this costs a null on every page.

import { useEffect, useState } from "react";
import { Check, Pause, Play, Square } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { formatElapsed } from "@/lib/closet/court-session";
import { useCourtSession, useElapsed } from "@/components/closet/court-session-provider";

/** How long the "已记录 1.5h" confirmation stays up after a run ends. */
const CONFIRM_MS = 4500;

export function CourtSessionBar() {
  const { translate } = useLocale();
  const { session, running, busy, pause, resume, stop } = useCourtSession();
  const elapsed = useElapsed(session);
  const [flash, setFlash] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), CONFIRM_MS);
    return () => window.clearTimeout(id);
  }, [flash]);

  if (!session && !flash) return null;

  async function handleStop() {
    const result = await stop();
    if (result.status === "logged") {
      setFlash({
        text: `${translate("Logged")} ${Math.round(result.hours * 100) / 100}h`,
        error: false
      });
    } else if (result.status === "too-short") {
      setFlash({ text: translate("Too short to log"), error: false });
    } else {
      setFlash({ text: result.message, error: true });
    }
  }

  return (
    <div className="court-bar pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3">
      {session ? (
        <div className="glass-strong glass-rim glass-clip pointer-events-auto relative flex w-full max-w-md items-center gap-3 rounded-full py-2 pl-4 pr-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--brand))] ${running ? "animate-pulse" : "opacity-40"}`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8rem] font-medium leading-tight">
              {session.shoeName || translate("Court timer")}
            </p>
            <p className="num-display text-[0.72rem] leading-tight soft-text tabular-nums">
              {formatElapsed(elapsed)}
              {!running ? ` · ${translate("Paused")}` : ""}
            </p>
          </div>

          <button
            type="button"
            onClick={running ? pause : resume}
            disabled={busy}
            aria-label={translate(running ? "Pause" : "Resume")}
            className="glass-interactive tap-44 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[rgb(var(--text)/0.08)] transition hover:bg-[rgb(var(--text)/0.14)] disabled:opacity-50"
          >
            {running ? (
              <Pause className="h-4 w-4 fill-current" aria-hidden />
            ) : (
              <Play className="h-4 w-4 fill-current" aria-hidden />
            )}
          </button>

          <button
            type="button"
            onClick={() => void handleStop()}
            disabled={busy}
            aria-label={translate("Stop and log")}
            className="glass-interactive tap-44 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[rgb(var(--text))] text-[rgb(var(--bg))] transition hover:opacity-90 disabled:opacity-50"
          >
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
          </button>
        </div>
      ) : flash ? (
        // Only the confirmation is announced. Putting aria-live on the wrapper
        // would make the ticking clock — and the pause/stop buttons inside it —
        // a live region, which a screen reader would read out every second.
        <div
          role="status"
          aria-live="polite"
          className={`glass-strong glass-rim glass-clip pointer-events-auto relative flex max-w-md items-center gap-2 rounded-full px-4 py-2.5 text-[0.82rem] ${
            flash.error ? "text-[rgb(var(--error))]" : ""
          }`}
        >
          {!flash.error ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
          <span className="truncate">{flash.text}</span>
        </div>
      ) : null}
    </div>
  );
}
