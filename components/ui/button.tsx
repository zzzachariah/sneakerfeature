import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonStyles = cva(
  "liquid-interactive inline-flex min-h-[40px] items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium tracking-[-0.01em] transition duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.2)] md:min-h-0",
  {
    variants: {
      variant: {
        primary:
          "border-[rgb(var(--text))] bg-[rgb(var(--text))] font-semibold text-[rgb(var(--bg))] hover:shadow-[0_8px_24px_rgb(var(--shadow)/0.3)] active:scale-[0.98]",
        secondary:
          "border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] text-[rgb(var(--text))] hover:border-[rgb(var(--text)/0.4)] hover:bg-[rgb(var(--surface))]",
        ghost:
          "border-transparent bg-transparent text-[rgb(var(--subtext))] hover:border-[rgb(var(--text)/0.4)] hover:text-[rgb(var(--text))]"
      }
    },
    defaultVariants: {
      variant: "primary"
    }
  }
);

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {}

export function Button({ className, variant, ...props }: Props) {
  return <button className={cn(buttonStyles({ variant }), className)} {...props} />;
}
