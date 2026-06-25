"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { haptics } from "@/lib/native/haptics";

const buttonStyles = cva(
  "liquid-interactive inline-flex min-h-[44px] items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium tracking-[-0.01em] transition duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.35)] md:min-h-[36px]",
  {
    variants: {
      variant: {
        primary:
          "border-[rgb(var(--text))] bg-[rgb(var(--text))] font-semibold text-[rgb(var(--bg))] hover:shadow-[0_8px_24px_rgb(var(--shadow)/0.3)] active:scale-[0.98]",
        secondary:
          "border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] text-[rgb(var(--text))] hover:border-[rgb(var(--text)/0.4)] hover:bg-[rgb(var(--surface))] active:scale-[0.98]",
        ghost:
          "border-transparent bg-transparent text-[rgb(var(--subtext))] hover:border-[rgb(var(--text)/0.4)] hover:text-[rgb(var(--text))] active:scale-[0.98]",
        glass:
          "glass-rim glass-interactive relative border-[rgb(var(--glass-stroke-soft)/0.5)] bg-[rgb(var(--glass-tint)/0.5)] text-[rgb(var(--text))] backdrop-blur-md backdrop-saturate-[180%] hover:bg-[rgb(var(--glass-tint)/0.7)] active:scale-[0.98]"
      }
    },
    defaultVariants: {
      variant: "primary"
    }
  }
);

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {}

export function Button({ className, variant, onClick, ...props }: Props) {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Routine tap feedback on every button press. Centralised here so every CTA
    // in the app gets it for free; no-ops on web and (for routine taps) on
    // Android, per the haptics design in lib/native/haptics.ts.
    haptics.tap();
    onClick?.(event);
  };
  return <button className={cn(buttonStyles({ variant }), className)} {...props} onClick={handleClick} />;
}
