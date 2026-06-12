"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type ShoeImageProps = {
  src?: string | null;
  alt: string;
  fallbackLabel: string;
  variant?: "thumbnail" | "detail" | "suggestion" | "compare";
  className?: string;
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

export function ShoeImage({ src, alt, fallbackLabel, variant = "thumbnail", className = "" }: ShoeImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
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
        <img
          ref={handleImgRef}
          src={src ?? ""}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn("h-full w-full object-contain object-center", loaded ? "img-loaded" : "img-loading")}
          style={{
            backgroundColor: "#fff",
            transform: `scale(${VARIANT_SCALE[variant]})`
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
