"use client";

// Final report: the three traits with average-foot comparison bars, a shareable
// card, save-to-profile (feeds the AI Smart Picker), and history-friendly notes.

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Share2, RotateCcw, Sparkles } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { triggerDownload, safeFilename } from "@/lib/card/capture";
import { shareContent } from "@/lib/native/native";
import { haptics } from "@/lib/native/haptics";
import {
  WIDTH_LABEL,
  INSTEP_LABEL,
  TOE_LABEL,
  CONFIDENCE_LABEL,
  SIDE_LABEL,
  WIDTH_SCALE,
  INSTEP_SCALE,
  TOE_ORDER,
  type Confidence,
  type FootScanResult,
  type ToeShape,
  type ViewId
} from "@/lib/foot-scan/types";

const CONF_STYLE: Record<Confidence, string> = {
  low: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  medium: "bg-[rgb(var(--text)/0.08)] text-[rgb(var(--subtext))]",
  high: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
};

function ConfBadge({ level }: { level: Confidence }) {
  const { translate } = useLocale();
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CONF_STYLE[level]}`}>
      {translate(CONFIDENCE_LABEL[level])}
    </span>
  );
}

function ScaleBar({ value, average, leftLabel, rightLabel }: { value: number; average: number; leftLabel: string; rightLabel: string }) {
  const { translate } = useLocale();
  return (
    <div className="mt-2">
      <div className="relative h-2 rounded-full bg-[rgb(var(--text)/0.1)]">
        {/* average marker */}
        <span
          className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-[rgb(var(--subtext)/0.7)]"
          style={{ left: `${average * 100}%` }}
          title={translate("Average")}
        />
        {/* the user's value */}
        <span
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[rgb(var(--bg))] bg-[rgb(var(--text))]"
          style={{ left: `${value * 100}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] soft-text">
        <span>{translate(leftLabel)}</span>
        <span>{translate(rightLabel)}</span>
      </div>
    </div>
  );
}

export function ResultStep({
  result,
  scanId,
  onRestart,
  onRetake
}: {
  result: FootScanResult;
  scanId: string | null;
  onRestart: () => void;
  onRetake: (views: ViewId[]) => void;
}) {
  const { translate } = useLocale();
  const cardRef = useRef<HTMLDivElement>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [sharing, setSharing] = useState(false);

  const p = result.primary;
  const m = p.measurements;

  async function saveToProfile() {
    if (!scanId) return;
    setSaveState("saving");
    try {
      const res = await fetch("/api/foot-scan/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId })
      });
      const data = await res.json();
      if (data?.ok) {
        setSaveState("saved");
        haptics.success();
      } else {
        setSaveState("error");
      }
    } catch {
      setSaveState("error");
    }
  }

  async function share() {
    const node = cardRef.current;
    if (!node) return;
    setSharing(true);
    try {
      const { domToBlob } = await import("modern-screenshot");
      const blob = await domToBlob(node, { scale: 2, type: "image/png", quality: 1 });
      const file = new File([blob], safeFilename(["my-foot-type"]), { type: "image/png" });
      try {
        await shareContent({ title: "My foot type", text: "Scanned with sneakerfeature", files: [file] });
      } catch {
        triggerDownload(blob, safeFilename(["my-foot-type"]));
      }
    } catch {
      /* capture failed — no-op */
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* targeted re-shoot prompt */}
      {result.needs_retake.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-500/12 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="flex-1">
            <p className="font-medium">{translate("Some shots were low quality")}</p>
            <p className="text-xs soft-text">{translate("Re-taking them will improve accuracy.")}</p>
          </div>
          <Button variant="secondary" className="!min-h-[32px] px-2 text-xs" onClick={() => onRetake(result.needs_retake.map((r) => r.view))}>
            {translate("Re-take")}
          </Button>
        </div>
      )}

      {/* shareable card */}
      <div ref={cardRef} className="rounded-2xl bg-[rgb(var(--bg))]">
      <Card className="overflow-hidden p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">{translate("My Foot Type")}</h2>
          <span className="text-xs soft-text">{translate(SIDE_LABEL[p.side])}</span>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {/* width */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {translate("Width")}: {translate(WIDTH_LABEL[p.traits.width])}
              </span>
              <ConfBadge level={p.confidence.width} />
            </div>
            <ScaleBar value={WIDTH_SCALE[p.traits.width]} average={WIDTH_SCALE.standard} leftLabel="Narrow" rightLabel="Wide" />
          </div>

          {/* instep */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {translate("Instep")}: {translate(INSTEP_LABEL[p.traits.instep])}
              </span>
              <ConfBadge level={p.confidence.instep} />
            </div>
            <ScaleBar value={INSTEP_SCALE[p.traits.instep]} average={INSTEP_SCALE.normal} leftLabel="Low" rightLabel="High" />
          </div>

          {/* toe shape */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {translate("Toe shape")}: {translate(TOE_LABEL[p.traits.toe_shape])}
              </span>
              <ConfBadge level={p.confidence.toe_shape} />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {TOE_ORDER.map((t: ToeShape) => (
                <span
                  key={t}
                  className={`rounded-md px-1 py-1 text-center text-[10px] capitalize ${
                    t === p.traits.toe_shape
                      ? "bg-[rgb(var(--text))] font-semibold text-[rgb(var(--bg))]"
                      : "bg-[rgb(var(--text)/0.06)] text-[rgb(var(--subtext))]"
                  }`}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* measurements */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[rgb(var(--text)/0.08)] pt-3 text-xs soft-text">
            <span>
              {translate("Length")}: ~{(m.foot_length_mm / 10).toFixed(1)} cm
            </span>
            {m.foot_width_mm !== null && (
              <span>
                {translate("Width")}: ~{(m.foot_width_mm / 10).toFixed(1)} cm
              </span>
            )}
            {result.asymmetry && (
              <span>
                {translate("L/R length diff")}: ~{(result.asymmetry.length_diff_mm / 10).toFixed(1)} cm
              </span>
            )}
          </div>
          <span className="text-[10px] text-[rgb(var(--subtext)/0.7)]">sneakerfeature · {translate("Foot Scan")}</span>
        </div>
      </Card>
      </div>

      {/* summary + cautions */}
      {result.summary && <p className="text-sm leading-relaxed text-[rgb(var(--subtext))]">{result.summary}</p>}
      {result.cautions.length > 0 && (
        <ul className="space-y-1 text-xs soft-text">
          {result.cautions.map((c, i) => (
            <li key={i}>· {c}</li>
          ))}
        </ul>
      )}

      {/* actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          className="gap-2"
          disabled={!scanId || saveState === "saving" || saveState === "saved"}
          onClick={saveToProfile}
        >
          {saveState === "saved" ? <Check className="h-4 w-4" /> : null}
          {translate(saveState === "saved" ? "Saved to profile" : saveState === "saving" ? "Saving…" : "Save to my profile")}
        </Button>
        <Link href="/smart-picker" className="contents">
          <Button variant="secondary" className="w-full gap-2">
            <Sparkles className="h-4 w-4" />
            {translate("Find shoes for my feet")}
          </Button>
        </Link>
        <Button variant="secondary" className="gap-2" disabled={sharing} onClick={share}>
          <Share2 className="h-4 w-4" />
          {translate(sharing ? "Preparing…" : "Share")}
        </Button>
        <Button variant="ghost" className="gap-2" onClick={onRestart}>
          <RotateCcw className="h-4 w-4" />
          {translate("Scan again")}
        </Button>
      </div>
      {saveState === "error" && (
        <p className="text-xs text-red-500">{translate("Could not save. Please try again.")}</p>
      )}
    </div>
  );
}
