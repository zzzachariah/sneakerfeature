// The three luxury "skins" a Pro/Max member can choose between. A skin defines a
// matched pair of palettes — one for the Pro look, one for the Max look — so the
// member's tier picks which half applies. Purely visual; decoupled from tier
// entitlements. Consumed by the theme provider (sets CSS custom properties) and
// the subscribe page's live preview.

import type { Tier } from "@/lib/subscription/tiers";

export type SkinId = "sapphire" | "aurora" | "obsidian";

export const DEFAULT_SKIN: SkinId = "sapphire";

export type SkinPalette = {
  /** Primary accent — badges, buttons, active states. */
  accent: string;
  /** A softer accent for hovers / secondary emphasis. */
  accentSoft: string;
  /** Ink color that reads on the accent (button text). */
  onAccent: string;
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
  pro: SkinPalette;
  max: SkinPalette;
};

export const SKINS: Record<SkinId, Skin> = {
  sapphire: {
    id: "sapphire",
    name: "蓝宝石 · 香槟金",
    nameEn: "Sapphire & Champagne",
    blurb: "永不过时：深蓝宝石的沉稳，配黑金的经典。低调，但一眼看得出贵。",
    pro: {
      accent: "#4c86e0",
      accentSoft: "#7fb0f0",
      onAccent: "#ffffff",
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
      accentSoft: "#f0d488",
      onAccent: "#1a1305",
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
    pro: {
      accent: "#29c2e6",
      accentSoft: "#7fe0f5",
      onAccent: "#04222b",
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
      accentSoft: "#e0559c",
      onAccent: "#2a0a34",
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
    pro: {
      accent: "#8fa0bd",
      accentSoft: "#c7d2e2",
      onAccent: "#0c0f15",
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
      accentSoft: "#a08cff",
      onAccent: "#0a0713",
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
