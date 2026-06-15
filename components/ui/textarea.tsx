import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared styled <textarea>. Same material + focus ring as the Input component so
 * multi-line fields match single-line ones. Pass `className` for `min-h-*` etc.
 */
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "liquid-interactive w-full rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] p-3 text-base text-[rgb(var(--text))] outline-none transition duration-200 placeholder:text-[rgb(var(--subtext)/0.75)] hover:border-[rgb(var(--text)/0.35)] focus:border-[rgb(var(--text)/0.55)] focus:ring-2 focus:ring-[rgb(var(--text)/0.12)] md:text-sm",
        props.className
      )}
    />
  );
}
