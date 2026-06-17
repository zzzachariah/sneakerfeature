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
