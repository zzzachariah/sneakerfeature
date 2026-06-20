"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { BgRemovedImg } from "@/components/shoe/bg-removed-img";

type ShoeImageProps = {
  src?: string | null;
  alt: string;
  fallbackLabel: string;
  variant?: "thumbnail" | "detail" | "suggestion" | "compare";
  className?: string;
  /** When inside a `.group` (e.g. a card), gently zooms the image on hover/press. */
  interactive?: boolean;
};

const VARIANT_CLASS: Record<NonNullable<ShoeImageProps["variant"]>, string> = {
  thumbnail: "aspect-square w-14 min-w-14",
  detail: "aspect-square w-full max-w-[30rem]",
  suggestion: "aspect-square w-16 min-w-16",
  compare: "aspect-square w-full max-w-[13rem]"
};

const VARIANT_SCALE: Record<NonNullable<ShoeImageProps["variant"]>, number> = {
  thumbnail: 1.12,
  detail: 1.1,
  suggestion: 1.1,
  compare: 1.08
};

export function ShoeImage({ src, alt, fallbackLabel, variant = "thumbnail", className = "", interactive = false }: ShoeImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [bgRemoved, setBgRemoved] = useState(false);
  const hasImage = Boolean(src) && !failed;

  // Reset the load state whenever the source changes so the new image fades in.
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  // Cached images can finish loading before React attaches onLoad; catch that
  // via the `complete` flag so the image never stays stuck at opacity 0.
  const handleImgRef = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth > 0) setLoaded(true);
  }, []);

  return (
    <div
      className={`mx-auto overflow-hidden rounded-xl border border-[rgb(var(--muted)/0.42)] bg-[rgb(var(--bg-elev)/0.85)] ${VARIANT_CLASS[variant]} ${className}`}
    >
      {hasImage ? (
        <BgRemovedImg
          ref={handleImgRef}
          src={src ?? ""}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          onBgRemoved={setBgRemoved}
          className={cn("shoe-img h-full w-full object-contain object-center", interactive && "shoe-img--zoom", loaded ? "img-loaded" : "img-loading")}
          style={{
            // Drop the white plate once the cut-out PNG arrives so the shoe
            // floats on the app surface; keep it for the original to stay
            // legible against the dark UI.
            backgroundColor: bgRemoved ? "transparent" : "#fff",
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
