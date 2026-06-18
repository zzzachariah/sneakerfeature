"use client";

// Post-capture editor: drag to pan, slider to zoom, buttons to rotate — so the
// user can line their photo up with the outline (and fix a rotated photo from
// the device camera). On confirm we screenshot the framed image layer (WYSIWYG),
// so what they aligned is exactly what gets analysed.

import { useRef, useState } from "react";
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
  const drag = useRef<{ x: number; y: number } | null>(null);

  const [scale, setScale] = useState(1);
  const [rot, setRot] = useState(0);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [busy, setBusy] = useState(false);

  function onDown(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX - tx, y: e.clientY - ty };
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setTx(e.clientX - drag.current.x);
    setTy(e.clientY - drag.current.y);
  }
  function onUp() {
    drag.current = null;
  }

  async function confirm() {
    const node = captureRef.current;
    if (!node) {
      onConfirm(src);
      return;
    }
    setBusy(true);
    try {
      const { domToBlob } = await import("modern-screenshot");
      const blob = await domToBlob(node, { scale: 2, type: "image/jpeg", quality: 0.85 });
      const url = await blobToDataUrl(blob);
      haptics.success();
      onConfirm(url);
    } catch {
      // Screenshot failed — fall back to the untransformed capture.
      onConfirm(src);
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
            src={src}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full select-none object-cover"
            style={{
              transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${scale})`,
              transformOrigin: "center"
            }}
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
        value={scale}
        onChange={(e) => setScale(Number(e.target.value))}
        className="w-full accent-[rgb(var(--text))]"
        aria-label={translate("Zoom")}
      />

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="gap-2" onClick={() => setRot((r) => r - 90)}>
          <RotateCcw className="h-4 w-4" />
          {translate("Rotate left")}
        </Button>
        <Button variant="secondary" className="gap-2" onClick={() => setRot((r) => r + 90)}>
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
