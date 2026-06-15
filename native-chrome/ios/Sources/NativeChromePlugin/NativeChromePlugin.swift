import Foundation
import Capacitor

/// Capacitor bridge for the native iOS chrome. Phase 1 exposes a native glass
/// tab bar (UITabBar — automatically rendered as Liquid Glass when built with
/// the iOS 26 SDK, and as a system material blur on earlier iOS). The web app
/// drives it entirely (tabs / labels / icons / active state come from JS), so
/// adding or relabeling a tab never needs a Swift change.
@objc(NativeChromePlugin)
public class NativeChromePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeChromePlugin"
    public let jsName = "NativeChrome"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configureTabBar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setActiveTab", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVisible", returnType: CAPPluginReturnPromise)
    ]

    private var controller: NativeTabBarController?

    private func ensureController() -> NativeTabBarController? {
        if controller == nil, let host = self.bridge?.viewController {
            let c = NativeTabBarController(host: host)
            c.onSelect = { [weak self] key in
                self?.notifyListeners("tabSelected", data: ["key": key])
            }
            controller = c
        }
        return controller
    }

    @objc func configureTabBar(_ call: CAPPluginCall) {
        let raw = call.getArray("tabs") ?? []
        let tabs: [[String: String]] = raw.compactMap { entry in
            guard let obj = entry as? JSObject else { return nil }
            var dict: [String: String] = [:]
            if let key = obj["key"] as? String { dict["key"] = key }
            if let label = obj["label"] as? String { dict["label"] = label }
            if let symbol = obj["symbol"] as? String { dict["symbol"] = symbol }
            return dict
        }
        let active = call.getString("active")
        DispatchQueue.main.async {
            self.ensureController()?.configure(tabs: tabs, active: active)
            call.resolve()
        }
    }

    @objc func setActiveTab(_ call: CAPPluginCall) {
        let key = call.getString("key")
        DispatchQueue.main.async {
            self.ensureController()?.setActive(key)
            call.resolve()
        }
    }

    @objc func setVisible(_ call: CAPPluginCall) {
        let visible = call.getBool("visible") ?? true
        DispatchQueue.main.async {
            self.ensureController()?.setVisible(visible)
            call.resolve()
        }
    }
}
