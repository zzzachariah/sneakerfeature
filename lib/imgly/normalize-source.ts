// @imgly/background-removal only accepts image/jpeg, image/png and image/webp as
// input; anything else (an AVIF product shot, or a blob served with an unknown /
// empty content-type) makes it throw "Invalid format: image/avif …". Browsers
// can still DECODE those formats, so re-encode the source to PNG via canvas
// first and hand imgly a format it understands. Supported inputs pass straight
// through so the common path stays a no-op. Client-only (uses canvas).

const IMGLY_SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function normalizeForImgly(blob: Blob): Promise<Blob> {
  if (IMGLY_SUPPORTED.has(blob.type)) return blob;

  const bmp = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");
    ctx.drawImage(bmp, 0, 0);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("Could not re-encode the source image.");
    return png;
  } finally {
    bmp.close?.();
  }
}
