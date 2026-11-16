import sharp from "sharp";

// Re-encode a user-supplied photo. Decoding proves the bytes really are an
// image (the client-declared MIME type is not trusted), `.rotate()` bakes in the
// EXIF orientation, and sharp drops ALL metadata on output by default — EXIF
// (including GPS location), XMP, IPTC and embedded thumbnails.
export type SanitizedImage = { bytes: Uint8Array; contentType: "image/webp"; extension: "webp"; width: number; height: number };

/** Private bucket for unreviewed uploads (db/migrations/20261116121000_private_image_corrections.sql). */
export const PENDING_CORRECTIONS_BUCKET = "image-corrections";
export const PUBLIC_IMAGES_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "shoe-images";

const MAX_INPUT_PIXELS = 40_000_000; // ~40 MP; rejects decompression bombs
const MAX_EDGE = 2400;

export async function sanitizeUploadedImage(input: Uint8Array): Promise<SanitizedImage> {
  const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 100 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: new Uint8Array(data), contentType: "image/webp", extension: "webp", width: info.width, height: info.height };
}
