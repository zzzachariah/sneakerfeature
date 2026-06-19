"use client";

// Device-tilt hook powering the "gravity gate": each guided shot only fires when
// the phone is held at the right angle, which is what makes the three views
// reproducible (and therefore comparable). Degrades gracefully — when the sensor
// is missing or denied, callers fall back to a manual shutter.

import { useCallback, useEffect, useRef, useState } from "react";

export type TiltTarget = "flat" | "tilt45" | "vertical";

export type TiltPermission = "unknown" | "granted" | "denied" | "unsupported";

export type TiltState = {
  supported: boolean;
  permission: TiltPermission;
  beta: number | null; // front-to-back tilt in degrees
  gamma: number | null; // left-to-right tilt in degrees
  level: boolean; // within tolerance of the requested target
  requestPermission: () => Promise<void>;
};

// Expected front-back tilt (beta) per target, with a generous tolerance so real
// hands/props pass without fuss.
const TARGET_BETA: Record<TiltTarget, number> = {
  flat: 0, // phone horizontal, back camera pointing straight down
  tilt45: 45, // phone angled down ~45° at the foot
  vertical: 90 // phone upright, back camera pointing horizontally
};
const BETA_TOLERANCE = 20;
const GAMMA_TOLERANCE = 25; // roll, kept loose

type IOSDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

// iOS motion permission is granted per session, globally — so once any gesture
// grants it, every useDeviceTilt instance can start listening without prompting
// again. This module flag tracks that.
let motionPermissionGranted = false;

// Proactively request the iOS motion/orientation permission. MUST be called
// synchronously from inside a user gesture (e.g. a button onClick) on iOS, or
// the request is ignored. No-op (returns "granted"/"unsupported") elsewhere.
// Calling this up-front (on "Start scanning") makes the tilt de-tilt + angle
// gate work by default instead of waiting for the optional level-guide button.
export async function requestMotionPermission(): Promise<TiltPermission> {
  if (typeof window === "undefined" || typeof window.DeviceOrientationEvent === "undefined") {
    return "unsupported";
  }
  const DOE = window.DeviceOrientationEvent as IOSDeviceOrientationEvent;
  if (typeof DOE.requestPermission !== "function") {
    motionPermissionGranted = true; // non-iOS: no gate
    return "granted";
  }
  try {
    const res = await DOE.requestPermission();
    if (res === "granted") motionPermissionGranted = true;
    return res === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export function useDeviceTilt(target: TiltTarget): TiltState {
  const [beta, setBeta] = useState<number | null>(null);
  const [gamma, setGamma] = useState<number | null>(null);
  const [permission, setPermission] = useState<TiltPermission>("unknown");
  const listeningRef = useRef(false);

  const supported = typeof window !== "undefined" && typeof window.DeviceOrientationEvent !== "undefined";

  const handle = useCallback((e: DeviceOrientationEvent) => {
    if (e.beta !== null) setBeta(e.beta);
    if (e.gamma !== null) setGamma(e.gamma);
  }, []);

  const startListening = useCallback(() => {
    if (listeningRef.current) return;
    listeningRef.current = true;
    window.addEventListener("deviceorientation", handle, true);
  }, [handle]);

  const requestPermission = useCallback(async () => {
    if (!supported) {
      setPermission("unsupported");
      return;
    }
    const DOE = window.DeviceOrientationEvent as IOSDeviceOrientationEvent;
    if (typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        setPermission(res === "granted" ? "granted" : "denied");
        if (res === "granted") {
          motionPermissionGranted = true;
          startListening();
        }
      } catch {
        setPermission("denied");
      }
    } else {
      // Non-iOS: no explicit permission gate.
      setPermission("granted");
      startListening();
    }
  }, [supported, startListening]);

  useEffect(() => {
    if (!supported) {
      setPermission("unsupported");
      return;
    }
    const DOE = window.DeviceOrientationEvent as IOSDeviceOrientationEvent;
    // Android / desktop: attach immediately. iOS waits for requestPermission() —
    // but if it was already granted this session (e.g. the proactive request on
    // "Start scanning"), start listening now without another prompt.
    if (typeof DOE.requestPermission !== "function" || motionPermissionGranted) {
      setPermission("granted");
      startListening();
    }
    return () => {
      if (listeningRef.current) {
        window.removeEventListener("deviceorientation", handle, true);
        listeningRef.current = false;
      }
    };
  }, [supported, startListening, handle]);

  const level =
    beta !== null &&
    gamma !== null &&
    Math.abs(beta - TARGET_BETA[target]) <= BETA_TOLERANCE &&
    Math.abs(gamma) <= GAMMA_TOLERANCE;

  return { supported, permission, beta, gamma, level, requestPermission };
}
