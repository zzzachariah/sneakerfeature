import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "glass-lite glass-rim liquid-interactive relative rounded-2xl spotlight",
        className
      )}
      {...props}
    />
  );
}
