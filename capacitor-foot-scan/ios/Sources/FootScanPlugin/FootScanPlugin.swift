import Foundation
import Capacitor
import AVFoundation
import ARKit

// Native Foot Scan plugin (iOS).
//
// ⚠️ UNVERIFIED: this was written without an iOS toolchain/device available in
// the dev environment. It compiles against the documented Capacitor 6+/ARKit
// APIs, but MUST be built in Xcode and checked on a real device before trusting
// it (see lib/foot-scan/HIGH-PRECISION.md → "device checklist").
//
// JS name is "FootScanNative" (see lib/native/foot-scan-native.ts).
@objc(FootScanPlugin)
public class FootScanPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "FootScanPlugin"
  public let jsName = "FootScanNative"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "getCameraFieldOfView", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "isDepthSupported", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "scanFootDepth", returnType: CAPPluginReturnPromise)
  ]

  private var scanner: Any?

  // Horizontal field of view of the back wide-angle camera, in degrees.
  // Feeds the exact homography de-tilt (Channel A).
  @objc func getCameraFieldOfView(_ call: CAPPluginCall) {
    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
      call.resolve(["horizontalDeg": NSNull(), "verticalDeg": NSNull(), "source": "unavailable"])
      return
    }
    let h = Double(device.activeFormat.videoFieldOfView) // horizontal FOV, degrees
    call.resolve([
      "horizontalDeg": h > 0 ? h : NSNull(),
      "verticalDeg": NSNull(),
      "source": "ios-avcapture"
    ])
  }

  // Whether the device can do depth scanning (Channel B / Beta). LiDAR is exposed
  // via ARKit scene reconstruction; everything else reports unsupported for now.
  @objc func isDepthSupported(_ call: CAPPluginCall) {
    if #available(iOS 13.4, *), ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
      call.resolve(["supported": true, "sensor": "lidar"])
      return
    }
    call.resolve(["supported": false, "sensor": "none"])
  }

  // Run a short LiDAR depth scan and return a flat [x,y,z,…] world cloud (metres)
  // for lib/foot-scan/depth.ts to measure. UNVERIFIED — see the scanner file.
  @objc func scanFootDepth(_ call: CAPPluginCall) {
    guard #available(iOS 14.0, *),
          ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) else {
      call.reject("Depth scanning is not supported on this device.")
      return
    }
    DispatchQueue.main.async {
      let s = FootScanDepthScanner()
      self.scanner = s // retain during the scan
      s.scan(durationSec: 4.0) { [weak self] flat in
        self?.scanner = nil
        call.resolve(["points": flat, "unit": "m"])
      }
    }
  }
}
