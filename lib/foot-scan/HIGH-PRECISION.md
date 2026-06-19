# Foot Scan — High-Precision Channels (A: native FOV · B: depth)

Two precision upgrades above the current photo + VLM pipeline. The **TypeScript
halves are implemented and unit-tested** now; the **native halves are written or
specced but UNVERIFIED** — they need the native `ios/`/`android/` Capacitor
projects + a device build (can't be compiled/tested in the cloud dev env).

### Status
| Piece | State |
|-------|-------|
| A — homography de-tilt math (`geometry.ts`) | ✅ implemented + tested |
| A — FOV plumbing (capture → API → analyze, scalar fallback) | ✅ implemented |
| A — native FOV plugin (`capacitor-foot-scan`, iOS Swift) | ⚠️ written, unverified |
| A — Android FOV plugin | ⛔ TODO |
| B — depth measurement core (`depth.ts`) | ✅ implemented + tested |
| B — capability detection + Beta opt-in UI (gates to "unavailable") | ✅ implemented |
| B — native depth/capability plugin (iOS `isDepthSupported`) | ⚠️ written, unverified |
| B — native AR capture (ARKit/ARCore → point cloud) | ⛔ TODO (big) |

### Wiring the native plugin (when ready)
`capacitor-foot-scan/` is a local plugin package (mirrors `native-chrome`). To
activate: add `"capacitor-foot-scan": "file:capacitor-foot-scan"` to
`package.json`, `npm install`, `npx cap sync`. Until then the JS bridge
(`lib/native/foot-scan-native.ts`) returns FOV = null and depth = unsupported,
so the app is unchanged (scalar de-tilt; Beta shows "unavailable").

Both are **additive tiers with graceful fallback**: when unavailable, the app
keeps using the existing photo pipeline unchanged.

Neither adds per-scan **API/credit** cost: FOV is a one-shot native read; depth
measurement is computed **on-device**. ARKit/ARCore are free SDKs; LiDAR/ToF are
built-in hardware. The cost is engineering + app size + device coverage.

---

## Channel A — Native camera FOV → exact homography de-tilt

**Goal:** replace the current scalar tilt correction (`correctRatioForTilt`) with
an exact planar rectification of the foot's ground plane, removing perspective
distortion from the width read. Needs the camera's true field of view.

### A.1 Capacitor plugin (single method)

```ts
// JS interface
interface FootScanNative {
  getCameraFieldOfView(): Promise<{
    horizontalDeg: number | null;
    verticalDeg: number | null;
    source: "ios-avcapture" | "android-camera2" | "unavailable";
  }>;
}
```

- **iOS (Swift):** `AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)`
  → `.activeFormat.videoFieldOfView` (horizontal FOV in degrees). For the AR path
  prefer `ARFrame.camera.intrinsics` (full 3×3, gives fx/fy/cx/cy directly).
- **Android (Kotlin):** Camera2 `CameraCharacteristics`:
  `LENS_INFO_AVAILABLE_FOCAL_LENGTHS[0]` (mm) and `SENSOR_INFO_PHYSICAL_SIZE` (mm)
  → `FOVh = 2·atan(sensorWidth / (2·focal))`.

### A.2 Flow
1. Read FOV once when the camera starts (cache it); attach to each shot next to
   the existing tilt (`beta/gamma`).
2. Plumb `fovDeg` per view through `capture-step → /api/foot-scan → analyze`,
   exactly like `tilt` already is.

### A.3 Geometry (in `geometry.ts`)
- `f_px = (imageLongEdge/2) / tan(FOV/2)`; `K = [[f,0,cx],[0,f,cy],[0,0,1]]`.
- Rotation `R` from the residual tilt (`beta − target`, `gamma`) mapping device
  axes → camera axes.
- Rectifying homography `H = K · R⁻¹ · K⁻¹`; apply `H` to the 4 top landmark
  points, then compute W/L from the rectified points.
- **Fallback:** when `fovDeg` is absent → current scalar `correctRatioForTilt`
  (zero regression). Clamp the corrected ratio as today.

### A.4 Verification
- Synthetic unit tests: a known camera + tilt must rectify a tilted square back
  to square (extend `scripts/test-foot-geometry.mts`).
- **Device checklist (must do once on a real phone):** confirm the `beta/gamma`
  → camera-axis **sign conventions** (a flipped sign makes tilt worse, not
  better). Validate top-view W/L stability across deliberate ±15° tilts.

---

## Channel B — Depth (LiDAR / ToF / ARCore) → measurement-grade

**Goal:** real-millimetre 3D measurement, including the things 2D can only infer
— absolute length/width, **instep height**, **ball girth (围度)**, and **arch /
flat-foot**. Ball girth + length is exactly what a **GB/T 3293 "型"/围度** last
mapping needs (the width-grading direction chosen earlier).

### B.1 Platform APIs
- **iOS:** ARKit. LiDAR devices expose `ARFrame.sceneDepth` (depthMap +
  confidenceMap) and scene reconstruction (`ARMeshAnchor`). Intrinsics from
  `ARFrame.camera`.
- **Android:** ARCore **Depth API** (`Frame.acquireDepthImage16Bits()` +
  confidence). Works on many devices via ML; ToF hardware improves quality.
- **Gating:** detect capability at runtime (`ARWorldTrackingConfiguration`
  `.supportsSceneReconstruction` / LiDAR; ARCore `Session.isDepthModeSupported`).
  No capability → silently keep the photo pipeline.

### B.2 Capture UX (no reference object — depth is already metric)
- Guided AR session: foot on a plain, contrasting floor; user slowly pans the
  phone around the foot while a live "coverage" meter fills. ~5–10 s.
- Optionally a medial (inner-side) pass to capture the arch.

### B.3 Processing (on-device; heavy lifting local, optional server polish)
1. Depth + intrinsics → **metric point cloud** (fuse frames; ARKit/ARCore give
   pose).
2. **Segment foot from floor:** RANSAC the dominant plane (floor) → keep points
   above it within the region of interest.
3. **Canonicalise:** floor normal = up; PCA of the footprint → long axis; build a
   foot-aligned coordinate frame.
4. **Measure:**
   - `foot_length_mm` = extent along the long axis; `foot_width_mm` = max breadth
     ⟂ to it (true mm — no shoe-size anchor needed).
   - `instep_height_mm` = max height above floor at 50% length.
   - `ball_girth_mm` = perimeter of the cross-section at the metatarsal (ball)
     line — the key new metric for last/型 selection.
   - `arch` / flat-foot = medial-arch clearance from the medial cross-section
     (or plantar contact area if the sole is captured).

### B.4 Data model (backward-compatible additions)
- Extend `FootMeasurements` with `ball_girth_mm`, `instep_height_mm`,
  and a `source: "photo" | "depth"` + precision tier. Existing fields stay; the
  photo pipeline keeps emitting `source: "photo"`.
- Feed `ball_girth_mm` + length into a GB/T 型 mapping for width grading.

### B.5 Milestones (each device-tested)
1. Capability detection + AR session scaffold + fallback wiring.
2. Depth → fused point cloud → foot/floor segmentation.
3. Length / width / instep height in mm.
4. Ball girth + GB/T 型 mapping.
5. Arch / flat-foot (medial pass).

### B.6 Risks / honest caveats
- Foot is a hard target: skin/sock texture, self-occlusion, sole-on-floor →
  noisy meshes; needs cleanup + robust landmarking.
- ARCore depth quality varies widely on non-ToF devices → keep confidence gating
  and fall back to photo when low.
- App size, AR/camera permissions, battery, longer capture time.
- Large native build across two platforms — realistically its own milestone; not
  compilable/verifiable in the current cloud dev environment.

---

## Sequencing
A first (small native plugin, helps every device, and is the perspective
foundation), then B as an opt-in premium path for capable devices. Both require
the committed `ios/`/`android/` projects + on-device verification before they can
be trusted.
