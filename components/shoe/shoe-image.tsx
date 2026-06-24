"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { sizedImageSrc } from "@/lib/card/sized-image";

type Variant = "thumbnail" | "detail" | "suggestion" | "compare";

type ShoeImageProps = {
  src?: string | null;
  alt: string;
  fallbackLabel: string;
  variant?: Variant;
  className?: string;
  /** When inside a `.group` (e.g. a card), gently zooms the image on hover/press. */
  interactive?: boolean;
  /**
   * Above-the-fold images: skip lazy-loading + the fade-in, and ask the browser
   * to fetch with high priority. Use for the detail-page hero and the first row
   * of any grid. Costs nothing (`fetchpriority` is only a scheduling hint).
   */
  priority?: boolean;
  /**
   * Explicit rendered width hint (CSS px) for CDN-side sizing. When omitted,
   * the variant's natural slot width is used. Pass 0 / negative to opt out and
   * keep the original full-resolution URL.
   */
  pixelWidth?: number;
};

const VARIANT_CLASS: Record<Variant, string> = {
  thumbnail: "aspect-square w-14 min-w-14",
  detail: "aspect-square w-full max-w-[30rem]",
  suggestion: "aspect-square w-16 min-w-16",
  compare: "aspect-square w-full max-w-[13rem]"
};

const VARIANT_SCALE: Record<Variant, number> = {
  thumbnail: 1.12,
  detail: 1.1,
  suggestion: 1.1,
  compare: 1.08
};

// Rendered width per variant — what we tell Supabase to ship. Detail is sized
// for a full-card hero (cards are ~360-480px wide at 2x), thumbnails are tiny.
const VARIANT_WIDTH_PX: Record<Variant, number> = {
  thumbnail: 56,
  detail: 480,
  suggestion: 64,
  compare: 208
};

export function ShoeImage({
  src,
  alt,
  fallbackLabel,
  variant = "thumbnail",
  className = "",
  interactive = false,
  priority = false,
  pixelWidth
}: ShoeImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const hasImage = Boolean(src) && !failed;

  // Resolve the actual URL the browser will fetch. Sized variants hit
  // Supabase's image-render endpoint directly — no extra hops, no proxy.
  // `pixelWidth === 0` (or negative) opts out so an explicit caller can still
  // request the full-res original (used by export-card preview paths that need
  // crispness for canvas screenshot).
  const resolvedSrc = useMemo(() => {
    if (!hasImage || !src) return "";
    const w = pixelWidth ?? VARIANT_WIDTH_PX[variant];
    return sizedImageSrc(src, w);
  }, [src, variant, pixelWidth, hasImage]);

  // Reset the load state whenever the source changes so the new image fades in.
  useEffect(() => {
    setLoaded(false);
  }, [resolvedSrc]);

  // Cached images can finish loading before React attaches onLoad; catch that
  // via the `complete` flag so the image never stays stuck at opacity 0.
  const handleImgRef = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth > 0) setLoaded(true);
  }, []);

  // Priority images skip the fade entirely (they're the first thing the user
  // is looking at — a 200ms fade just delays perceived load).
  const loadedClass = priority ? "img-loaded--instant" : "img-loaded";

  return (
    <div
      className={`shoe-stage mx-auto overflow-hidden rounded-xl border border-[rgb(var(--muted)/0.42)] ${VARIANT_CLASS[variant]} ${className}`}
    >
      {hasImage ? (
        <img
          ref={handleImgRef}
          src={resolvedSrc}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          // Cast keeps us compatible with @types/react versions that haven't
          // shipped the camelCase prop yet — the attribute is emitted as-is.
          {...({ fetchPriority: priority ? "high" : "auto" } as { fetchPriority: "high" | "auto" })}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "shoe-img h-full w-full object-contain object-center",
            interactive && "shoe-img--zoom",
            loaded ? loadedClass : "img-loading"
          )}
          style={{
            // No backdrop color: background-removed PNGs float on the adaptive
            // .shoe-stage (see globals.css). Originals that still have a white
            // plate simply render that plate over the stage — degrades cleanly.
            // Drives both the fill-scale and the optional hover zoom.
            ["--img-scale" as string]: VARIANT_SCALE[variant]
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[rgb(var(--bg-elev)/0.72)] px-2 text-center">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] soft-text">{fallbackLabel}</span>
        </div>
      )}
    </div>
  );
}
