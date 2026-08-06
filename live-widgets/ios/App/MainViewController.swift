import UIKit
import Capacitor

// Registers LiveWidgetsPlugin with the Capacitor bridge.
//
// This file exists because of a wrong assumption in the original design. I had
// expected Capacitor to discover a CAPBridgedPlugin sitting in the app target
// the way older versions scanned the Objective-C runtime. It does not — read
// CapacitorBridge.registerPlugins(): the only plugins it registers are its own
// built-ins plus the class names listed under `packageClassList` in
// capacitor.config.json, which `cap sync` generates from *npm packages*. A
// plugin defined in the app itself is compiled, linked, and never registered,
// so every call from JS rejects with "not implemented" — which the web layer
// treats as "this device has no widgets" and silently turns the whole feature
// off. Compiles clean, runs clean, does nothing.
//
// capacitorDidLoad() is Capacitor's own hook for exactly this: it runs after
// the bridge exists and before the web view loads, so the plugin is registered
// before any JS can call it.
//
// TARGET MEMBERSHIP: App only.
//
// ⚠️ Adding this file is not enough on its own — Main.storyboard still points
// at CAPBridgeViewController. Set the view controller's Custom Class to
// MainViewController (see live-widgets/README.md §3b), or none of this runs.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // registerPluginInstance, not registerPluginType: the latter is a no-op
        // whenever autoRegisterPlugins is on, which it is by default.
        bridge?.registerPluginInstance(LiveWidgetsPlugin())
    }
}
