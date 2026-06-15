import UIKit

/// Owns a single UITabBar pinned to the bottom of the Capacitor view controller,
/// floating above the web view. UITabBar already paints a translucent system
/// background; built against the iOS 26 SDK it becomes Apple's Liquid Glass with
/// real refraction for free, with no custom shader. Tab definitions are pushed
/// from JS so the web app stays the single source of truth.
final class NativeTabBarController: NSObject, UITabBarDelegate {
    private weak var host: UIViewController?
    private let tabBar = UITabBar()
    private var keys: [String] = []

    /// Fired with the tab `key` when the user taps a tab.
    var onSelect: ((String) -> Void)?

    init(host: UIViewController) {
        self.host = host
        super.init()
        attach()
    }

    private func attach() {
        guard let view = host?.view else { return }
        tabBar.delegate = self
        tabBar.translatesAutoresizingMaskIntoConstraints = false
        // Let the system own the material so iOS 26 can swap in Liquid Glass.
        tabBar.isTranslucent = true
        view.addSubview(tabBar)
        NSLayoutConstraint.activate([
            tabBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabBar.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    /// `tabs` is an array of { key, label, symbol } pushed from JS.
    func configure(tabs: [[String: String]], active: String?) {
        keys = tabs.compactMap { $0["key"] }
        var items: [UITabBarItem] = []
        for (index, tab) in tabs.enumerated() {
            let label = tab["label"]
            let symbol = tab["symbol"] ?? "circle"
            let image = UIImage(systemName: symbol)
            items.append(UITabBarItem(title: label, image: image, tag: index))
        }
        tabBar.setItems(items, animated: false)
        setActive(active)
    }

    func setActive(_ key: String?) {
        guard let key = key, let index = keys.firstIndex(of: key),
              let items = tabBar.items, index < items.count else {
            tabBar.selectedItem = nil
            return
        }
        tabBar.selectedItem = items[index]
    }

    func setVisible(_ visible: Bool) {
        tabBar.isHidden = !visible
    }

    // MARK: UITabBarDelegate

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        let index = item.tag
        guard index >= 0, index < keys.count else { return }
        onSelect?(keys[index])
    }
}
