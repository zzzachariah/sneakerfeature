import { CARD_HEIGHT, CARD_WIDTH } from "@/components/card/card-frame";

const PIXEL_RATIO = 3;

async function waitForImages(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
    })
  );
}

async function waitForFonts() {
  if (typeof document === "undefined") return;
  const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready) {
    try {
      await fonts.ready;
    } catch {
      // ignore — fall through
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export async function captureCardToBlob(node: HTMLElement): Promise<Blob> {
  // Loaded on demand so the ~heavy screenshot lib stays out of the initial
  // bundle of every page that can open a share modal.
  const { domToBlob } = await import("modern-screenshot");
  await waitForFonts();
  await waitForImages(node);
  await new Promise((r) => setTimeout(r, 16));
  // Cards that grow with their content (the recommendation report) render taller
  // than CARD_HEIGHT, so capture the node's real height rather than cropping to
  // the canvas floor. Fixed-height cards measure back to exactly CARD_HEIGHT.
  const height = Math.max(CARD_HEIGHT, Math.ceil(node.getBoundingClientRect().height));
  return withTimeout(
    domToBlob(node, {
      scale: PIXEL_RATIO,
      width: CARD_WIDTH,
      height,
      type: "image/png",
      quality: 1,
    }),
    45000,
    "card capture"
  );
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function safeFilename(parts: Array<string | null | undefined>, ext = "png"): string {
  const cleaned = parts
    .map((p) => (p ?? "").toString().trim().toLowerCase())
    .filter(Boolean)
    .map((p) => p.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean);
  const base = cleaned.length > 0 ? cleaned.join("-") : "sneakerfeature-card";
  return `${base}.${ext}`;
}
