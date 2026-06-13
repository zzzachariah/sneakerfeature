"use client";

import type { CSSProperties, ReactNode } from "react";
import { useLocale } from "@/components/i18n/locale-provider";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1440;

const SLOGAN = "EVERYTHING U NEED TO KNOW FOR SNEAKERS";

const LIGHT_TOKENS: CSSProperties = {
  // Force the light-mode CSS variables regardless of the user's site theme so
  // the share card looks identical whether captured from dark or light mode.
  ["--bg" as string]: "245 245 247",
  ["--bg-elev" as string]: "255 255 255",
  ["--surface" as string]: "251 251 253",
  ["--muted" as string]: "220 220 224",
  ["--text" as string]: "29 29 31",
  ["--subtext" as string]: "96 96 102",
  ["--accent" as string]: "29 29 31",
  ["--ring" as string]: "29 29 31",
  ["--shadow" as string]: "17 17 17",
  ["--success" as string]: "16 185 129",
  ["--error" as string]: "239 68 68",
  ["--glass-stroke-soft" as string]: "200 200 206",
  ["--glass-stroke" as string]: "210 210 216",
  ["--glass-highlight" as string]: "255 255 255",
};

type Props = {
  children: ReactNode;
  variant?: "single" | "compare";
  // When true, CARD_HEIGHT becomes a floor instead of a fixed height: the card
  // grows with its content. Used by the recommendation report, whose AI summary
  // is variable-length, so the poster is never cropped to fit the canvas.
  grow?: boolean;
};

export function CardFrame({ children, variant = "single", grow = false }: Props) {
  return (
    <div
      style={{
        ...LIGHT_TOKENS,
        width: CARD_WIDTH,
        ...(grow ? { minHeight: CARD_HEIGHT } : { height: CARD_HEIGHT }),
        position: "relative",
        overflow: "hidden",
        background: "rgb(var(--bg-elev))",
        color: "rgb(var(--text))",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        display: "flex",
        flexDirection: "column",
        isolation: "isolate",
      }}
    >
      {/* Warm/cool radial blooms to keep the white from feeling sterile */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(58% 38% at 18% 8%, rgba(255, 218, 185, 0.18) 0%, transparent 70%), radial-gradient(50% 36% at 92% 96%, rgba(180, 200, 230, 0.18) 0%, transparent 72%)",
        }}
      />
      {/* Faint grid texture (no mask — keep simple for image-export compatibility) */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          backgroundPosition: "center",
          opacity: 0.6,
        }}
      />

      <CardHeader variant={variant} />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          // grow: fill the floor when content is short (footer stays pinned to
          // the bottom) but never shrink below the content when it's tall.
          flex: grow ? "1 0 auto" : 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          padding: "0 64px",
        }}
      >
        {children}
      </div>
      <CardFooter />
    </div>
  );
}

function BrandMark({ size = 32 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/favicon.png"
      alt=""
      width={size}
      height={size}
      crossOrigin="anonymous"
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        borderRadius: 8,
        flexShrink: 0,
      }}
    />
  );
}

function CardHeader({ variant }: { variant: "single" | "compare" }) {
  const { translate } = useLocale();
  return (
    <div
      style={{
        position: "relative",
        zIndex: 2,
        height: 88,
        padding: "0 64px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <BrandMark size={32} />
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "-0.035em",
            color: "rgb(var(--text))",
          }}
        >
          sneakerfeature
        </span>
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.32em",
          color: "rgb(var(--subtext))",
        }}
      >
        {translate(variant === "compare" ? "Compare" : "Spec sheet")}
      </span>
    </div>
  );
}

function CardFooter() {
  const { translate } = useLocale();
  return (
    <div
      style={{
        position: "relative",
        zIndex: 2,
        height: 144,
        padding: "0 64px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: "1px solid rgba(0,0,0,0.06)",
        background: "rgba(255,255,255,0.5)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, maxWidth: 760 }}>
        <BrandMark size={44} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.32em",
              color: "rgb(var(--subtext))",
            }}
          >
            snkrfeature.com
          </span>
          <span
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
              color: "rgb(var(--text))",
            }}
          >
            {translate(SLOGAN)}
          </span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/qrcode.png"
          alt=""
          width={96}
          height={96}
          crossOrigin="anonymous"
          style={{
            width: 96,
            height: 96,
            objectFit: "contain",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.08)",
            background: "white",
            padding: 4,
          }}
        />
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.28em",
            color: "rgb(var(--subtext))",
          }}
        >
          {translate("Scan to open")}
        </span>
      </div>
    </div>
  );
}
