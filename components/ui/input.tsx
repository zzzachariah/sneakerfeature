import * as React from "react";
import { cn } from "@/lib/utils";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "liquid-interactive w-full rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] px-3 py-2 text-base text-[rgb(var(--text))] outline-none transition duration-200 placeholder:text-[rgb(var(--subtext)/0.75)] hover:border-[rgb(var(--text)/0.35)] focus-visible:border-[rgb(var(--text)/0.6)] focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.32)] md:text-sm",
        props.className
      )}
    />
  );
}
