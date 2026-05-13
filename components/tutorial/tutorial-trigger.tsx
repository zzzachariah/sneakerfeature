"use client";

import { HelpCircle } from "lucide-react";
import { useTutorial } from "@/components/tutorial/tutorial-provider";
import { useLocale } from "@/components/i18n/locale-provider";

export function TutorialTrigger({ className }: { className?: string }) {
  const { start } = useTutorial();
  const { translate } = useLocale();

  return (
    <button
      type="button"
      onClick={() => start()}
      data-tutorial="nav-tutorial"
      className={className}
      aria-label={translate("Site tour")}
      title={translate("Site tour")}
    >
      <HelpCircle className="h-[18px] w-[18px] md:h-4 md:w-4" />
    </button>
  );
}
