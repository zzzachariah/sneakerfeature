"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "framer-motion";

export type CodeInputStatus = "idle" | "error" | "success";

export type CodeInputHandle = {
  focus: () => void;
  clear: () => void;
};

type Props = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  /** Fires once every box is filled (typing or paste). */
  onComplete?: (value: string) => void;
  status?: CodeInputStatus;
  disabled?: boolean;
  label?: string;
};

const SPRING = { type: "spring", stiffness: 520, damping: 30, mass: 0.6 } as const;

/**
 * One box per digit. Typing advances, Backspace steps back, arrows move,
 * pasting (or iOS/Android one-time-code autofill) fills every box at once.
 * Animations: digits pop in, the focused box lifts with a brand ring, boxes
 * ripple green on success and the row shakes on error. Reduced motion is honored.
 */
export const CodeInput = forwardRef<CodeInputHandle, Props>(function CodeInput(
  { length = 8, value, onChange, onComplete, status = "idle", disabled, label = "Verification code" },
  ref
) {
  const reduce = useReducedMotion();
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const [focused, setFocused] = useState<number | null>(null);
  const row = useAnimationControls();
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");
  // Latest value, readable synchronously between a keystroke and the re-render
  // (fast typing / held Backspace can outrun React).
  const valueRef = useRef(value);
  valueRef.current = value;

  const focusAt = useCallback(
    (i: number) => {
      const el = inputs.current[Math.max(0, Math.min(length - 1, i))];
      el?.focus();
      el?.select();
    },
    [length]
  );

  useImperativeHandle(ref, () => ({
    focus: () => focusAt(Math.min(value.length, length - 1)),
    clear: () => {
      valueRef.current = "";
      onChange("");
      requestAnimationFrame(() => focusAt(0));
    }
  }), [focusAt, length, onChange, value.length]);

  // Shake the whole row when a code is rejected.
  useEffect(() => {
    if (status !== "error") return;
    if (reduce) return;
    void row.start({ x: [0, -10, 9, -7, 5, -2, 0], transition: { duration: 0.45, ease: "easeOut" } });
  }, [status, reduce, row]);

  function commit(next: string, focusIndex: number) {
    const clean = next.replace(/\D/g, "").slice(0, length);
    valueRef.current = clean;
    onChange(clean);
    if (clean.length === length) {
      inputs.current[focusIndex]?.blur();
      onComplete?.(clean);
    } else {
      // Move focus synchronously so the very next keystroke lands in the right box.
      focusAt(focusIndex);
    }
  }

  function handleInput(i: number, raw: string) {
    const value = valueRef.current;
    const digits = Array.from({ length }, (_, k) => value[k] ?? "");
    let typed = raw.replace(/\D/g, "");
    if (!typed) return;
    // Typing over a digit whose selection was lost yields "old+new": keep the new one.
    if (typed.length === 2 && digits[i] && typed.includes(digits[i])) {
      typed = typed[0] === digits[i] ? typed[1] : typed[0];
    }
    // Several digits at once = paste or OTP autofill: spread them from this box.
    if (typed.length > 1) {
      const merged = (value.slice(0, i) + typed).slice(0, length);
      commit(merged, Math.min(merged.length, length - 1));
      return;
    }
    // Focus never sits past the first empty box, so this either replaces a
    // digit or appends one — the value stays contiguous.
    commit(value.slice(0, i) + typed + value.slice(i + 1), Math.min(i + 1, length - 1));
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    const value = valueRef.current;
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[i]) {
        commit(value.slice(0, i) + value.slice(i + 1), i);
      } else if (i > 0) {
        commit(value.slice(0, i - 1) + value.slice(i), i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusAt(Math.min(i + 1, value.length));
    } else if (e.key === "Delete") {
      e.preventDefault();
      commit(value.slice(0, i) + value.slice(i + 1), i);
    }
  }

  function handlePaste(i: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const value = valueRef.current;
    const text = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!text) return;
    e.preventDefault();
    const merged = (value.slice(0, i) + text).slice(0, length);
    commit(merged, Math.min(merged.length, length - 1));
  }

  // Clicking anywhere in the row lands on the next box to fill.
  function handleFocus(i: number) {
    const target = Math.min(valueRef.current.length, length - 1);
    if (i > target) {
      focusAt(target);
      return;
    }
    setFocused(i);
    requestAnimationFrame(() => inputs.current[i]?.select());
  }

  const half = length % 2 === 0 && length >= 6 ? length / 2 : -1;

  return (
    <motion.div
      animate={row}
      role="group"
      aria-label={label}
      className="flex w-full items-center justify-center gap-1.5 sm:gap-2"
    >
      {digits.map((digit, i) => {
        const isActive = focused === i && !disabled;
        const tone =
          status === "error"
            ? "rgb(var(--error))"
            : status === "success"
              ? "rgb(var(--success))"
              : isActive
                ? "rgb(var(--brand))"
                : digit
                  ? "rgb(var(--text) / 0.35)"
                  : "rgb(var(--text) / 0.14)";
        return (
          <div key={i} className="contents">
            {i === half && (
              <span aria-hidden className="mx-0.5 h-0.5 w-2 shrink-0 rounded-full bg-[rgb(var(--text)/0.25)] sm:mx-1 sm:w-3" />
            )}
            <motion.div
              className="relative aspect-[4/5] min-w-0 flex-1 basis-0"
              style={{ maxWidth: 52 }}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{
                opacity: 1,
                y: isActive && !reduce ? -2 : 0,
                scale: status === "success" && !reduce ? [1, 1.08, 1] : 1
              }}
              transition={
                status === "success"
                  ? { duration: 0.35, delay: reduce ? 0 : i * 0.04, ease: "easeOut" }
                  : { ...SPRING, delay: reduce ? 0 : i * 0.03 }
              }
            >
              {/* Border + glow use CSS transitions: theme colors are CSS variables,
                  which the browser interpolates but framer-motion cannot. */}
              <div
                aria-hidden
                className="otp-box absolute inset-0 rounded-xl"
                style={{
                  borderWidth: 1.5,
                  borderStyle: "solid",
                  background: "rgb(var(--surface))",
                  borderColor: tone,
                  boxShadow: isActive
                    ? "0 0 0 4px rgb(var(--brand) / 0.18), 0 6px 18px rgb(var(--brand) / 0.12)"
                    : status === "error"
                      ? "0 0 0 3px rgb(var(--error) / 0.15), 0 0 0 0 rgb(var(--error) / 0)"
                      : status === "success"
                        ? "0 0 0 3px rgb(var(--success) / 0.18), 0 0 0 0 rgb(var(--success) / 0)"
                        : "0 0 0 0 rgb(var(--brand) / 0), 0 0 0 0 rgb(var(--brand) / 0)"
                }}
              />
              {!digit && isActive && <span aria-hidden className="otp-caret" />}
              <AnimatePresence mode="popLayout" initial={false}>
                {digit && (
                  <motion.span
                    key={`${i}-${digit}`}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 flex items-center justify-center text-[clamp(1.1rem,4.8vw,1.65rem)] font-semibold tabular-nums text-[rgb(var(--text))]"
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: -6 }}
                    transition={SPRING}
                  >
                    <span className="otp-digit">{digit}</span>
                  </motion.span>
                )}
              </AnimatePresence>
              <input
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                value={digit}
                onChange={(e) => handleInput(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={(e) => handlePaste(i, e)}
                onFocus={() => handleFocus(i)}
                onBlur={() => setFocused((f) => (f === i ? null : f))}
                disabled={disabled}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                // Allow a full-length paste/autofill into any box.
                maxLength={length}
                aria-label={`${label} digit ${i + 1} of ${length}`}
                aria-invalid={status === "error" || undefined}
                className="absolute inset-0 h-full w-full cursor-text rounded-xl bg-transparent text-center text-transparent caret-transparent outline-none selection:bg-transparent disabled:cursor-not-allowed"
              />
            </motion.div>
          </div>
        );
      })}
    </motion.div>
  );
});
