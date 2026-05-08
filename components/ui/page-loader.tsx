"use client";

import { SneakerLoader } from "@/components/ui/sneaker-loader";
import { useLocale } from "@/components/i18n/locale-provider";

export function PageLoader({ label }: { label: string }) {
  const { translate } = useLocale();

  return (
    <div className="relative flex min-h-[calc(100dvh-var(--top-nav-h,64px)-var(--mobile-nav-h,0px))] w-full items-center justify-center overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 45%, rgb(var(--text)/0.04) 0%, transparent 70%)"
        }}
      />
      <div className="relative flex flex-col items-center gap-6">
        <SneakerLoader label={null} />
        <p className="page-loader-label text-[0.7rem] uppercase tracking-[0.32em] text-[rgb(var(--subtext))]">
          {translate(label)}
        </p>
      </div>
    </div>
  );
}
