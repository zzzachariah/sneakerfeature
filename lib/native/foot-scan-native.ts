"use client";

// Bridge to the optional native Foot Scan plugin (capacitor-foot-scan).
//
// Two capabilities:
//   - getCameraFieldOfView() — true camera FOV for the exact homography de-tilt
//     (Channel A). Web / no plugin → null → analyzer falls back to the scalar
//     correction.
//   - isDepthSupported() — whether the device has LiDAR/ToF/ARCore depth, gating
//     the Beta high-precision scan (Channel B). Web / no plugin / unsupported →
//     { supported: false } → the UI shows "Beta unavailable".
//
// Everything degrades safely: until the native plugin is actually built into the
// app shell, FOV is null and depth is unsupported, so nothing changes for users.

import { Capacitor, registerPlugin } from "@capacitor/core";

export type DepthSensor = "lidar" | "tof" | "arcore" | "none";
export type DepthSupport = { supported: boolean; sensor: DepthSensor };
export type CameraFov = { horizontalDeg: number | null; verticalDeg: number | null; source: string };

interface FootScanNativePlugin {
  getCameraFieldOfView(): Promise<CameraFov>;
  isDepthSupported(): Promise<DepthSupport>;
}

let cached: FootScanNativePlugin | null = null;
function plugin(): FootScanNativePlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  if (!cached) {
    try {
      cached = registerPlugin<FootScanNativePlugin>("FootScanNative");
    } catch {
      return null;
    }
  }
  return cached;
}

// Horizontal camera FOV in degrees, or null when unavailable.
export async function getCameraFovDeg(): Promise<number | null> {
  const p = plugin();
  if (!p) return null;
  try {
    const r = await p.getCameraFieldOfView();
    return typeof r?.horizontalDeg === "number" && r.horizontalDeg > 1 && r.horizontalDeg < 179
      ? r.horizontalDeg
      : null;
  } catch {
    return null; // plugin method not implemented on this platform yet
  }
}

const UNSUPPORTED: DepthSupport = { supported: false, sensor: "none" };

export async function getDepthSupport(): Promise<DepthSupport> {
  const p = plugin();
  if (!p) return UNSUPPORTED;
  try {
    const r = await p.isDepthSupported();
    return r && typeof r.supported === "boolean" ? r : UNSUPPORTED;
  } catch {
    return UNSUPPORTED;
  }
}
