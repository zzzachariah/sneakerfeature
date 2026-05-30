"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Download, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CARD_HEIGHT, CARD_WIDTH } from "@/components/card/card-frame";
import { CompareCard } from "@/components/card/compare-card";
import { SingleShoeCard } from "@/components/card/single-shoe-card";
import { RecommendationReportCard } from "@/components/smart-picker/recommendation-report-card";
import { useLocale } from "@/components/i18n/locale-provider";
import type { RadarAxis } from "@/components/detail/performance-radar";
import { captureCardToBlob, safeFilename, triggerDownload } from "@/lib/card/capture";
import type { RecommendationItem } from "@/lib/ai/types";
import type { Shoe } from "@/lib/types";

type Mode =
  | { kind: "single"; shoe: Shoe; axes: RadarAxis[] }
  | { kind: "compare"; shoes: Shoe[] }
  | { kind: "report"; requestText: string; recommendations: RecommendationItem[] };

type Props = {
  open: boolean;
  onClose: () => void;
  mode: Mode | null;
};

export function CardPreviewModal({ open, onClose, mode }: Props) {
  const { translate } = useLocale();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setError(null);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const node = wrapRef.current;
    if (!node) return;
    const compute = () => {
      const cs = window.getComputedStyle(node);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const availableWidth = Math.max(0, node.clientWidth - padX);
      const availableHeight = Math.max(0, node.clientHeight - padY);
      const sx = availableWidth / CARD_WIDTH;
      const sy = availableHeight / CARD_HEIGHT;
      const next = Math.min(sx, sy, 0.6);
      if (Number.isFinite(next) && next > 0) {
        setScale(Math.max(0.16, next));
      }
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(node);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [open]);

  const filename = useMemo(() => {
    if (!mode) return "sneakerfeature-card.png";
    if (mode.kind === "single") return safeFilename(["sneakerfeature", mode.shoe.slug]);
    if (mode.kind === "report") return safeFilename(["sneakerfeature", "picks", ...mode.recommendations.slice(0, 5).map((r) => r.slug)]);
    return safeFilename(["sneakerfeature", "compare", ...mode.shoes.map((s) => s.slug)]);
  }, [mode]);

  async function handleDownload() {
    const node = cardRef.current;
    if (!node) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await captureCardToBlob(node);
      triggerDownload(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to render the card.");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted || !open || !mode) return null;

  const renderCard = () => {
    if (mode.kind === "single") return <SingleShoeCard shoe={mode.shoe} axes={mode.axes} />;
    if (mode.kind === "report") return <RecommendationReportCard requestText={mode.requestText} recommendations={mode.recommendations} />;
    return <CompareCard shoes={mode.shoes} />;
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="overlay"
        className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgb(0_0_0/0.55)] p-3 md:p-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          key="dialog"
          role="dialog"
          aria-modal
          className="surface-card premium-border relative flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl shadow-[0_30px_72px_rgb(var(--glass-shadow)/0.42)]"
          style={{ maxHeight: "calc(100dvh - 24px)" }}
          initial={{ y: 18, opacity: 0, scale: 0.985 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 8, opacity: 0, scale: 0.985 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-4 md:px-6 md:pt-5">
            <div className="min-w-0">
              <p className="t-eyebrow">{translate("Share card")}</p>
              <h2 className="mt-0.5 text-base font-semibold tracking-[-0.02em] md:text-lg">
                {mode.kind === "single"
                  ? translate("Spec sheet")
                  : mode.kind === "report"
                    ? translate("Recommendation report")
                    : translate("Comparison sheet")}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg border border-[rgb(var(--muted)/0.5)] p-1.5 soft-text transition hover:border-[rgb(var(--text)/0.45)] hover:text-[rgb(var(--text))] md:p-2"
              aria-label={translate("Close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Offscreen native-size card — what we capture */}
          <div
            aria-hidden
            style={{
              position: "fixed",
              top: 0,
              left: -99999,
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              pointerEvents: "none",
            }}
          >
            <div ref={cardRef}>{renderCard()}</div>
          </div>

          {/* Visible scaled preview — separate render */}
          <div
            ref={wrapRef}
            className="flex flex-1 items-center justify-center overflow-auto px-4 py-3 md:px-6 md:py-4"
            style={{ minHeight: 0 }}
          >
            <div
              style={{
                width: CARD_WIDTH * scale,
                height: CARD_HEIGHT * scale,
                position: "relative",
                borderRadius: 20,
                overflow: "hidden",
                boxShadow: "0 24px 48px rgba(0,0,0,0.18)",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                  transform: `scale(${scale})`,
                  transformOrigin: "0 0",
                }}
              >
                {renderCard()}
              </div>
            </div>
          </div>

          {error ? (
            <p className="shrink-0 px-5 pb-2 text-xs text-rose-400 md:px-6">{error}</p>
          ) : null}

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[rgb(var(--muted)/0.25)] bg-[rgb(var(--bg-elev)/0.55)] px-5 py-3 md:px-6 md:py-4">
            <p className="hidden truncate text-xs soft-text md:block">{filename}</p>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border border-[rgb(var(--muted)/0.5)] px-3 py-1.5 text-xs soft-text transition hover:border-[rgb(var(--text)/0.45)] hover:text-[rgb(var(--text))] disabled:opacity-50"
              >
                {translate("Cancel")}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--text))] bg-[rgb(var(--text))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--bg))] transition hover:shadow-[0_8px_24px_rgb(var(--shadow)/0.3)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" />
                {busy ? translate("Rendering...") : translate("Download PNG")}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
