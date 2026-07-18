// Self-hosted display faces for the four Premium UI design languages. Each skin
// gets ONE characteristic display face, exposed as a CSS variable that
// premium-skins.css maps onto that skin's headings/labels. Body copy stays on
// Geist everywhere; the Gallery skin deliberately ships NO new face and leans on
// Geist's light weights + wide tracking instead (discipline as its personality).
//
// These are self-hosted (next/font/local) rather than next/font/google so the
// build never depends on network access to fonts.gstatic.com — the woff2 files
// (latin subsets, one instance each) live next to this module. All four are
// OFL-licensed, so bundling them is fine.

import localFont from "next/font/local";

// Bodoni Moda 700 — high-contrast Didone for the Editorial (Sapphire) skin's
// mastheads and cover type. The file is the opsz-variable instance fixed at
// wght 700, so it renders at 700 with the browser's default optical size.
export const editorialDisplay = localFont({
  src: "./bodoni-moda.woff2",
  weight: "700",
  style: "normal",
  variable: "--font-editorial",
  display: "swap",
  // No CJK glyphs here — Chinese headings fall back to the serif stack declared
  // in premium-skins.css, so keep the fallback matched to a serif metric.
  fallback: ["Georgia", "Songti SC", "Noto Serif SC", "SimSun", "serif"],
  adjustFontFallback: false,
});

// Space Grotesk 700 — technical grotesque for the Instrument (Aurora) skin.
export const instrumentDisplay = localFont({
  src: "./space-grotesk.woff2",
  weight: "700",
  style: "normal",
  variable: "--font-instrument",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "PingFang SC", "Noto Sans SC", "sans-serif"],
  adjustFontFallback: false,
});

// Anton 400 — heavyweight condensed for the Arena (Champion) skin's titles.
export const arenaDisplay = localFont({
  src: "./anton.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-arena",
  display: "swap",
  fallback: ["Impact", "Haettenschweiler", "Arial Narrow Bold", "ui-sans-serif", "sans-serif"],
  adjustFontFallback: false,
});

// Barlow Condensed 600 — condensed labels / stat lines that pair with Anton.
export const arenaLabel = localFont({
  src: "./barlow-condensed.woff2",
  weight: "600",
  style: "normal",
  variable: "--font-arena-label",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "PingFang SC", "Noto Sans SC", "sans-serif"],
  adjustFontFallback: false,
});

// One className carrying all four --font-* variables, spread onto <html> next to
// the Geist variables so every skin's face is available site-wide without a
// per-skin network fetch.
export const premiumFontVars = [
  editorialDisplay.variable,
  instrumentDisplay.variable,
  arenaDisplay.variable,
  arenaLabel.variable,
].join(" ");
