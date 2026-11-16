import assert from "node:assert/strict";
import sharp from "sharp";
import { sanitizeUploadedImage } from "../lib/images/sanitize-upload.ts";

// A phone-style JPEG carrying EXIF (camera + GPS) and a rotation flag.
const original = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#c00" } })
  .jpeg()
  .withMetadata({ orientation: 6 })
  .withExifMerge({ IFD0: { Make: "PhoneCo", Model: "X1" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 46/1 0/1" } })
  .toBuffer();
const fixture = await sharp(original).metadata();
assert.ok(fixture.exif && fixture.orientation === 6, "fixture has EXIF + rotation");

const clean = await sanitizeUploadedImage(new Uint8Array(original));
const meta = await sharp(Buffer.from(clean.bytes)).metadata();
assert.equal(meta.format, "webp");
assert.equal(meta.exif, undefined, "EXIF (incl. GPS) removed");
assert.equal(meta.xmp, undefined, "XMP removed");
assert.deepEqual([meta.width, meta.height], [20, 40], "orientation baked into pixels");

await assert.rejects(sanitizeUploadedImage(new TextEncoder().encode("<html><script>alert(1)</script></html>")), "non-images are rejected");
console.log("Upload sanitizing: metadata stripped, orientation applied, non-images rejected.");
