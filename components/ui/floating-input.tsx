"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string;
  id?: string;
};

export const FloatingInput = React.forwardRef<HTMLInputElement, Props>(
  function FloatingInput({ label, id, className, value, defaultValue, onChange, ...rest }, ref) {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const [internalValue, setInternalValue] = React.useState<string>(
      (typeof defaultValue === "string" ? defaultValue : "") as string
    );
    const effectiveValue =
      typeof value === "string" ? value : typeof value === "number" ? String(value) : internalValue;
    const filled = effectiveValue.length > 0;

    const labelRef = React.useRef<HTMLLabelElement | null>(null);

    const triggerPulse = () => {
      const el = labelRef.current;
      if (!el) return;
      el.classList.remove("label-pulse");
      void el.offsetWidth;
      el.classList.add("label-pulse");
    };

    return (
      <div className="float-wrap relative" data-filled={filled}>
        <input
          ref={ref}
          id={inputId}
          value={value}
          defaultValue={defaultValue}
          onFocus={triggerPulse}
          onChange={(event) => {
            if (typeof value !== "string") {
              setInternalValue(event.target.value);
            }
            onChange?.(event);
          }}
          className={cn(
            "liquid-interactive float-input w-full rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.6)] bg-[rgb(var(--bg-elev)/0.9)] text-[rgb(var(--text))] outline-none transition duration-200 hover:border-[rgb(var(--text)/0.35)] focus:border-[rgb(var(--text)/0.6)] focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.32)]",
            className
          )}
          {...rest}
        />
        <label ref={labelRef} htmlFor={inputId} className="float-label">
          {label}
        </label>
      </div>
    );
  }
);
