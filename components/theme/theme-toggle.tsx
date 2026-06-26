"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Laptop } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/i18n/locale-provider";
import { Tooltip } from "@/components/ui/tooltip";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (theme === "system") {
    localStorage.removeItem("theme");
    return;
  }
  root.classList.add(theme);
  localStorage.setItem("theme", theme);
}

const cycleOrder: Theme[] = ["system", "light", "dark"];

export function ThemeToggle({ className }: { className?: string }) {
  const { translate } = useLocale();
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = (localStorage.getItem("theme") as Theme | null) ?? "system";
    setTheme(stored);
    applyTheme(stored);
  }, []);

  function cycleTheme() {
    const index = cycleOrder.indexOf(theme);
    const next = cycleOrder[(index + 1) % cycleOrder.length];
    setTheme(next);
    applyTheme(next);
  }

  const icon =
    theme === "dark" ? (
      <Moon className="h-[18px] w-[18px] md:h-[14px] md:w-[14px]" />
    ) : theme === "light" ? (
      <Sun className="h-[18px] w-[18px] md:h-[14px] md:w-[14px]" />
    ) : (
      <Laptop className="h-[18px] w-[18px] md:h-[14px] md:w-[14px]" />
    );

  const translatedTheme = translate(theme);

  return (
    <Tooltip label={`${translate("Theme")}: ${translatedTheme}`}>
      <button
        type="button"
        onClick={cycleTheme}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--subtext))] transition-[background-color,color,transform] duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[rgb(var(--text)/0.08)] hover:text-[rgb(var(--text))] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)] md:h-8 md:w-8",
          className
        )}
        aria-label={`${translate("Theme")}: ${translatedTheme}. ${translate("Click to cycle theme.")}`}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

export function ThemeInitScript({ nonce }: { nonce?: string }) {
  const code = `(() => { try { const t = localStorage.getItem('theme'); if (t === 'light' || t === 'dark') document.documentElement.classList.add(t); } catch (e) {} })();`;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: code }} />;
}
