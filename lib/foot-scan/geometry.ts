// Pixel-space geometry for the foot scan.
//
// The vision model returns four anatomical landmarks per foot as normalized
// [x, y] coordinates (x = fraction of image width, y = fraction of image
// height). Turning those into a width/length ratio needs real pixel distances,
// so we un-normalize with the image's actual dimensions — hence the tiny
// JPEG/PNG header parsers below. The analysed photos are always JPEG (every
// capture path re-encodes to JPEG); PNG is handled as a cheap safety net.
//
// Computing the ratio in code from landmarks is markedly more robust than asking
// the model to eyeball a single decimal: the model only has to *point* at the
// extremes (an easy visual task), and the arithmetic — including the image's
// aspect ratio — is done deterministically here.

export type ImageSize = { w: number; h: number };

export function parseImageSize(dataUrl: string): ImageSize | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(dataUrl.slice(comma + 1), "base64");
  } catch {
    return null;
  }
  return parseJpegSize(buf) ?? parsePngSize(buf);
}

function parsePngSize(buf: Buffer): ImageSize | null {
  // 89 50 4E 47 signature; IHDR carries width @ byte 16, height @ byte 20.
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return w > 0 && h > 0 ? { w, h } : null;
}

function parseJpegSize(buf: Buffer): ImageSize | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let off = 2;
  while (off + 3 < buf.length) {
    if (buf[off] !== 0xff) {
      off++;
      continue;
    }
    // Skip any run of 0xff fill bytes to land on the real marker code.
    let p = off + 1;
    while (p < buf.length && buf[p] === 0xff) p++;
    if (p >= buf.length) break;
    const marker = buf[p];
    off = p + 1;
    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (off + 1 >= buf.length) break;
    const len = buf.readUInt16BE(off); // length includes these 2 bytes
    const isSOF =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      if (off + 7 > buf.length) break;
      const h = buf.readUInt16BE(off + 3);
      const w = buf.readUInt16BE(off + 5);
      return w > 0 && h > 0 ? { w, h } : null;
    }
    off += len;
  }
  return null;
}

type Pt = [number, number];

function isPt(v: unknown): v is Pt {
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  );
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

// width/length ratio from the four landmarks, in true pixel space. Returns null
// when the landmarks or the image size are missing/unusable so the caller can
// fall back to the model's own width_ratio estimate.
//
// Length is the heel→toe distance (the foot's long axis). Width is the medial→
// lateral breadth measured PERPENDICULAR to that axis — i.e. the magnitude of
// the cross product with the unit long axis. Using the perpendicular component
// (rather than the raw medial-to-lateral chord) cancels any fore/aft offset
// between the two ball points, which would otherwise inflate the width; it
// matches how foot width is measured anatomically (across the ball, square to
// the length).
export function ratioFromLandmarks(landmarks: unknown, size: ImageSize | null): number | null {
  if (!landmarks || typeof landmarks !== "object" || !size) return null;
  const lm = landmarks as Record<string, unknown>;
  const heel = lm.heel;
  const toe = lm.toe ?? lm.toe_tip;
  const med = lm.wide_medial ?? lm.medial;
  const lat = lm.wide_lateral ?? lm.lateral;
  if (!isPt(heel) || !isPt(toe) || !isPt(med) || !isPt(lat)) return null;
  const px = (pt: Pt): Pt => [clamp01(pt[0]) * size.w, clamp01(pt[1]) * size.h];
  const [hx, hy] = px(heel);
  const [tx, ty] = px(toe);
  const [mx, my] = px(med);
  const [lx, ly] = px(lat);

  const ax = tx - hx;
  const ay = ty - hy;
  const lengthPx = Math.hypot(ax, ay);
  if (lengthPx <= 0) return null;

  // Unit long axis, then the perpendicular component of the medial→lateral
  // vector: |w × û| = |w| · sin θ.
  const ux = ax / lengthPx;
  const uy = ay / lengthPx;
  const wx = lx - mx;
  const wy = ly - my;
  const widthPx = Math.abs(wx * uy - wy * ux);
  if (widthPx <= 0) return null;

  return widthPx / lengthPx;
}
