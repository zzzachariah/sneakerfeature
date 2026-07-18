"use client";

// Compare variant gate. Standard → the untouched CompareSlides. Any premium skin
// → the PremiumCompare recomposer (reordered sections, same sub-components).

import { CompareSlides, type Props as CompareProps } from "@/components/compare/compare-slides";
import { usePremiumVariant } from "@/components/premium/variants";
import { PremiumCompare } from "@/components/premium/compare/premium-compare";

export function CompareSwitch(props: CompareProps) {
  const variant = usePremiumVariant();
  if (variant === "standard") return <CompareSlides {...props} />;
  return <PremiumCompare variant={variant} {...props} />;
}
