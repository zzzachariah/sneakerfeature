import Foundation
import ARKit

// ARKit LiDAR depth capture → a downsampled world point cloud.
//
// ⚠️ UNVERIFIED: written without an iOS device/toolchain. The unprojection math
// and ARKit coordinate conventions MUST be checked on a real LiDAR device before
// trusting the output (see lib/foot-scan/HIGH-PRECISION.md). The TypeScript
// measurement core (lib/foot-scan/depth.ts) that consumes this cloud IS tested.
//
// Strategy: run a short scene-depth session, unproject each depth pixel of every
// frame into world space, accumulate into a voxel grid (dedupe + cap size), and
// return a flat [x,y,z,…] array in metres after ~`durationSec`.
@available(iOS 14.0, *)
final class FootScanDepthScanner: NSObject, ARSessionDelegate {
  private let session = ARSession()
  private var voxels: [Int64: simd_float3] = [:]
  private let voxelSize: Float = 0.004 // 4 mm grid
  private let maxPoints = 60000
  private var completion: (([Float]) -> Void)?
  private var stopAt: Date = .distantFuture

  // Capture for `durationSec`, then resolve a flat [x,y,z,…] cloud (metres).
  func scan(durationSec: TimeInterval, completion: @escaping ([Float]) -> Void) {
    self.completion = completion
    voxels.removeAll()
    let config = ARWorldTrackingConfiguration()
    if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
      config.frameSemantics.insert(.sceneDepth)
    }
    session.delegate = self
    session.run(config, options: [.resetTracking, .removeExistingAnchors])
    stopAt = Date().addingTimeInterval(durationSec)
  }

  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    if Date() >= stopAt {
      finish()
      return
    }
    guard let depth = frame.sceneDepth?.depthMap, voxels.count < maxPoints else { return }
    accumulate(depthMap: depth, camera: frame.camera)
  }

  private func accumulate(depthMap: CVPixelBuffer, camera: ARCamera) {
    CVPixelBufferLockBaseAddress(depthMap, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(depthMap, .readOnly) }
    let w = CVPixelBufferGetWidth(depthMap)
    let h = CVPixelBufferGetHeight(depthMap)
    guard let base = CVPixelBufferGetBaseAddress(depthMap) else { return }
    let rowBytes = CVPixelBufferGetBytesPerRow(depthMap)

    // Intrinsics are for the full image; scale to the depth-map resolution.
    let intr = camera.intrinsics
    let refSize = camera.imageResolution
    let sx = Float(w) / Float(refSize.width)
    let sy = Float(h) / Float(refSize.height)
    let fx = intr[0][0] * sx
    let fy = intr[1][1] * sy
    let cx = intr[2][0] * sx
    let cy = intr[2][1] * sy
    let transform = camera.transform

    // Subsample the depth map for speed (~every 3rd pixel).
    let step = 3
    var y = 0
    while y < h {
      let row = base.advanced(by: y * rowBytes).assumingMemoryBound(to: Float32.self)
      var x = 0
      while x < w {
        let d = row[x]
        if d > 0.1 && d < 1.2 { // 10 cm – 1.2 m: foot is close
          // Pixel → camera space (ARKit camera looks down -Z, image y is down).
          let px = (Float(x) - cx) / fx * d
          let py = (Float(y) - cy) / fy * d
          let camPoint = simd_float4(px, -py, -d, 1)
          let world = transform * camPoint
          addVoxel(simd_float3(world.x, world.y, world.z))
        }
        x += step
      }
      y += step
    }
  }

  private func addVoxel(_ p: simd_float3) {
    if voxels.count >= maxPoints { return }
    let key = voxelKey(p)
    if voxels[key] == nil { voxels[key] = p }
  }

  private func voxelKey(_ p: simd_float3) -> Int64 {
    let ix = Int64((p.x / voxelSize).rounded())
    let iy = Int64((p.y / voxelSize).rounded())
    let iz = Int64((p.z / voxelSize).rounded())
    // Pack three ~21-bit ints into one key.
    return (ix & 0x1FFFFF) | ((iy & 0x1FFFFF) << 21) | ((iz & 0x1FFFFF) << 42)
  }

  private func finish() {
    session.pause()
    session.delegate = nil
    guard let done = completion else { return }
    completion = nil
    stopAt = .distantFuture
    var flat: [Float] = []
    flat.reserveCapacity(voxels.count * 3)
    for (_, p) in voxels {
      flat.append(p.x)
      flat.append(p.y)
      flat.append(p.z)
    }
    DispatchQueue.main.async { done(flat) }
  }
}
