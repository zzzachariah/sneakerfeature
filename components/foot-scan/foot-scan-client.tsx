"use client";

// Orchestrates the hidden Foot Scan flow:
//   checklist → size anchor → guided capture (3-4 shots) → analyse → report.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { ChecklistStep } from "@/components/foot-scan/checklist-step";
import { SizeStep, type SizeChoice } from "@/components/foot-scan/size-step";
import { CaptureStep, type ShotConfig } from "@/components/foot-scan/capture-step";
import { ResultStep } from "@/components/foot-scan/result-step";
import type { FootScanResult, FootSide, ViewId } from "@/lib/foot-scan/types";

const SHOTS: Record<ViewId, ShotConfig> = {
  top: {
    view: "top",
    title: "Top-down view",
    measures: "Toe shape + width",
    tilt: "flat",
    mode: "handheld",
    instructions: [
      "Stand up, foot flat on the floor.",
      "Hold the phone directly above your foot, lens pointing straight down.",
      "Fit the whole foot in the outline; let your toes spread naturally.",
      "Keep the phone flat, then tap Capture."
    ]
  },
  oblique: {
    view: "oblique",
    title: "45° oblique view",
    measures: "Instep volume",
    tilt: "tilt45",
    mode: "handheld",
    instructions: [
      "Sit down with your foot flat on the floor.",
      "Hold the phone above your foot with the screen facing you.",
      "Tilt the TOP edge of the phone away from you until the camera looks down on your foot at about 45°.",
      "Frame the top of your foot in the outline, then tap Capture."
    ]
  },
  side: {
    view: "side",
    title: "Outer side view",
    measures: "Instep height",
    tilt: "vertical",
    mode: "propped",
    instructions: [
      "Lean the phone upright against a wall, book or bottle at floor level.",
      "Point the lens at where your foot will go.",
      "Place your foot in the outline, outer edge to the camera, toes forward.",
      "Tap Capture, or use the Timer if you can't reach the button."
    ]
  },
  top_other: {
    view: "top_other",
    title: "Other foot — top-down",
    measures: "Left / right difference",
    tilt: "flat",
    mode: "handheld",
    instructions: [
      "Now your other foot.",
      "Same as the first shot: phone flat, straight above the foot.",
      "Fit the whole foot in the outline, then tap Capture."
    ]
  }
};

type Step = "checklist" | "size" | "capture" | "analyzing" | "result" | "error";

export function FootScanClient() {
  const { translate, locale } = useLocale();
  const [step, setStep] = useState<Step>("checklist");
  const [choice, setChoice] = useState<SizeChoice | null>(null);
  const [shotList, setShotList] = useState<ViewId[]>([]);
  const [shotIndex, setShotIndex] = useState(0);
  const [captures, setCaptures] = useState<Partial<Record<ViewId, string>>>({});
  const [result, setResult] = useState<FootScanResult | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  function startCapture(c: SizeChoice) {
    setChoice(c);
    setCaptures({});
    const list: ViewId[] = c.captureBoth ? ["top", "oblique", "side", "top_other"] : ["top", "oblique", "side"];
    setShotList(list);
    setShotIndex(0);
    setStep("capture");
  }

  async function analyze(c: SizeChoice, caps: Partial<Record<ViewId, string>>) {
    if (!caps.top || !caps.oblique || !caps.side) {
      setErrorMsg(translate("Missing one of the required photos."));
      setStep("error");
      return;
    }
    setStep("analyzing");
    try {
      const res = await fetch("/api/foot-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primarySide: c.primarySide,
          footLengthMm: c.footLengthMm,
          locale,
          images: { top: caps.top, oblique: caps.oblique, side: caps.side, top_other: caps.top_other ?? null }
        })
      });
      const data = await res.json();
      if (!data?.ok) {
        setErrorMsg(data?.message ?? translate("Analysis failed."));
        setStep("error");
        return;
      }
      setResult(data.result as FootScanResult);
      setScanId(data.scanId ?? null);
      setStep("result");
    } catch {
      setErrorMsg(translate("Network error. Please try again."));
      setStep("error");
    }
  }

  function handleCaptured(url: string) {
    if (!choice) return;
    const view = shotList[shotIndex];
    const nextCaptures = { ...captures, [view]: url };
    setCaptures(nextCaptures);
    if (shotIndex + 1 < shotList.length) {
      setShotIndex(shotIndex + 1);
    } else {
      void analyze(choice, nextCaptures);
    }
  }

  function handleRetake(views: ViewId[]) {
    if (views.length === 0) return;
    setShotList(views);
    setShotIndex(0);
    setStep("capture");
  }

  function reset() {
    setChoice(null);
    setCaptures({});
    setResult(null);
    setScanId(null);
    setShotIndex(0);
    setStep("checklist");
  }

  const currentView = shotList[shotIndex];
  // The outline should match the foot being shot (mirror for the left foot).
  const currentSide: FootSide = choice
    ? currentView === "top_other"
      ? choice.primarySide === "right"
        ? "left"
        : "right"
      : choice.primarySide
    : "right";

  return (
    <div className="has-mobile-nav-pad">
    <div className="container-shell mx-auto max-w-md px-4 py-8">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{translate("Foot Scan")}</h1>
        <p className="mt-1 text-sm soft-text">{translate("Discover your foot shape in about a minute.")}</p>
      </header>

      {step === "checklist" && <ChecklistStep onReady={() => setStep("size")} />}

      {step === "size" && <SizeStep onSubmit={startCapture} />}

      {step === "capture" && choice && currentView && (
        <CaptureStep
          key={`${currentView}-${shotIndex}`}
          config={SHOTS[currentView]}
          side={currentSide}
          index={shotIndex}
          total={shotList.length}
          onCaptured={handleCaptured}
          onBack={shotIndex > 0 ? () => setShotIndex(shotIndex - 1) : () => setStep("size")}
        />
      )}

      {step === "analyzing" && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--text))]" />
          <p className="text-sm soft-text">{translate("Reading your foot shape…")}</p>
        </div>
      )}

      {step === "result" && result && (
        <ResultStep result={result} scanId={scanId} onRestart={reset} onRetake={handleRetake} />
      )}

      {step === "error" && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-sm text-red-500">{errorMsg}</p>
          <Button variant="secondary" onClick={() => setStep("size")}>
            {translate("Try again")}
          </Button>
        </div>
      )}
    </div>
    </div>
  );
}
