"use client";

// Beta high-precision capture (Channel B). Only reached when the device reports
// a depth sensor. Drives the native guided depth scan (capacitor-foot-scan),
// turns the returned point cloud into a FootScanResult via the tested geometry,
// and hands it back to the orchestrator to render in the normal result UI.
//
// If the native scan returns nothing (e.g. the plugin isn't built into this
// shell yet, or capture failed), it degrades to an "unavailable" state that
// points the user back to the photo scan — never a crash or a fake result.

import { useState } from "react";
import { Sparkles, Loader2, ScanLine } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { haptics } from "@/lib/native/haptics";
import { ensureCameraPermission } from "@/lib/native/camera";
import { scanFootDepth } from "@/lib/native/foot-scan-native";
import { depthResultFromCloud } from "@/lib/foot-scan/depth-result";
import type { FootScanResult, FootSide } from "@/lib/foot-scan/types";

type Phase = "intro" | "scanning" | "unavailable" | "denied";

export function DepthCapture({
  onComplete,
  onUsePhoto,
  onBack
}: {
  onComplete: (result: FootScanResult) => void;
  onUsePhoto: () => void;
  onBack: () => void;
}) {
  const { translate, locale } = useLocale();
  const [phase, setPhase] = useState<Phase>("intro");
  const [side, setSide] = useState<FootSide>("right");

  async function startScan() {
    // Request the camera permission up-front (first use): ARKit/ARCore need it,
    // same as the photo path. Web prompts on capture, so "unavailable" proceeds.
    const perm = await ensureCameraPermission();
    if (perm === "denied") {
      setPhase("denied");
      return;
    }
    setPhase("scanning");
    haptics.gesture();
    const scan = await scanFootDepth();
    if (!scan) {
      setPhase("unavailable");
      return;
    }
    const result = depthResultFromCloud(scan.points, side, scan.unitToMm, locale);
    if (!result) {
      setPhase("unavailable");
      return;
    }
    haptics.success();
    onComplete(result);
  }

  const Heading = (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(var(--text)/0.06)]">
        <Sparkles className="h-6 w-6 text-[rgb(var(--text))]" />
      </span>
      <h2 className="text-lg font-semibold tracking-[-0.01em]">
        {translate("High-precision scan")}{" "}
        <span className="align-middle rounded bg-[rgb(var(--text)/0.1)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
          Beta
        </span>
      </h2>
    </div>
  );

  if (phase === "scanning") {
    return (
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        {Heading}
        <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--text))]" />
        <p className="text-sm soft-text">{translate("Scanning… slowly move the phone around your foot.")}</p>
      </Card>
    );
  }

  if (phase === "unavailable" || phase === "denied") {
    return (
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        {Heading}
        <p className="text-sm soft-text">
          {phase === "denied"
            ? translate("Camera access is needed for the depth scan. Turn it on in Settings, or use the photo scan.")
            : translate("Couldn't complete the depth scan on this device. Use the photo scan instead.")}
        </p>
        <div className="flex w-full gap-2">
          <Button variant="ghost" className="flex-1" onClick={onBack}>
            {translate("Back")}
          </Button>
          <Button variant="primary" className="flex-1" onClick={onUsePhoto}>
            {translate("Use photo scan")}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-5 p-6">
      {Heading}
      <p className="text-center text-sm soft-text">
        {translate("Your device's depth sensor measures real millimetres — length, width, instep height and ball girth.")}
      </p>

      <ol className="space-y-1.5 rounded-xl bg-[rgb(var(--text)/0.04)] p-3 text-sm text-[rgb(var(--subtext))]">
        {[
          "Stand with your foot flat on a plain floor.",
          "Hold the phone ~30 cm above and to the side of your foot.",
          "Slowly arc the phone around the foot until it's fully covered."
        ].map((line, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-semibold text-[rgb(var(--text))]">{i + 1}.</span>
            <span>{translate(line)}</span>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-center gap-2">
        {(["left", "right"] as FootSide[]).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`min-h-[40px] flex-1 rounded-lg border px-3 text-sm font-medium ${
              side === s
                ? "border-[rgb(var(--text))] bg-[rgb(var(--text))] text-[rgb(var(--bg))]"
                : "border-[rgb(var(--glass-stroke-soft)/0.55)] text-[rgb(var(--text))]"
            }`}
          >
            {translate(s === "left" ? "Left foot" : "Right foot")}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack}>
          {translate("Back")}
        </Button>
        <Button variant="primary" className="flex-1 gap-2" onClick={startScan}>
          <ScanLine className="h-4 w-4" />
          {translate("Start depth scan")}
        </Button>
      </div>
    </Card>
  );
}
