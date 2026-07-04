import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared empty / zero-state card. One consistent shape for "nothing here yet",
 * "sign in to…", and "no results" across the app (favorites, search, dashboard,
 * smart-picker…), replacing the hand-rolled one-off cards each screen grew.
 *
 * Token-based and theme-aware; pass a lucide icon, a title, an optional
 * description, and any action(s) as children.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  align = "center",
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children?: React.ReactNode;
  align?: "center" | "start";
  className?: string;
}) {
  const centered = align === "center";
  return (
    <div
      className={cn(
        "surface-card premium-border relative mx-auto flex max-w-md flex-col rounded-2xl px-6 py-10",
        centered ? "items-center text-center" : "items-start text-left",
        className
      )}
    >
      {Icon ? (
        <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(var(--text)/0.06)] text-[rgb(var(--subtext))]">
          <Icon className="h-6 w-6" />
        </span>
      ) : null}
      <h2 className="text-base font-semibold tracking-[-0.01em]">{title}</h2>
      {description ? (
        <p className={cn("mt-2 text-sm soft-text", centered ? "max-w-sm" : "")}>{description}</p>
      ) : null}
      {children ? <div className={cn("mt-5", centered ? "w-full max-w-xs" : "w-full")}>{children}</div> : null}
    </div>
  );
}
