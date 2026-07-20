"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type ShoeImageProps = {
  src?: string | null;
  alt: string;
  fallbackLabel: string;
  variant?: "thumbnail" | "detail" | "suggestion" | "compare" | "closet";
  className?: string;
  /** When inside a `.group` (e.g. a card), gently zooms the image on hover/press. */
  interactive?: boolean;
  /** Eager-load above-the-fold images (maps to next/image `priority`). */
  priority?: boolean;
  /**
   * The mid-tone "stage" backdrop + hairline border behind the cut-out. On by
   * default (contrast for very light/dark shoes on list/compare tiles). Pass
   * `false` when the image already sits on its own clean card — e.g. the detail
   * hero — so it isn't a grey box nested inside a white card.
   */
  stage?: boolean;
};

const VARIANT_CLASS: Record<NonNullable<ShoeImageProps["variant"]>, string> = {
  thumbnail: "aspect-square w-14 min-w-14",
  detail: "aspect-square w-full max-w-[30rem]",
  suggestion: "aspect-square w-16 min-w-16",
  compare: "aspect-square w-full max-w-[13rem]",
  // Closet grid/rail cells: fill the host `.pui-cell-stage` (callers size the
  // box via `pui-cell-img`), so no fixed clamp here.
  closet: "aspect-square w-full"
};

const VARIANT_SCALE: Record<NonNullable<ShoeImageProps["variant"]>, number> = {
  thumbnail: 1.12,
  detail: 1.1,
  suggestion: 1.1,
  compare: 1.08,
  closet: 1.02
};

// Rendered size hints so the optimizer serves appropriately small variants —
// keep in sync with VARIANT_CLASS above. Thumbnails used to download the
// full-resolution original just to paint a 56px square.
const VARIANT_SIZES: Record<NonNullable<ShoeImageProps["variant"]>, string> = {
  thumbnail: "56px",
  suggestion: "64px",
  compare: "(max-width: 767px) 45vw, 208px",
  detail: "(max-width: 767px) 100vw, 480px",
  // 2-col mobile ≈ 46vw, 3-col ≈ 31vw, 4-col desktop ≈ 260px; Next adds the
  // retina widths to the srcset. Serving a 56px thumbnail here read as blurry.
  closet: "(max-width: 640px) 46vw, (max-width: 1024px) 31vw, 260px"
};

// Only route sources through the Next image optimizer when they match the
// hosts allowed in next.config.ts `images.remotePatterns` (plus same-origin
// paths). Anything else — legacy rows pointing at arbitrary hosts, data/blob
// URLs — keeps the plain <img> path instead of erroring at request time.
function canOptimize(src: string): boolean {
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  try {
    const url = new URL(src);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

export function ShoeImage({ src, alt, fallbackLabel, variant = "thumbnail", className = "", interactive = false, priority = false, stage = true }: ShoeImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const trimmedSrc = src?.trim() ?? "";
  const hasImage = Boolean(trimmedSrc) && !failed;

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  const handleImgRef = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth > 0) setLoaded(true);
  }, []);

  const imgClassName = cn(
    "shoe-img h-full w-full object-contain object-center",
    interactive && "shoe-img--zoom",
    loaded ? "img-loaded" : "img-loading"
  );
  const imgStyle = { ["--img-scale" as string]: VARIANT_SCALE[variant] };

  return (
    <div
      // `overflow-hidden` stays even without the stage: the fill variants scale the
      // shoe past 100% (--img-scale), so the box must clip. When `stage` is off we
      // drop the grey backdrop, hairline, and rounding so the image reads as part of
      // its host card rather than a nested box.
      className={`relative mx-auto overflow-hidden ${
        stage ? "shoe-stage rounded-xl border border-[rgb(var(--muted)/0.42)]" : ""
      } ${VARIANT_CLASS[variant]} ${className}`}
    >
      {hasImage ? (
        canOptimize(trimmedSrc) ? (
          <Image
            ref={handleImgRef}
            src={trimmedSrc}
            alt={alt}
            fill
            sizes={VARIANT_SIZES[variant]}
            {...(priority ? { priority: true } : { loading: "lazy" as const })}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={imgClassName}
            style={imgStyle}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={handleImgRef}
            src={trimmedSrc}
            alt={alt}
            loading={priority ? "eager" : "lazy"}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={imgClassName}
            style={imgStyle}
          />
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[rgb(var(--bg-elev)/0.72)] px-2 text-center">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] soft-text">{fallbackLabel}</span>
        </div>
      )}
    </div>
  );
}
