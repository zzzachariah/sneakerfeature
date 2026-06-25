"use client";

// Orchestrates the hidden Foot Scan flow:
//   checklist → size anchor → guided capture (3-4 shots) → analyse → report.

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { getDepthSupport } from "@/lib/native/foot-scan-native";
import { requestMotionPermission } from "@/lib/foot-scan/orientation";
import { ChecklistStep } from "@/components/foot-scan/checklist-step";
import { SizeStep, type SizeChoice } from "@/components/foot-scan/size-step";
import { CaptureStep, type ShotConfig, type CaptureMeta } from "@/components/foot-scan/capture-step";
import { DepthCapture } from "@/components/foot-scan/depth-capture";
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

type Step =
  | "checklist"
  | "size"
  | "capture"
  | "analyzing"
  | "result"
  | "retake_required"
  | "error"
  | "depth_beta";

export function FootScanClient() {
  const { translate, locale } = useLocale();
  const [step, setStep] = useState<Step>("checklist");
  const [choice, setChoice] = useState<SizeChoice | null>(null);
  const [shotList, setShotList] = useState<ViewId[]>([]);
  const [shotIndex, setShotIndex] = useState(0);
  const [captures, setCaptures] = useState<Partial<Record<ViewId, string>>>({});
  const [metas, setMetas] = useState<Partial<Record<ViewId, CaptureMeta>>>({});
  const [result, setResult] = useState<FootScanResult | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  // Depth-sensor capability for the Beta high-precision path (false until proven
  // — web / no native plugin / unsupported device all stay false).
  const [depthSupported, setDepthSupported] = useState(false);

  useEffect(() => {
    let alive = true;
    getDepthSupport().then((s) => {
      if (alive) setDepthSupported(s.supported);
    });
    return () => {
      alive = false;
    };
  }, []);

  function startCapture(c: SizeChoice) {
    setChoice(c);
    setCaptures({});
    setMetas({});
    const list: ViewId[] = c.captureBoth ? ["top", "oblique", "side", "top_other"] : ["top", "oblique", "side"];
    setShotList(list);
    setShotIndex(0);
    setStep("capture");
  }

  async function analyze(
    c: SizeChoice,
    caps: Partial<Record<ViewId, string>>,
    capMetas: Partial<Record<ViewId, CaptureMeta>>
  ) {
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
          images: { top: caps.top, oblique: caps.oblique, side: caps.side, top_other: caps.top_other ?? null },
          tilt: {
            top: capMetas.top?.tilt ?? null,
            oblique: capMetas.oblique?.tilt ?? null,
            side: capMetas.side?.tilt ?? null,
            top_other: capMetas.top_other?.tilt ?? null
          }
        })
      });
      const data = await res.json();
      if (!data?.ok) {
        const message = data?.message ?? translate("Analysis failed.");
        const detail = typeof data?.detail === "string" ? data.detail : null;
        console.error("[foot-scan] /api/foot-scan returned failure", {
          httpStatus: res.status,
          message,
          detail
        });
        setErrorMsg(detail ? `${message}\n${detail}` : message);
        setStep("error");
        return;
      }
      const r = data.result as FootScanResult;
      setResult(r);
      setScanId(data.scanId ?? null);
      setProfileSaved(Boolean(data.profileSaved));
      // Full-fail gate: if the model couldn't extract a usable width OR every
      // view was flagged as bad quality, we never show the report card — the
      // numbers would be guesses. Send the user straight back to capture.
      const totalViews = Object.values(caps).filter(Boolean).length;
      const noWidth = r.primary.measurements.width_ratio === null;
      const allBad = r.needs_retake.length >= totalViews;
      if (noWidth || allBad) {
        setStep("retake_required");
      } else {
        setStep("result");
      }
    } catch (e) {
      console.error("[foot-scan] /api/foot-scan request threw", e);
      setErrorMsg(translate("Network error. Please try again."));
      setStep("error");
    }
  }

  function handleCaptured(url: string, meta: CaptureMeta) {
    if (!choice) return;
    const view = shotList[shotIndex];
    const nextCaptures = { ...captures, [view]: url };
    const nextMetas = { ...metas, [view]: meta };
    setCaptures(nextCaptures);
    setMetas(nextMetas);
    if (shotIndex + 1 < shotList.length) {
      setShotIndex(shotIndex + 1);
    } else {
      void analyze(choice, nextCaptures, nextMetas);
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
    setMetas({});
    setResult(null);
    setScanId(null);
    setProfileSaved(false);
    setShotIndex(0);
    setStep("checklist");
  }

  function restartCapture() {
    if (!choice) {
      reset();
      return;
    }
    setCaptures({});
    setMetas({});
    setShotIndex(0);
    setStep("capture");
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

      {step === "checklist" && (
        <ChecklistStep
          onReady={() => {
            // Proactively request iOS motion permission here, inside the tap, so
            // the tilt de-tilt + angle gate work by default in the capture step.
            void requestMotionPermission();
            setStep("size");
          }}
          depthSupported={depthSupported}
          onChooseDepthBeta={() => setStep("depth_beta")}
        />
      )}

      {step === "depth_beta" && (
        <DepthCapture
          onComplete={(r) => {
            setResult(r);
            setScanId(null);
            setStep("result");
          }}
          onUsePhoto={() => setStep("size")}
          onBack={() => setStep("checklist")}
        />
      )}

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
        <ResultStep
          result={result}
          scanId={scanId}
          profileSaved={profileSaved}
          onRestart={reset}
          onRetake={handleRetake}
        />
      )}

      {step === "retake_required" && (
        <div className="flex flex-col items-center gap-5 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold tracking-tight">
              {translate("We couldn't read your foot")}
            </h2>
            <p className="px-4 text-sm soft-text">
              {translate(
                "Either the photos don't show your foot clearly, or the lighting/angle made the outline unreadable. Please re-take all the photos."
              )}
            </p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Button onClick={restartCapture} className="w-full">
              {translate("Re-take all photos")}
            </Button>
            <Button variant="ghost" onClick={reset} className="w-full">
              {translate("Start over")}
            </Button>
          </div>
        </div>
      )}

      {step === "error" && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="whitespace-pre-line text-sm text-[rgb(var(--error))]">{errorMsg}</p>
          <Button variant="secondary" onClick={() => setStep("size")}>
            {translate("Try again")}
          </Button>
        </div>
      )}
    </div>
    </div>
  );
}
