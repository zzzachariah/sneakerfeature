import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared styled <select>. Matches the Input component's material (border / bg /
 * focus ring) and the app's 44px-on-mobile / 36px-on-desktop touch-target
 * height, with a built-in chevron. Pass `className` to tweak width etc. at the
 * call site (the chevron + relative wrapper are handled here).
 */
export function Select({
  className,
  wrapperClassName,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <select
        {...props}
        className={cn(
          "liquid-interactive h-11 w-full appearance-none rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] pl-3 pr-9 text-base text-[rgb(var(--text))] outline-none transition duration-200 hover:border-[rgb(var(--text)/0.35)] focus-visible:border-[rgb(var(--text)/0.6)] focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.32)] md:h-9 md:text-sm",
          className
        )}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--subtext))]" />
    </div>
  );
}
