"use client";

// One guided shot: live camera preview + alignment overlay + gravity-gated
// auto-shutter, with haptics, voice cues, a manual shutter, and a graceful
// fallback to the file picker when the camera/sensor isn't available.

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, Check, SwitchCamera, SmartphoneNfc } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { haptics } from "@/lib/native/haptics";
import { useDeviceTilt, type TiltTarget } from "@/lib/foot-scan/orientation";
import { nativeCameraAvailable, pickPhotoFile } from "@/lib/native/camera";
import { FootOverlay } from "@/components/foot-scan/foot-overlays";
import type { ViewId } from "@/lib/foot-scan/types";

export type ShotConfig = {
  view: ViewId;
  title: string;
  measures: string;
  instructions: string[];
  tilt: TiltTarget;
  mode: "handheld" | "propped";
};

const MAX_DIM = 1280;

function speak(text: string) {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* speech unavailable */
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Downscale an arbitrary data URL to keep upload size sane.
function downscale(url: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(url);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

type Phase = "init" | "aligning" | "counting" | "captured" | "error";

export function CaptureStep({
  config,
  index,
  total,
  onCaptured,
  onBack
}: {
  config: ShotConfig;
  index: number;
  total: number;
  onCaptured: (dataUrl: string) => void;
  onBack?: () => void;
}) {
  const { translate } = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stableTimer = useRef<number | null>(null);
  const countTimer = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>("init");
  const [captured, setCaptured] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const tilt = useDeviceTilt(config.tilt);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const capture = useCallback(() => {
    if (countTimer.current) {
      clearInterval(countTimer.current);
      countTimer.current = null;
    }
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, MAX_DIM / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const url = canvas.toDataURL("image/jpeg", 0.82);
    stopStream();
    setCaptured(url);
    setPhase("captured");
    haptics.success();
    speak("Captured");
  }, [stopStream]);

  // Camera lifecycle (restarts on retake via `attempt`).
  useEffect(() => {
    let cancelled = false;
    async function start() {
      setPhase("init");
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase("error");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setPhase("aligning");
      } catch {
        if (!cancelled) setPhase("error");
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [attempt]);

  const startCountdown = useCallback(() => {
    setPhase("counting");
    setCount(3);
    haptics.gesture();
    speak(config.mode === "propped" ? "Hold still" : "Hold still, capturing");
    countTimer.current = window.setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          capture();
          return 0;
        }
        haptics.selection();
        return c - 1;
      });
    }, 800);
  }, [capture, config.mode]);

  // Auto-shutter: once the phone is held level, settle briefly then count down.
  useEffect(() => {
    if (phase !== "aligning") return;
    if (!tilt.level) {
      if (stableTimer.current) {
        clearTimeout(stableTimer.current);
        stableTimer.current = null;
      }
      return;
    }
    haptics.gesture();
    stableTimer.current = window.setTimeout(() => startCountdown(), 900);
    return () => {
      if (stableTimer.current) {
        clearTimeout(stableTimer.current);
        stableTimer.current = null;
      }
    };
  }, [tilt.level, phase, startCountdown]);

  // Lost alignment mid-countdown → abort and wait for re-alignment.
  useEffect(() => {
    if (phase === "counting" && !tilt.level) {
      if (countTimer.current) {
        clearInterval(countTimer.current);
        countTimer.current = null;
      }
      setPhase("aligning");
    }
  }, [phase, tilt.level]);

  async function handleFile(file: File | null) {
    if (!file) return;
    const url = await downscale(await fileToDataUrl(file));
    stopStream();
    setCaptured(url);
    setPhase("captured");
    haptics.success();
  }

  function retake() {
    setCaptured(null);
    setAttempt((a) => a + 1);
  }

  function confirm() {
    if (captured) onCaptured(captured);
  }

  const levelHint =
    config.tilt === "flat"
      ? translate("Hold the phone flat, facing straight down")
      : config.tilt === "tilt45"
        ? translate("Tilt the phone to about 45°")
        : translate("Hold the phone upright");

  return (
    <div className="flex flex-col gap-4">
      {/* progress */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-[rgb(var(--text))]" : "bg-[rgb(var(--text)/0.15)]"}`}
          />
        ))}
      </div>

      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">
          {translate(config.title)}{" "}
          <span className="text-sm font-normal text-[rgb(var(--subtext))]">
            {index + 1}/{total}
          </span>
        </h2>
        <span className="text-xs soft-text">{translate(config.measures)}</span>
      </div>

      {/* viewport */}
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-black">
        {captured ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={captured} alt={translate(config.title)} className="h-full w-full object-cover" />
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <FootOverlay view={config.view} />
            {/* level chip */}
            <div className="absolute left-1/2 top-3 -translate-x-1/2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium backdrop-blur ${
                  tilt.level
                    ? "bg-emerald-500/85 text-white"
                    : "bg-black/55 text-white"
                }`}
              >
                {tilt.permission !== "granted"
                  ? levelHint
                  : tilt.level
                    ? translate("Level — hold steady")
                    : levelHint}
              </span>
            </div>
            {/* countdown */}
            {phase === "counting" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-7xl font-bold text-white drop-shadow-lg">{count}</span>
              </div>
            )}
            {phase === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-white/90">
                  {translate("Camera unavailable. Pick a photo instead.")}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* enable-level prompt (iOS gesture requirement) */}
      {!captured && tilt.supported && tilt.permission !== "granted" && tilt.permission !== "unsupported" && (
        <button
          onClick={() => tilt.requestPermission()}
          className="inline-flex items-center justify-center gap-2 text-xs text-[rgb(var(--subtext))] underline"
        >
          <SmartphoneNfc className="h-3.5 w-3.5" />
          {translate("Enable the level guide")}
        </button>
      )}

      {/* instructions */}
      {!captured && (
        <ol className="space-y-1.5 rounded-xl bg-[rgb(var(--text)/0.04)] p-3 text-sm text-[rgb(var(--subtext))]">
          {config.instructions.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-semibold text-[rgb(var(--text))]">{i + 1}.</span>
              <span>{translate(line)}</span>
            </li>
          ))}
        </ol>
      )}

      {/* controls */}
      <div className="flex items-center gap-2">
        {captured ? (
          <>
            <Button variant="secondary" className="flex-1 gap-2" onClick={retake}>
              <RotateCcw className="h-4 w-4" />
              {translate("Retake")}
            </Button>
            <Button variant="primary" className="flex-1 gap-2" onClick={confirm}>
              <Check className="h-4 w-4" />
              {translate("Use this")}
            </Button>
          </>
        ) : phase === "error" ? (
          <>
            {nativeCameraAvailable() ? (
              <Button
                variant="primary"
                className="flex-1 gap-2"
                onClick={async () => handleFile(await pickPhotoFile("prompt"))}
              >
                <Camera className="h-4 w-4" />
                {translate("Take / choose photo")}
              </Button>
            ) : (
              <label className="flex-1">
                <span className="liquid-interactive inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[rgb(var(--text))] bg-[rgb(var(--text))] px-4 text-sm font-semibold text-[rgb(var(--bg))] md:min-h-[36px]">
                  <Camera className="h-4 w-4" />
                  {translate("Choose photo")}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </>
        ) : (
          <>
            {onBack && (
              <Button variant="ghost" onClick={onBack}>
                {translate("Back")}
              </Button>
            )}
            <Button
              variant="primary"
              className="flex-1 gap-2"
              disabled={phase === "init"}
              onClick={capture}
            >
              <Camera className="h-4 w-4" />
              {translate("Capture")}
            </Button>
            <label className="inline-flex" title={translate("Choose photo")}>
              <span className="liquid-interactive inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] text-[rgb(var(--text))] md:h-9 md:w-9">
                <SwitchCamera className="h-4 w-4" />
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}
