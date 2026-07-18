"use client";

// Shoe-detail variant gate. Standard → the untouched ShoeDetailSlides (same
// props, byte-for-byte the current detail page). Any premium skin → the
// PremiumDetail recomposer with the matching structural order.

import { ShoeDetailSlides, type Props as DetailProps } from "@/components/detail/shoe-detail-slides";
import { usePremiumVariant } from "@/components/premium/variants";
import { PremiumDetail } from "@/components/premium/detail/premium-detail";

export function DetailSwitch(props: DetailProps) {
  const variant = usePremiumVariant();
  if (variant === "standard") return <ShoeDetailSlides {...props} />;
  return <PremiumDetail variant={variant} {...props} />;
}
