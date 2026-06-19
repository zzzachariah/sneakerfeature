package com.sneakerfeature.footscan

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.util.SizeF
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlin.math.atan
import kotlin.math.max

// Native Foot Scan plugin (Android). JS name "FootScanNative" — see
// lib/native/foot-scan-native.ts.
//
// ⚠️ UNVERIFIED: written without an Android SDK/device. getCameraFieldOfView and
// isDepthSupported use stable Camera2 / ARCore APIs and should be close;
// scanFootDepth needs a GL render loop (see below) and is left rejecting for now.
@CapacitorPlugin(name = "FootScanNative")
class FootScanPlugin : Plugin() {

    // Horizontal FOV (degrees) of the back camera, from Camera2 lens focal length
    // + sensor physical size: FOVh = 2·atan(sensorWidth / (2·focal)). Feeds the
    // exact homography de-tilt (Channel A).
    @PluginMethod
    fun getCameraFieldOfView(call: PluginCall) {
        val result = JSObject()
        try {
            val cm = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val backId = cm.cameraIdList.firstOrNull { id ->
                cm.getCameraCharacteristics(id)
                    .get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
            }
            if (backId == null) {
                result.put("horizontalDeg", JSObject.NULL)
                result.put("verticalDeg", JSObject.NULL)
                result.put("source", "unavailable")
                call.resolve(result)
                return
            }
            val chars = cm.getCameraCharacteristics(backId)
            val focal = chars.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.firstOrNull()
            val size: SizeF? = chars.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE)
            if (focal == null || focal <= 0f || size == null) {
                result.put("horizontalDeg", JSObject.NULL)
                result.put("verticalDeg", JSObject.NULL)
                result.put("source", "unavailable")
                call.resolve(result)
                return
            }
            val fovH = Math.toDegrees(2.0 * atan((size.width / (2f * focal)).toDouble()))
            val fovV = Math.toDegrees(2.0 * atan((size.height / (2f * focal)).toDouble()))
            result.put("horizontalDeg", fovH)
            result.put("verticalDeg", fovV)
            result.put("source", "android-camera2")
            call.resolve(result)
        } catch (e: Exception) {
            result.put("horizontalDeg", JSObject.NULL)
            result.put("verticalDeg", JSObject.NULL)
            result.put("source", "unavailable")
            call.resolve(result)
        }
    }

    // Depth capability via ARCore availability. A precise depth-mode check needs a
    // Session (Config.DepthMode.AUTOMATIC) which requires camera permission; this
    // reports "arcore" when ARCore is installed/supported, "none" otherwise.
    @PluginMethod
    fun isDepthSupported(call: PluginCall) {
        val result = JSObject()
        try {
            val cls = Class.forName("com.google.ar.core.ArCoreApk")
            val instance = cls.getMethod("getInstance").invoke(null)
            val availability = cls.getMethod("checkAvailability", Context::class.java).invoke(instance, context)
            val name = availability?.toString() ?: ""
            val supported = name.contains("SUPPORTED")
            result.put("supported", supported)
            result.put("sensor", if (supported) "arcore" else "none")
        } catch (e: Throwable) {
            result.put("supported", false)
            result.put("sensor", "none")
        }
        call.resolve(result)
    }

    // Guided ARCore depth scan → flat [x,y,z,…] world cloud (metres).
    //
    // NOT YET IMPLEMENTED. ARCore's Depth API needs a live GL render loop: a
    // GLSurfaceView with the camera background texture bound, calling
    // session.update() each frame, then frame.acquireDepthImage16Bits() and
    // unprojecting each depth texel with frame.camera intrinsics + pose into world
    // space (same math as the iOS scanner). That requires a dedicated capture
    // Activity/Surface, which a headless plugin method lacks — so this rejects for
    // now and the JS bridge falls back to "Beta unavailable" on Android.
    @PluginMethod
    fun scanFootDepth(call: PluginCall) {
        call.reject("ARCore depth capture is not implemented yet (needs the GL capture activity).")
    }

    // Suppress unused warning for the helper kept for the future GL path.
    @Suppress("unused")
    private fun longestEdge(w: Int, h: Int): Int = max(w, h)
}
