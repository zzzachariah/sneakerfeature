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
import type { Vec3 } from "@/lib/foot-scan/depth";

export type DepthSensor = "lidar" | "tof" | "arcore" | "none";
export type DepthSupport = { supported: boolean; sensor: DepthSensor };
export type CameraFov = { horizontalDeg: number | null; verticalDeg: number | null; source: string };
// Native returns a flat [x,y,z,x,y,z,…] cloud + its unit; the JS side reshapes.
export type DepthScan = { points: number[]; unit: "m" | "mm" };

interface FootScanNativePlugin {
  getCameraFieldOfView(): Promise<CameraFov>;
  isDepthSupported(): Promise<DepthSupport>;
  scanFootDepth(): Promise<DepthScan>;
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

// Run the native guided depth scan and reshape the flat cloud into Vec3[] plus a
// unit→mm factor. null when no plugin / scan failed (so the UI can fall back).
export async function scanFootDepth(): Promise<{ points: Vec3[]; unitToMm: number } | null> {
  const p = plugin();
  if (!p) return null;
  try {
    const r = await p.scanFootDepth();
    const flat = r?.points;
    if (!Array.isArray(flat) || flat.length < 150) return null; // need ≥50 points
    const points: Vec3[] = [];
    for (let i = 0; i + 2 < flat.length; i += 3) points.push([flat[i], flat[i + 1], flat[i + 2]]);
    return { points, unitToMm: r.unit === "mm" ? 1 : 1000 };
  } catch {
    return null;
  }
}
