"use client";

// Home page variant gate. Reads the active Premium UI variant and renders either
// the untouched standard HomeView (variant === "standard" → byte-for-byte the
// current homepage) or one of the four premium home layouts. app/page.tsx only
// swaps <HomeView> for <HomeSwitch> with the same props, so the standard render
// path is unchanged when no skin is active.

import { HomeView } from "@/components/home/home-view";
import { usePremiumVariant } from "@/components/premium/variants";
import { EditorialHome } from "@/components/premium/home/editorial-home";
import { InstrumentHome } from "@/components/premium/home/instrument-home";
import { GalleryHome } from "@/components/premium/home/gallery-home";
import { ArenaHome } from "@/components/premium/home/arena-home";
import type { PremiumHomeProps } from "@/components/premium/home/shared";

export function HomeSwitch(props: PremiumHomeProps) {
  const variant = usePremiumVariant();
  switch (variant) {
    case "editorial":
      return <EditorialHome {...props} />;
    case "instrument":
      return <InstrumentHome {...props} />;
    case "gallery":
      return <GalleryHome {...props} />;
    case "arena":
      return <ArenaHome {...props} />;
    default:
      return <HomeView {...props} />;
  }
}
