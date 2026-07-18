// The three luxury "skins" a Pro/Max member can choose between. A skin defines a
// matched pair of palettes — one for the Pro look, one for the Max look — so the
// member's tier picks which half applies. Purely visual; decoupled from tier
// entitlements. Consumed by the theme provider (sets CSS custom properties) and
// the subscribe page's live preview.

import type { Tier } from "@/lib/subscription/tiers";

export type SkinId = "sapphire" | "aurora" | "obsidian";

export const DEFAULT_SKIN: SkinId = "sapphire";

export type SkinPalette = {
  /** Primary accent — badges, buttons, active states. Tuned for dark grounds. */
  accent: string;
  /** Accent tuned for LIGHT backgrounds so accent-colored text / icons / rings
   *  keep AA contrast (e.g. gold darkened to bronze). Falls back to `accent`. */
  accentLight?: string;
  /** A softer accent for hovers / secondary emphasis. */
  accentSoft: string;
  /** Ink color that reads on the accent (badges / small chips). */
  onAccent: string;
  /** Ink color that reads on buttonBg (the CTA button text). Tracked separately
   *  from onAccent because buttonBg can be dark even when accent is light — using
   *  onAccent here would put dark text on a dark button (invisible). */
  onButton: string;
  /** Membership-card background (full CSS background value; may be layered gradients). */
  cardBg: string;
  /** Foreground ink used on the card. */
  cardInk: string;
  /** CSS gradient for the primary CTA / upgrade button. */
  buttonBg: string;
  /** Badge tint (translucent fill) + border + text. */
  badgeFill: string;
  badgeBorder: string;
  badgeInk: string;
  /** Emblem glyph shown on the card. */
  emblem: string;
};

export type Skin = {
  id: SkinId;
  name: string;
  nameEn: string;
  blurb: string;
  blurbEn: string;
  pro: SkinPalette;
  max: SkinPalette;
};

