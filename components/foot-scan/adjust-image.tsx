"use client";

// Post-capture editor: drag to pan, slider to zoom, buttons to rotate — so the
// user can line their photo up with the outline (and fix a rotated photo from
// the device camera). The transform is applied imperatively (ref + rAF) so
// dragging stays smooth — no React re-render per pointer move. On confirm we
// screenshot the framed image layer (WYSIWYG).

import { useCallback, useRef, useState } from "react";
import { Check, RotateCcw, RotateCw, RefreshCw } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { haptics } from "@/lib/native/haptics";
import { FootOverlay } from "@/components/foot-scan/foot-overlays";
import type { FootSide, ViewId } from "@/lib/foot-scan/types";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function AdjustImage({
  src,
  view,
  side,
  onConfirm,
  onRetake
}: {
  src: string;
  view: ViewId;
  side: FootSide;
  onConfirm: (dataUrl: string) => void;
  onRetake: () => void;
}) {
  const { translate } = useLocale();
  const captureRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const t = useRef({ scale: 1, rot: 0, tx: 0, ty: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback(() => {
    raf.current = null;
    const el = imgRef.current;
    if (!el) return;
    const { scale, rot, tx, ty } = t.current;
    el.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${scale})`;
  }, []);

  const schedule = useCallback(() => {
    if (raf.current == null) raf.current = requestAnimationFrame(apply);
  }, [apply]);

  function onDown(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX - t.current.tx, y: e.clientY - t.current.ty };
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return;
    t.current.tx = e.clientX - drag.current.x;
    t.current.ty = e.clientY - drag.current.y;
    schedule();
  }
  function onUp() {
    drag.current = null;
  }

  function rotate(delta: number) {
    t.current.rot += delta;
    schedule();
  }

  // Long edge of the analysed image. ~1568 is the size the vision model uses
  // internally, so going larger wouldn't add usable detail.
  const OUT_LONG = 1568;

  async function confirm() {
    const node = captureRef.current;
    const img = imgRef.current;
    if (!node || !img || !img.naturalWidth) {
      onConfirm(src);
      return;
    }
    setBusy(true);
    try {
      // Reproduce the WYSIWYG framing with a single canvas affine transform on
      // the SOURCE pixels, then one high-quality encode. This replaces the old
      // modern-screenshot path, which rasterised the already-downscaled, CSS-
      // transformed <img> and re-JPEG'd it — softening exactly the toe/edge
      // detail the landmark read depends on.
      const rect = node.getBoundingClientRect();
      const dispW = rect.width;
      const dispH = rect.height;
      if (dispW <= 0 || dispH <= 0) throw new Error("no layout");
      const portrait = dispH >= dispW;
      const outW = portrait ? Math.round(OUT_LONG * (dispW / dispH)) : OUT_LONG;
      const outH = portrait ? OUT_LONG : Math.round(OUT_LONG * (dispH / dispW));
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no ctx");
      ctx.imageSmoothingQuality = "high";
      ctx.scale(outW / dispW, outH / dispH); // work in display coords
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, dispW, dispH);
      // object-cover fit of the source into the frame, then the user's transform
      // (translate → rotate → scale) about the frame centre — matching the CSS.
      const cover = Math.max(dispW / img.naturalWidth, dispH / img.naturalHeight);
      const cw = img.naturalWidth * cover;
      const ch = img.naturalHeight * cover;
      const { scale, rot, tx, ty } = t.current;
      ctx.translate(dispW / 2 + tx, dispH / 2 + ty);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(scale, scale);
      ctx.drawImage(img, -cw / 2, -ch / 2, cw, ch);
      const url = canvas.toDataURL("image/jpeg", 0.95);
      haptics.success();
      onConfirm(url);
    } catch {
      // Fallback: the original DOM-screenshot path.
      try {
        const { domToBlob } = await import("modern-screenshot");
        const blob = await domToBlob(node, { scale: 3, type: "image/jpeg", quality: 0.92 });
        onConfirm(await blobToDataUrl(blob));
      } catch {
        onConfirm(src);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative aspect-[3/4] w-full touch-none overflow-hidden rounded-2xl bg-black"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        <div ref={captureRef} className="absolute inset-0 overflow-hidden bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full select-none object-cover"
            style={{ transformOrigin: "center", willChange: "transform" }}
          />
        </div>
        {/* guide overlay — excluded from the screenshot */}
        <div className="opacity-60">
          <FootOverlay view={view} side={side} />
        </div>
      </div>

      <p className="text-center text-xs soft-text">
        {translate("Drag to move · zoom and rotate to match the outline")}
      </p>

      <input
        type="range"
        min={1}
        max={4}
        step={0.02}
        defaultValue={1}
        onInput={(e) => {
          t.current.scale = Number((e.target as HTMLInputElement).value);
          schedule();
        }}
        className="w-full accent-[rgb(var(--text))]"
        aria-label={translate("Zoom")}
      />

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="gap-2" onClick={() => rotate(-90)}>
          <RotateCcw className="h-4 w-4" />
          {translate("Rotate left")}
        </Button>
        <Button variant="secondary" className="gap-2" onClick={() => rotate(90)}>
          <RotateCw className="h-4 w-4" />
          {translate("Rotate right")}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" className="flex-1 gap-2" onClick={onRetake}>
          <RefreshCw className="h-4 w-4" />
          {translate("Retake")}
        </Button>
        <Button variant="primary" className="flex-1 gap-2" disabled={busy} onClick={confirm}>
          <Check className="h-4 w-4" />
          {translate(busy ? "Saving…" : "Use this")}
        </Button>
      </div>
    </div>
  );
}
