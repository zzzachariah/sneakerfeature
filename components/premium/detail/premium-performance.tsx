"use client";

// Detail performance, re-designed per theme. The radar chart is back — but as
// four structurally different drawings, one per skin (see PremiumRadar):
// Editorial ink plate · Instrument scope · Gallery catalogue plate · Arena
// rating card — over a themed heading, with the tech/feel descriptors kept
// below. Reads the same radarAxes the standard PerformanceSection feeds its
// PerformanceRadar. Premium-only; standard users keep PerformanceSection.

import { PremiumRadar } from "@/components/premium/detail/premium-radar";
import { useLocale } from "@/components/i18n/locale-provider";
import { pickLocalized } from "@/components/i18n/localized-field";
import type { RadarAxis } from "@/components/detail/performance-radar";
import type { Shoe } from "@/lib/types";
import type { PremiumVariant } from "@/components/premium/variants";

type Variant = Exclude<PremiumVariant, "standard">;
type ExtraTechCards = Record<string, { field: string; value: string | null | undefined }>;

export function PremiumPerformance({
  variant,
  shoe,
  extraTechCards,
  radarAxes,
}: {
  variant: Variant;
  shoe: Shoe;
  extraTechCards: ExtraTechCards;
  radarAxes: RadarAxis[];
}) {
  const { translate, locale } = useLocale();

  const techItems = [
    { label: "Forefoot midsole tech", field: "forefoot_midsole_tech", value: pickLocalized(locale, shoe.spec.forefoot_midsole_tech, shoe.spec.forefoot_midsole_tech_zh) },
    { label: "Heel midsole tech", field: "heel_midsole_tech", value: pickLocalized(locale, shoe.spec.heel_midsole_tech, shoe.spec.heel_midsole_tech_zh) },
    ...Object.entries(extraTechCards).map(([label, cfg]) => ({ label, field: cfg.field, value: cfg.value })),
  ];
  const feelItems = [
    { label: "Cushioning feel", field: "cushioning_feel", value: pickLocalized(locale, shoe.spec.cushioning_feel, shoe.spec.cushioning_feel_zh) },
    { label: "Court feel", field: "court_feel", value: pickLocalized(locale, shoe.spec.court_feel, shoe.spec.court_feel_zh) },
    { label: "Bounce", field: "bounce", value: pickLocalized(locale, shoe.spec.bounce, shoe.spec.bounce_zh) },
    { label: "Stability", field: "stability", value: pickLocalized(locale, shoe.spec.stability, shoe.spec.stability_zh) },
    { label: "Traction", field: "traction", value: pickLocalized(locale, shoe.spec.traction, shoe.spec.traction_zh) },
    { label: "Fit", field: "fit", value: pickLocalized(locale, shoe.spec.fit, shoe.spec.fit_zh) },
  ];
  const descriptors = [...techItems, ...feelItems];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="pui-section-head" style={{ justifyContent: variant === "editorial" ? "flex-start" : "center" }}>
        <span className="pui-kicker">{translate("Performance profile")}</span>
      </div>

      <PremiumRadar variant={variant} axes={radarAxes} />

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {descriptors.map((d) => (
          <div key={d.field} className="surface-card rounded-2xl border border-[rgb(var(--muted)/0.4)] p-4">
            <p className="t-eyebrow">{translate(d.label)}</p>
            <p className="mt-1.5 text-[0.92rem] leading-relaxed text-[rgb(var(--text))]">{d.value?.trim() ? d.value : translate("Not yet added")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
