"use client";

import { Construction } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Card } from "@/components/ui/card";

export function UnderDevelopment() {
  const { translate } = useLocale();
  return (
    <div className="container-shell flex min-h-[60vh] items-center justify-center py-16">
      <Card className="flex max-w-md flex-col items-center gap-4 p-10 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[rgb(var(--text)/0.06)]">
          <Construction className="h-7 w-7 text-[rgb(var(--subtext))]" />
        </span>
        <h1 className="text-xl font-semibold tracking-[-0.01em]">{translate("Under development")}</h1>
        <p className="text-sm soft-text">
          {translate("Smart Picker is under development. Stay tuned.")}
        </p>
      </Card>
    </div>
  );
}
