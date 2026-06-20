"use client";

import { Sparkles, CalendarCheck, Bookmark } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";

// One shared "what signing in gets you" block, so every prompt across the app
// states the same three concrete benefits instead of a different vague line.
const BENEFITS = [
  { icon: Sparkles, text: "Personalized match scores for your playstyle" },
  { icon: CalendarCheck, text: "Weekly hand-picked shoes" },
  { icon: Bookmark, text: "Saved ratings & compares, synced" }
] as const;

export function SignInValue({ className = "" }: { className?: string }) {
  const { translate } = useLocale();
  return (
    <ul className={`space-y-2 ${className}`}>
      {BENEFITS.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-start gap-2.5 text-left">
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--brand)/0.14)] text-[rgb(var(--brand))]">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="text-[0.82rem] leading-snug text-[rgb(var(--text)/0.82)]">{translate(text)}</span>
        </li>
      ))}
    </ul>
  );
}