export const SKINS: Record<SkinId, Skin> = {
  sapphire: {
    id: "sapphire",
    name: "蓝宝石 · 香槟金",
    nameEn: "Sapphire & Champagne",
    blurb: "永不过时：深蓝宝石的沉稳，配黑金的经典。低调，但一眼看得出贵。",
    blurbEn: "Timeless: deep-sapphire poise with classic black-gold. Understated, but unmistakably rich.",
    pro: {
      accent: "#4c86e0",
      accentLight: "#3a72c9",
      accentSoft: "#7fb0f0",
      onAccent: "#ffffff",
      onButton: "#ffffff", // white on the medium-blue button
      cardBg:
        "radial-gradient(120% 80% at 80% 0%, rgba(120,170,240,0.28), transparent 55%), linear-gradient(150deg, #16386f 0%, #0d2650 45%, #0a1a38 100%)",
      cardInk: "#eaf2ff",
      buttonBg: "linear-gradient(135deg, #4c86e0, #1e4d8c)",
      badgeFill: "rgba(76,134,224,0.16)",
      badgeBorder: "rgba(76,134,224,0.45)",
      badgeInk: "#cfe0fb",
      emblem: "✦"
    },
    max: {
      accent: "#d9b45a",
      accentLight: "#a9812a",
      accentSoft: "#f0d488",
      onAccent: "#1a1305",
      onButton: "#1a1305", // dark ink on the light-gold button
      cardBg:
        "radial-gradient(120% 80% at 78% 4%, rgba(240,212,136,0.32), transparent 52%), linear-gradient(150deg, #1c160a 0%, #120d05 55%, #0a0803 100%)",
      cardInk: "#f7eccf",
      buttonBg: "linear-gradient(135deg, #f0d488, #b8912f)",
      badgeFill: "rgba(217,180,90,0.16)",
      badgeBorder: "rgba(217,180,90,0.5)",
      badgeInk: "#f6e6bd",
      emblem: "❖"
    }
  },
  aurora: {
    id: "aurora",
    name: "极光 · 午夜",
    nameEn: "Aurora Midnight",
    blurb: "科技奢侈：Pro 是发光的电蓝到青，Max 是紫到品红的极光渐变，像会呼吸的全息卡。",
    blurbEn: "Techno-luxe: Pro glows electric-blue to cyan; Max is a purple-to-magenta aurora, like a breathing holo card.",
    pro: {
      accent: "#29c2e6",
      accentLight: "#0f86a6",
      accentSoft: "#7fe0f5",
      onAccent: "#04222b",
      onButton: "#04222b", // dark ink on the bright cyan→blue button
      cardBg:
        "radial-gradient(120% 90% at 82% 0%, rgba(41,194,230,0.5), transparent 55%), linear-gradient(150deg, #0e6fb8 0%, #0a3a6e 50%, #071f3e 100%)",
      cardInk: "#e6fbff",
      buttonBg: "linear-gradient(135deg, #29c2e6, #0e6fb8)",
      badgeFill: "rgba(41,194,230,0.16)",
      badgeBorder: "rgba(41,194,230,0.5)",
      badgeInk: "#c9f4ff",
      emblem: "✦"
    },
    max: {
      accent: "#b06cf0",
      accentLight: "#8b46d6",
      accentSoft: "#e0559c",
      onAccent: "#2a0a34",
      onButton: "#ffffff", // white on the medium-dark purple button
      cardBg:
        "radial-gradient(130% 100% at 20% 0%, rgba(224,85,156,0.5), transparent 50%), radial-gradient(120% 90% at 90% 20%, rgba(176,108,240,0.55), transparent 55%), linear-gradient(150deg, #6d2bd6 0%, #3a1370 55%, #1a0a34 100%)",
      cardInk: "#faeeff",
      buttonBg: "linear-gradient(135deg, #b06cf0, #6d2bd6)",
      badgeFill: "rgba(176,108,240,0.18)",
      badgeBorder: "rgba(176,108,240,0.55)",
      badgeInk: "#f0d6ff",
      emblem: "❖"
    }
  },
  obsidian: {
    id: "obsidian",
    name: "曜石 · 铂金",
    nameEn: "Obsidian & Platinum",
    blurb: "安静的奢侈：几乎全黑，靠极细金属线与微妙点缀。黑卡气质，懂的人才懂。",
    blurbEn: "Quiet luxury: near-black, carried by hairline metal and subtle accents. Black-card energy — if you know, you know.",
    pro: {
      accent: "#8fa0bd",
      accentLight: "#5b6b86",
      accentSoft: "#c7d2e2",
      onAccent: "#0c0f15",
      onButton: "#e6ebf3", // light platinum ink on the near-black button
      cardBg:
        "radial-gradient(120% 80% at 85% 0%, rgba(120,150,200,0.16), transparent 55%), linear-gradient(150deg, #1c2735 0%, #131820 55%, #0c0f15 100%)",
      cardInk: "#e6ebf3",
      buttonBg: "linear-gradient(135deg, #2a3340, #14181f)",
      badgeFill: "rgba(143,160,189,0.14)",
      badgeBorder: "rgba(143,160,189,0.45)",
      badgeInk: "#d3dae5",
      emblem: "✦"
    },
    max: {
      accent: "#7a5cff",
      accentLight: "#5b3fe0",
      accentSoft: "#a08cff",
      onAccent: "#0a0713",
      onButton: "#eef0f4", // light platinum ink on the near-black button
      cardBg:
        "radial-gradient(120% 90% at 82% 6%, rgba(122,92,255,0.22), transparent 52%), linear-gradient(150deg, #16121f 0%, #100c17 55%, #08070b 100%)",
      cardInk: "#eef0f4",
      buttonBg: "linear-gradient(135deg, #2a3340, #14181f)",
      badgeFill: "rgba(122,92,255,0.16)",
      badgeBorder: "rgba(122,92,255,0.5)",
      badgeInk: "#e6e2ff",
      emblem: "❖"
    }
  }
};

export const SKIN_ORDER: SkinId[] = ["sapphire", "aurora", "obsidian"];

export function isSkinId(v: unknown): v is SkinId {
  return v === "sapphire" || v === "aurora" || v === "obsidian";
}

export function skinPalette(skin: SkinId, tier: Tier): SkinPalette {
  const s = SKINS[skin] ?? SKINS[DEFAULT_SKIN];
  // Free members preview the Pro palette (they can't apply skins, but the
  // subscribe page still shows them).
  return tier === "max" ? s.max : s.pro;
}

// "#4c86e0" → "76 134 224": the space-separated RGB triple the theme system
// expects so a skin accent can drive a CSS custom property consumed as
// `rgb(var(--brand))`. Returns null for anything that isn't a 3/6-digit hex so
// callers can fall back to the default token. Used to apply a member's chosen
// skin site-wide (see components/theme/member-theme.tsx).
export function hexToRgbTriple(hex: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const int = parseInt(h, 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

// Darken a hex color by `amount` (0–1), used to derive a light-mode-safe variant
// of a member's custom "Signature" accent so it stays legible on white.
export function darkenHex(hex: string, amount = 0.28): string {
  const triple = hexToRgbTriple(hex);
  if (!triple) return hex;
  const [r, g, b] = triple.split(" ").map(Number);
  const f = (c: number) => Math.max(0, Math.round(c * (1 - amount)));
  return `#${[f(r), f(g), f(b)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
