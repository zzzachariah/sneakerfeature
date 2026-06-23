// Native camera / photo-library picker for the Capacitor app.
//
// Returns a plain File so it drops straight into the existing upload flows
// (FormData). Everything is guarded so it is safe to import anywhere: on the web
// there is no native Camera, so callers fall back to a normal <input type=file>.
// The plugin is imported lazily so it never lands in the SSR/server bundle.
import { Capacitor } from "@capacitor/core";

export type CameraPickSource = "camera" | "photos" | "prompt";

// True only inside the native app with the Camera plugin compiled in (added via
// `npx cap sync` after installing @capacitor/camera). On the web we keep the
// plain file input, which already works everywhere.
export function nativeCameraAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Camera");
}

export type CameraPermissionResult = "granted" | "denied" | "unavailable";

// Proactively check — and, when still undetermined, request — the native camera
// permission *before* we open the camera. This is what makes the Foot Scan
// capture screen work on a fresh install: iOS renders the live preview through
// WKWebView's getUserMedia, which opens to a black frame the first time if the
// OS camera permission hasn't been granted yet; Android opens the native
// camera/photo picker. Surfacing the system dialog up-front means the camera
// actually shows instead of a black screen.
//
// Also requests the photo-library permission so the "Photos" button in the
// foot-scan capture step doesn't trigger a second prompt mid-action (and on
// fresh installs without NSPhotoLibraryUsageDescription it would crash; the
// up-front ask + try/catch makes that failure visible as a permission denial
// instead of a hard crash inside the picker).
//
// On the web there is no native permission to manage (the browser prompts on
// getUserMedia itself), so this resolves to "unavailable" and callers just
// proceed with their existing flow.
export async function ensureCameraPermission(): Promise<CameraPermissionResult> {
  if (!nativeCameraAvailable()) return "unavailable";
  try {
    const { Camera } = await import("@capacitor/camera");
    let status = await Camera.checkPermissions();
    const need: Array<"camera" | "photos"> = [];
    if (status.camera === "prompt" || status.camera === "prompt-with-rationale") need.push("camera");
    if (status.photos === "prompt" || status.photos === "prompt-with-rationale") need.push("photos");
    if (need.length > 0) {
      try {
        status = await Camera.requestPermissions({ permissions: need });
      } catch {
        // If the request itself rejects (e.g. Info.plist missing a usage
        // description) treat it as denied so callers can show a fallback
        // instead of hanging.
        return "denied";
      }
    }
    return status.camera === "granted" || status.camera === "limited" ? "granted" : "denied";
  } catch {
    // Plugin/runtime error — let the caller fall back to its normal flow.
    return "unavailable";
  }
}

// Capture a photo with the camera, or pick one from the library, through the
// native UI and return it as a File. `prompt` lets iOS show its own
// "Take Photo / Choose from Library" sheet. Resolves to null when the user
// cancels, denies permission, or the plugin isn't available — the caller then
// just stays on the web file input.
export async function pickPhotoFile(source: CameraPickSource = "prompt"): Promise<File | null> {
  if (!nativeCameraAvailable()) return null;
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const cameraSource =
      source === "camera"
        ? CameraSource.Camera
        : source === "photos"
          ? CameraSource.Photos
          : CameraSource.Prompt;

    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: cameraSource,
      quality: 85,
      correctOrientation: true,
      // A popover reads better than a fullscreen sheet on iPad; ignored on iPhone.
      presentationStyle: "popover"
    });

    const path = photo.webPath;
    if (!path) return null;

    // webPath is a WebView-readable URL for the captured/selected image; fetch it
    // back into a Blob and wrap as a File for the existing FormData upload.
    const res = await fetch(path);
    const blob = await res.blob();
    const ext = (photo.format || blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const type = blob.type || `image/${ext}`;
    return new File([blob], `photo-${Date.now()}.${ext}`, { type });
  } catch {
    // User cancelled / denied permission / plugin error — fall back silently.
    return null;
  }
}
