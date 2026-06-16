"use client";

import { useCallback, useRef, useState } from "react";
import { Check, ChevronsRight, Loader2 } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { VerifyAction } from "@/lib/human-verify";

// In-site "are you human" check: drag the handle to the right edge. On release
// we send the drag's timing/step signals to /api/verify, which returns a
// short-lived signed token. No third-party script, so it works the same in the
// browser and inside the Capacitor / Electron webviews.

const HANDLE = 44; // px — keep in sync with the handle's h-11 w-11 classes
const TRACK_H = 44;

type Status = "idle" | "verifying" | "done" | "error";

type Props = {
  action: VerifyAction;
  onToken: (token: string) => void;
};

export function HumanCheck({ action, onToken }: Props) {
  const { translate } = useLocale();
  const trackRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  const [x, setX] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [dragging, setDragging] = useState(false);

  const xRef = useRef(0);
  const startTimeRef = useRef(0);
  const movesRef = useRef(0);
  const startPointerRef = useRef(0);
  const startXRef = useRef(0);

  const setPos = useCallback((v: number) => {
    xRef.current = v;
    setX(v);
  }, []);

  const getMaxX = useCallback(() => {
    const w = trackRef.current?.getBoundingClientRect().width ?? 0;
    return Math.max(0, w - HANDLE);
  }, []);

  const reset = useCallback(() => {
    setPos(0);
    movesRef.current = 0;
    startTimeRef.current = 0;
  }, [setPos]);

  const complete = useCallback(
    async (maxX: number) => {
      setStatus("verifying");
      setPos(maxX);
      const dragMs = startTimeRef.current ? performance.now() - startTimeRef.current : 0;
      const distanceRatio = maxX > 0 ? Math.min(1, xRef.current / maxX) : 0;
      try {
        const res = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, dragMs, distanceRatio, moves: movesRef.current })
        });
        const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; token?: string };
        if (res.ok && data.ok && typeof data.token === "string") {
          setStatus("done");
          onToken(data.token);
          return;
        }
      } catch {
        // fall through to error
      }
      setStatus("error");
      reset();
    },
    [action, onToken, reset, setPos]
  );

  function onPointerDown(e: React.PointerEvent) {
    if (status === "done" || status === "verifying") return;
    e.preventDefault();
    handleRef.current?.setPointerCapture(e.pointerId);
    setDragging(true);
    setStatus("idle");
    startTimeRef.current = performance.now();
    movesRef.current = 0;
    startPointerRef.current = e.clientX;
    startXRef.current = xRef.current;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const maxX = getMaxX();
    const next = Math.min(maxX, Math.max(0, startXRef.current + (e.clientX - startPointerRef.current)));
    movesRef.current += 1;
    setPos(next);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragging) return;
    setDragging(false);
    handleRef.current?.releasePointerCapture?.(e.pointerId);
    const maxX = getMaxX();
    if (xRef.current >= maxX - 3) complete(maxX);
    else reset();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (status === "done" || status === "verifying") return;
    const maxX = getMaxX();
    const step = Math.max(8, maxX / 10);
    if (!startTimeRef.current) startTimeRef.current = performance.now();
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      movesRef.current += 1;
      const next = Math.min(maxX, xRef.current + step);
      setPos(next);
      if (next >= maxX - 1) complete(maxX);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      setPos(Math.max(0, xRef.current - step));
    } else if (e.key === "Home") {
      e.preventDefault();
      reset();
    }
  }

  const maxX = getMaxX();
  const valueNow = maxX > 0 ? Math.round((x / maxX) * 100) : 0;
  const done = status === "done";

  const label = done
    ? translate("Verified")
    : status === "verifying"
      ? translate("Verifying...")
      : translate("Slide right to verify");

  return (
    <div className="w-full select-none">
      <div
        ref={trackRef}
        className={`relative w-full overflow-hidden rounded-xl border text-sm ${
          done
            ? "border-emerald-500/50 bg-emerald-500/10"
            : "border-[rgb(var(--muted)/0.5)] bg-[rgb(var(--bg-elev)/0.6)]"
        }`}
        style={{ height: TRACK_H }}
      >
        {/* progress fill behind the handle */}
        <div
          className={`absolute inset-y-0 left-0 ${done ? "bg-emerald-500/20" : "bg-[rgb(var(--accent)/0.22)]"}`}
          style={{ width: x + HANDLE, transition: dragging ? "none" : "width 220ms cubic-bezier(0.22,1,0.36,1)" }}
        />
        {/* centred instruction / status label */}
        <div
          className={`pointer-events-none absolute inset-0 flex items-center justify-center px-12 text-center ${
            done ? "font-medium text-emerald-400" : "soft-text"
          }`}
        >
          {label}
        </div>
        {/* draggable handle */}
        <div
          ref={handleRef}
          role="slider"
          tabIndex={done || status === "verifying" ? -1 : 0}
          aria-label={translate("Human verification: slide the handle to the right")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={valueNow}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className={`absolute left-0 top-0 flex h-11 w-11 items-center justify-center rounded-lg text-white outline-none ${
            done
              ? "cursor-default bg-emerald-500"
              : "cursor-grab bg-[rgb(var(--accent))] focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent)/0.6)] active:cursor-grabbing"
          }`}
          style={{ transform: `translateX(${x}px)`, transition: dragging ? "none" : "transform 220ms cubic-bezier(0.22,1,0.36,1)", touchAction: "none" }}
        >
          {done ? (
            <Check className="h-5 w-5" />
          ) : status === "verifying" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ChevronsRight className="h-5 w-5" />
          )}
        </div>
      </div>
      {status === "error" && (
        <p className="mt-1.5 text-xs text-rose-400">{translate("Verification failed. Please slide again.")}</p>
      )}
    </div>
  );
}
