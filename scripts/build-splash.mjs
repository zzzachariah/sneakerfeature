// Builds the native launch screens from assets/logo.png.
//
// Why this exists instead of just running `npm run cap:assets`:
//
//   assets/logo.png is a black mark on an OPAQUE WHITE square. capacitor-assets
//   composites it, background and all, onto the splash colour — so the dark
//   splash came out as #0a0a0a with a white box floating in the middle of it,
//   which is exactly what it looked like on launch. Giving the mark an alpha
//   channel fixes the box; giving it a light-on-dark twin (assets/logo-dark.png)
//   is what stops it from then being a black mark on a black screen.
//
// This script writes both of those, then renders the launch images itself so the
// result is deterministic and reviewable in the diff. It is safe to re-run: it
// derives everything from the current logo and overwrites in place.
//
// Both appearances are DARK on purpose. capacitor.config.ts pins the WebView's
// background to #0a0a0a on every platform, so a light-mode launch would flash
// white and then drop to black before the first paint regardless of the phone's
// appearance. Matching the splash to the WebView means there is no transition to
// see at all — the app just starts.
//
//   node scripts/build-splash.mjs      (or: npm run splash:build)

import { readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Matches capacitor.config.ts `backgroundColor` — do not drift from it. */
const BG = { r: 10, g: 10, b: 10, alpha: 1 };

// Mark width as a fraction of the canvas's short edge.
//
// Android's drawables are already phone-shaped, so the fraction is roughly what
// you see. iOS is one 2732² SQUARE that both the storyboard and the plugin draw
// with scaleAspectFill: on a 1179×2556 screen that fills by height and crops the
// sides, leaving only ~46% of the image's width on screen. A mark sized like
// Android's would come out nearly three quarters of the way across the phone —
// hence the much smaller square ratio, which lands in the same place visually.
const MARK_RATIO = { square: 0.16, screen: 0.34 };

const SOURCE_LOGO = "assets/logo.png";
const LIGHT_LOGO = "assets/logo.png";
const DARK_LOGO = "assets/logo-dark.png";

// One 2732² square per appearance, scaleAspectFill'd by both the launch
// storyboard and the SplashScreen plugin (see LaunchScreen.storyboard).
const IOS_SPLASH_DIR = "ios/App/App/Assets.xcassets/Splash.imageset";
const IOS_FILES = [
  "Default@1x~universal~anyany.png",
  "Default@2x~universal~anyany.png",
  "Default@3x~universal~anyany.png",
  "Default@1x~universal~anyany-dark.png",
  "Default@2x~universal~anyany-dark.png",
  "Default@3x~universal~anyany-dark.png",
  // Unassigned leftovers from an older capacitor-assets run — not referenced by
  // Contents.json, so nothing renders them. Kept in step anyway: a stale white
  // box sitting in the imageset is exactly the sort of thing that gets picked up
  // by accident later.
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png"
];

// Android keeps a splash.png per density AND orientation, light and -night. We
// re-render each at whatever size it already is, so the density buckets stay
// exactly as capacitor-assets laid them out.
const ANDROID_RES = "android/app/src/main/res";
const ANDROID_DIRS = [
  "drawable",
  "drawable-night",
  ...["hdpi", "ldpi", "mdpi", "xhdpi", "xxhdpi", "xxxhdpi"].flatMap((d) => [
    `drawable-land-${d}`,
    `drawable-land-night-${d}`,
    `drawable-port-${d}`,
    `drawable-port-night-${d}`
  ])
];

/**
 * Turn the black-on-white source into a single-colour mark with a real alpha
 * channel: alpha comes from the ink (dark pixel → opaque), and every channel is
 * flooded with the target colour. Doing it from luminance rather than a colour
 * key keeps the anti-aliased edges smooth instead of jagged.
 */
async function inkMask(source, colour) {
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, o = 0; i < data.length; i += info.channels, o += 4) {
    // Rec. 601 luma — close enough for a two-tone mark, and it treats the
    // logo's few grey anti-aliasing pixels the way the eye does.
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const ink = 255 - Math.round(luma);
    out[o] = colour;
    out[o + 1] = colour;
    out[o + 2] = colour;
    // Respect any transparency the source already had, so re-running this on
    // its own output is a no-op rather than a slow fade to opaque.
    out[o + 3] = Math.round((ink * data[i + 3]) / 255);
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Crop to the ink so the mark is sized by the artwork, not by its padding. */
async function trimmed(buffer) {
  return sharp(buffer).trim({ threshold: 1 }).png().toBuffer();
}

async function splash(mark, width, height, ratio) {
  const short = Math.min(width, height);
  const markWidth = Math.max(1, Math.round(short * ratio));
  const resized = await sharp(mark).resize({ width: markWidth }).png().toBuffer();

  return sharp({ create: { width, height, channels: 4, background: BG } })
    .composite([{ input: resized, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function sizeOf(file) {
  const head = await readFile(file);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const source = await readFile(path.join(ROOT, SOURCE_LOGO));

  const light = await inkMask(source, 0);
  const dark = await inkMask(source, 255);
  await writeFile(path.join(ROOT, LIGHT_LOGO), light);
  await writeFile(path.join(ROOT, DARK_LOGO), dark);
  console.log(`logo   ${LIGHT_LOGO} + ${DARK_LOGO} (transparent)`);

  // The launch screens are dark in both appearances, so both use the light-on-
  // dark twin.
  const mark = await trimmed(dark);

  for (const name of IOS_FILES) {
    const file = path.join(ROOT, IOS_SPLASH_DIR, name);
    if (!(await exists(file))) continue;
    const { width, height } = await sizeOf(file);
    await writeFile(file, await splash(mark, width, height, MARK_RATIO.square));
    console.log(`ios    ${name} ${width}x${height}`);
  }

  let androidCount = 0;
  for (const dir of ANDROID_DIRS) {
    const file = path.join(ROOT, ANDROID_RES, dir, "splash.png");
    if (!(await exists(file))) continue;
    const { width, height } = await sizeOf(file);
    await writeFile(file, await splash(mark, width, height, MARK_RATIO.screen));
    androidCount += 1;
  }
  console.log(`android ${androidCount} splash.png rendered`);
}

await main();
