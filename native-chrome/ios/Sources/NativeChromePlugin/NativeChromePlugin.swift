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
        CAPPluginMethod(name: "setVisible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureNavBar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNavBarVisible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureSearch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSearchVisible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSearchText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPullToRefreshEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentMenu", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "confirm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureFab", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setFabVisible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureBack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBackVisible", returnType: CAPPluginReturnPromise)
    ]

    private var controller: NativeTabBarController?
    private var navBar: NativeNavBarController?
    private var fab: NativeFabController?
    private var back: NativeBackController?
    private var refreshControl: UIRefreshControl?

    // Enable the WKWebView's own interactive edge-swipe to go back/forward
    // through the (Next.js) history — iOS doesn't turn this on by default for an
    // embedded web view, so without it there's no swipe-from-edge-to-go-back.
    override public func load() {
        DispatchQueue.main.async {
            self.bridge?.webView?.allowsBackForwardNavigationGestures = true
        }
    }

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

    // MARK: Top navigation bar

    private func ensureNavBar() -> NativeNavBarController? {
        if navBar == nil, let host = self.bridge?.viewController {
            let bar = NativeNavBarController(host: host)
            bar.onAction = { [weak self] key in
                self?.notifyListeners("navAction", data: ["key": key])
            }
            navBar = bar
        }
        return navBar
    }

    @objc func configureNavBar(_ call: CAPPluginCall) {
        let title = call.getString("title")
        let logoURL = call.getString("logoUrl")
        let buttons: [JSObject] = (call.getArray("buttons") ?? []).compactMap { $0 as? JSObject }
        DispatchQueue.main.async {
            self.ensureNavBar()?.configure(title: title, logoURL: logoURL, buttons: buttons)
            call.resolve()
        }
    }

    @objc func setNavBarVisible(_ call: CAPPluginCall) {
        let visible = call.getBool("visible") ?? true
        DispatchQueue.main.async {
            self.ensureNavBar()?.setVisible(visible)
            call.resolve()
        }
    }

    // MARK: Search bar (under the nav bar; live-filters the web list)

    @objc func configureSearch(_ call: CAPPluginCall) {
        let placeholder = call.getString("placeholder")
        DispatchQueue.main.async {
            let bar = self.ensureNavBar()
            bar?.onSearch = { [weak self] text, submit in
                self?.notifyListeners("searchChanged", data: ["text": text, "submit": submit])
            }
            bar?.configureSearch(placeholder: placeholder)
            call.resolve()
        }
    }

    @objc func setSearchVisible(_ call: CAPPluginCall) {
        let visible = call.getBool("visible") ?? true
        DispatchQueue.main.async {
            self.ensureNavBar()?.setSearchVisible(visible)
            call.resolve()
        }
    }

    @objc func setSearchText(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        DispatchQueue.main.async {
            self.ensureNavBar()?.setSearchText(text)
            call.resolve()
        }
    }

    // MARK: Floating action button (home feed speed-dial trigger)

    private func ensureFab() -> NativeFabController? {
        if fab == nil, let host = self.bridge?.viewController {
            let f = NativeFabController(host: host)
            f.onTap = { [weak self] in
                self?.notifyListeners("fabTap", data: nil)
            }
            fab = f
        }
        return fab
    }

    @objc func configureFab(_ call: CAPPluginCall) {
        let symbol = call.getString("symbol")
        let label = call.getString("label")
        DispatchQueue.main.async {
            self.ensureFab()?.configure(symbol: symbol, label: label)
            call.resolve()
        }
    }

    @objc func setFabVisible(_ call: CAPPluginCall) {
        let visible = call.getBool("visible") ?? true
        DispatchQueue.main.async {
            self.ensureFab()?.setVisible(visible)
            call.resolve()
        }
    }

    // MARK: Floating back button (shoe-detail page, top-left)

    private func ensureBack() -> NativeBackController? {
        if back == nil, let host = self.bridge?.viewController {
            let b = NativeBackController(host: host)
            b.onTap = { [weak self] in
                self?.notifyListeners("backTap", data: nil)
            }
            back = b
        }
        return back
    }

    @objc func configureBack(_ call: CAPPluginCall) {
        let symbol = call.getString("symbol")
        let label = call.getString("label")
        DispatchQueue.main.async {
            self.ensureBack()?.configure(symbol: symbol, label: label)
            call.resolve()
        }
    }

    @objc func setBackVisible(_ call: CAPPluginCall) {
        let visible = call.getBool("visible") ?? true
        DispatchQueue.main.async {
            self.ensureBack()?.setVisible(visible)
            call.resolve()
        }
    }

    // MARK: Pull-to-refresh (UIRefreshControl on the web scroll view)

    @objc func setPullToRefreshEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? true
        DispatchQueue.main.async {
            self.setPullToRefresh(enabled)
            call.resolve()
        }
    }

    private func setPullToRefresh(_ enabled: Bool) {
        guard let scrollView = bridge?.webView?.scrollView else { return }
        if enabled {
            guard refreshControl == nil else { return }
            let rc = UIRefreshControl()
            rc.addTarget(self, action: #selector(handlePullRefresh(_:)), for: .valueChanged)
            scrollView.refreshControl = rc
            // Let the web view rubber-band at the top even when content is short,
            // so the pull is always available.
            scrollView.alwaysBounceVertical = true
            refreshControl = rc
        } else {
            refreshControl?.endRefreshing()
            if scrollView.refreshControl === refreshControl {
                scrollView.refreshControl = nil
            }
            refreshControl = nil
        }
    }

    @objc private func handlePullRefresh(_ sender: UIRefreshControl) {
        // Hand the refresh to the web (router.refresh()); we don't get a signal
        // back, so end the spinner after a short beat — long enough to read as a
        // real refresh, short enough to never feel stuck.
        notifyListeners("pullRefresh", data: nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            sender.endRefreshing()
        }
    }

    // MARK: Native menus / confirms (presentable from any web trigger)

    @objc func presentMenu(_ call: CAPPluginCall) {
        let title = call.getString("title")
        let message = call.getString("message")
        let cancelLabel = call.getString("cancelLabel") ?? "Cancel"
        let items: [JSObject] = (call.getArray("items") ?? []).compactMap { $0 as? JSObject }
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else {
                call.resolve(["key": NSNull()])
                return
            }
            let sheet = UIAlertController(title: title, message: message, preferredStyle: .actionSheet)
            for item in items {
                guard let key = item["key"] as? String else { continue }
                let label = (item["label"] as? String) ?? key
                let destructive = (item["destructive"] as? Bool) ?? false
                sheet.addAction(UIAlertAction(title: label, style: destructive ? .destructive : .default) { _ in
                    call.resolve(["key": key])
                })
            }
            sheet.addAction(UIAlertAction(title: cancelLabel, style: .cancel) { _ in
                call.resolve(["key": NSNull()])
            })
            if let popover = sheet.popoverPresentationController {
                popover.sourceView = vc.view
                popover.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY, width: 0, height: 0)
                popover.permittedArrowDirections = []
            }
            vc.present(sheet, animated: true)
        }
    }

    @objc func confirm(_ call: CAPPluginCall) {
        let title = call.getString("title")
        let message = call.getString("message")
        let okLabel = call.getString("okLabel") ?? "OK"
        let cancelLabel = call.getString("cancelLabel") ?? "Cancel"
        let destructive = call.getBool("destructive") ?? false
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else {
                call.resolve(["confirmed": false])
                return
            }
            let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: cancelLabel, style: .cancel) { _ in
                call.resolve(["confirmed": false])
            })
            alert.addAction(UIAlertAction(title: okLabel, style: destructive ? .destructive : .default) { _ in
                call.resolve(["confirmed": true])
            })
            vc.present(alert, animated: true)
        }
    }
}
