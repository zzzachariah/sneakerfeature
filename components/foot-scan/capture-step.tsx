"use client";

// One guided shot. Two capture modes:
//   - "live": in-app camera preview + alignment overlay (web, iOS app). The user
//     taps to capture — no auto-shutter. A self-timer is offered for the propped
//     side shot.
//   - "photo": the device camera via the file/native picker, used on Android
//     (WebView getUserMedia is unreliable) and whenever the live preview can't
//     start.
// After capture the user lands in the Adjust step (rotate / zoom / pan) to line
// the photo up with the outline.

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Timer, Images } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { haptics } from "@/lib/native/haptics";
import { useDeviceTilt, type TiltTarget } from "@/lib/foot-scan/orientation";
import { nativeCameraAvailable, pickPhotoFile } from "@/lib/native/camera";
import { FootOverlay } from "@/components/foot-scan/foot-overlays";
import { AdjustImage } from "@/components/foot-scan/adjust-image";
import type { FootSide, ViewId } from "@/lib/foot-scan/types";

export type ShotConfig = {
  view: ViewId;
  title: string;
  measures: string;
  instructions: string[];
  tilt: TiltTarget;
  mode: "handheld" | "propped";
};

const MAX_DIM = 1280;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

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

type Mode = "starting" | "live" | "photo" | "captured";

export function CaptureStep({
  config,
  side,
  index,
  total,
  onCaptured,
  onBack
}: {
  config: ShotConfig;
  side: FootSide;
  index: number;
  total: number;
  onCaptured: (dataUrl: string) => void;
  onBack?: () => void;
}) {
  const { translate } = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  // Android WebView getUserMedia is unreliable, so go straight to the device
  // camera there. iOS app + web try the live preview first.
  const skipLive = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

  const [mode, setMode] = useState<Mode>(skipLive ? "photo" : "starting");
  const [captured, setCaptured] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const tilt = useDeviceTilt(config.tilt);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCount(0);
  }, []);

  const capture = useCallback(() => {
    clearTimer();
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
    setMode("captured");
    haptics.success();
  }, [clearTimer, stopStream]);

  // Camera lifecycle (re-runs on retake via `attempt`). The <video> is rendered
  // for both "starting" and "live" so the ref exists when we attach the stream.
  useEffect(() => {
    if (skipLive) {
      setMode("photo");
      return;
    }
    let cancelled = false;
    async function start() {
      setMode("starting");
      if (!navigator.mediaDevices?.getUserMedia) {
        setMode("photo");
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
        setMode("live");
      } catch {
        if (!cancelled) setMode("photo");
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [attempt, skipLive]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  // User-initiated self-timer (handy for the propped side shot).
  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    setCount(3);
    haptics.gesture();
    timerRef.current = window.setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          capture();
          return 0;
        }
        haptics.selection();
        return c - 1;
      });
    }, 1000);
  }, [capture]);

  async function handleFile(file: File | null) {
    if (!file) return;
    const url = await downscale(await fileToDataUrl(file));
    stopStream();
    setCaptured(url);
    setMode("captured");
    haptics.success();
  }

  function retake() {
    setCaptured(null);
    setMode(skipLive ? "photo" : "starting");
    setAttempt((a) => a + 1);
  }

  const levelHint =
    config.tilt === "flat"
      ? translate("Hold the phone flat, facing down")
      : config.tilt === "tilt45"
        ? translate("Tilt the top of the phone away from you (~45°)")
        : translate("Hold the phone upright");

  const header = (
    <>
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
    </>
  );

  if (captured) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <AdjustImage src={captured} view={config.view} side={side} onConfirm={onCaptured} onRetake={retake} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header}

      {/* viewport */}
      <div
        className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl ${
          mode === "live" || mode === "starting" ? "bg-black" : "bg-[rgb(var(--text)/0.06)]"
        }`}
      >
        {mode === "live" || mode === "starting" ? (
          <>
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <FootOverlay view={config.view} side={side} />
            {mode === "live" && (
              <div className="absolute left-1/2 top-3 -translate-x-1/2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium backdrop-blur ${
                    tilt.permission === "granted" && tilt.level ? "bg-emerald-500/85 text-white" : "bg-black/55 text-white"
                  }`}
                >
                  {tilt.permission === "granted" && tilt.level ? translate("Looks level") : levelHint}
                </span>
              </div>
            )}
            {count > 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-7xl font-bold text-white drop-shadow-lg">{count}</span>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <FootOverlay view={config.view} side={side} />
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white">
              {translate("Take a photo, then line it up with the outline")}
            </span>
          </div>
        )}
      </div>

      {/* enable-level (advisory only; iOS needs a gesture) */}
      {mode === "live" && tilt.supported && tilt.permission !== "granted" && tilt.permission !== "unsupported" && (
        <button onClick={() => tilt.requestPermission()} className="text-xs text-[rgb(var(--subtext))] underline">
          {translate("Enable the level guide")}
        </button>
      )}

      {/* instructions */}
      <ol className="space-y-1.5 rounded-xl bg-[rgb(var(--text)/0.04)] p-3 text-sm text-[rgb(var(--subtext))]">
        {config.instructions.map((line, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-semibold text-[rgb(var(--text))]">{i + 1}.</span>
            <span>{translate(line)}</span>
          </li>
        ))}
      </ol>

      {/* controls */}
      <div className="flex items-center gap-2">
        {mode === "live" ? (
          <>
            {onBack && (
              <Button variant="ghost" onClick={onBack}>
                {translate("Back")}
              </Button>
            )}
            <Button variant="primary" className="flex-1 gap-2" onClick={capture}>
              <Camera className="h-4 w-4" />
              {translate("Capture")}
            </Button>
            {config.mode === "propped" && (
              <Button variant="secondary" className="gap-2" disabled={count > 0} onClick={startTimer}>
                <Timer className="h-4 w-4" />
                {translate("Timer")}
              </Button>
            )}
          </>
        ) : mode === "starting" ? (
          <Button variant="primary" className="flex-1" disabled>
            {translate("Starting camera…")}
          </Button>
        ) : (
          <>
            {onBack && (
              <Button variant="ghost" onClick={onBack}>
                {translate("Back")}
              </Button>
            )}
            {nativeCameraAvailable() ? (
              <>
                <Button variant="primary" className="flex-1 gap-2" onClick={async () => handleFile(await pickPhotoFile("camera"))}>
                  <Camera className="h-4 w-4" />
                  {translate("Take photo")}
                </Button>
                <Button variant="secondary" className="gap-2" onClick={async () => handleFile(await pickPhotoFile("photos"))}>
                  <Images className="h-4 w-4" />
                  {translate("Photos")}
                </Button>
              </>
            ) : (
              <>
                <label className="flex-1">
                  <span className="liquid-interactive inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[rgb(var(--text))] bg-[rgb(var(--text))] px-4 text-sm font-semibold text-[rgb(var(--bg))] md:min-h-[36px]">
                    <Camera className="h-4 w-4" />
                    {translate("Take photo")}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <label className="inline-flex">
                  <span className="liquid-interactive inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] px-4 text-sm text-[rgb(var(--text))] md:min-h-[36px]">
                    <Images className="h-4 w-4" />
                    {translate("Photos")}
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
          </>
        )}
      </div>
    </div>
  );
}
