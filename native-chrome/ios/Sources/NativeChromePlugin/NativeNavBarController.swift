import UIKit
import Capacitor

/// Owns a native UINavigationBar pinned to the top of the Capacitor view
/// controller. Built against the iOS 26 SDK it renders as Liquid Glass, with
/// native UIMenu pull-down menus (also Liquid Glass) on its bar buttons. The web
/// app pushes the title + buttons + (recursive) menu tree, so the web stays the
/// single source of truth; leaf taps fire `onAction(key)`.
final class NativeNavBarController: NSObject {
    private weak var host: UIViewController?
    private let navBar = UINavigationBar()
    private let navItem = UINavigationItem()
    private var cachedLogo: UIImage?
    private let searchBar = UISearchBar()
    private var searchAttached = false

    var onAction: ((String) -> Void)?
    var onSearch: ((String) -> Void)?

    init(host: UIViewController) {
        self.host = host
        super.init()
        attach()
    }

    private func attach() {
        guard let view = host?.view else { return }
        navBar.translatesAutoresizingMaskIntoConstraints = false
        navBar.items = [navItem]
        view.addSubview(navBar)
        NSLayoutConstraint.activate([
            navBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            navBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            navBar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor)
        ])
        view.bringSubviewToFront(navBar)
    }

    func configure(title: String?, logoURL: String?, buttons: [JSObject]) {
        // Leading: the brand logo (tinted to the label colour so it inverts in
        // dark mode like the web). Falls back to a text wordmark until/unless the
        // image is available.
        if let cachedLogo = cachedLogo {
            setLeadingLogo(cachedLogo)
        } else if let logoURL = logoURL, let url = URL(string: logoURL) {
            setLeadingTitle(title)
            loadLogo(url)
        } else {
            setLeadingTitle(title)
        }

        var rightItems: [UIBarButtonItem] = []
        for button in buttons {
            guard let key = button["key"] as? String else { continue }
            let symbol = (button["symbol"] as? String) ?? "ellipsis"
            let image = UIImage(systemName: symbol)
            let menuNodes = objects(button["menu"])
            if menuNodes.isEmpty {
                let item = UIBarButtonItem(image: image, primaryAction: UIAction { [weak self] _ in self?.onAction?(key) })
                rightItems.append(item)
            } else {
                let item = UIBarButtonItem(image: image, menu: buildMenu(from: menuNodes))
                rightItems.append(item)
            }
        }
        // rightBarButtonItems lay out right-to-left, so reverse to keep the JS
        // array order reading left-to-right across the right cluster.
        navItem.rightBarButtonItems = rightItems.reversed()

        navBar.isHidden = false
        host?.view.bringSubviewToFront(navBar)
    }

    func setVisible(_ visible: Bool) {
        navBar.isHidden = !visible
    }

    // MARK: Search bar (pinned directly under the nav bar)

    func configureSearch(placeholder: String?) {
        guard let view = host?.view else { return }
        if !searchAttached {
            searchBar.translatesAutoresizingMaskIntoConstraints = false
            searchBar.delegate = self
            // Let the system own the background so iOS 26 can apply Liquid Glass.
            searchBar.isTranslucent = true
            view.addSubview(searchBar)
            NSLayoutConstraint.activate([
                searchBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                searchBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                searchBar.topAnchor.constraint(equalTo: navBar.bottomAnchor)
            ])
            searchAttached = true
        }
        searchBar.placeholder = placeholder
        view.bringSubviewToFront(searchBar)
    }

    func setSearchVisible(_ visible: Bool) {
        searchBar.isHidden = !visible
        if !visible { searchBar.resignFirstResponder() }
        else { host?.view.bringSubviewToFront(searchBar) }
    }

    @objc private func homeTapped() {
        onAction?("home")
    }

    private func setLeadingTitle(_ title: String?) {
        guard let title = title, !title.isEmpty else {
            navItem.leftBarButtonItem = nil
            return
        }
        let item = UIBarButtonItem(title: title, style: .plain, target: self, action: #selector(homeTapped))
        item.setTitleTextAttributes([.font: UIFont.systemFont(ofSize: 18, weight: .bold)], for: .normal)
        navItem.leftBarButtonItem = item
    }

    private func setLeadingLogo(_ image: UIImage) {
        let height: CGFloat = 26
        let ratio = image.size.height > 0 ? image.size.width / image.size.height : 1
        let imageView = UIImageView(image: image.withRenderingMode(.alwaysTemplate))
        imageView.contentMode = .scaleAspectFit
        imageView.tintColor = .label
        imageView.frame = CGRect(x: 0, y: 0, width: height * ratio, height: height)
        imageView.isUserInteractionEnabled = true
        imageView.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(homeTapped)))
        navItem.leftBarButtonItem = UIBarButtonItem(customView: imageView)
    }

    private func loadLogo(_ url: URL) {
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self = self, let data = data, let image = UIImage(data: data) else { return }
            DispatchQueue.main.async {
                self.cachedLogo = image
                self.setLeadingLogo(image)
            }
        }.resume()
    }

    private func buildMenu(from nodes: [JSObject]) -> UIMenu {
        var elements: [UIMenuElement] = []
        for node in nodes {
            let label = (node["label"] as? String) ?? ""
            let symbol = node["symbol"] as? String
            let image = symbol.flatMap { UIImage(systemName: $0) }
            let children = objects(node["children"])
            if !children.isEmpty {
                elements.append(UIMenu(title: label, image: image, children: buildMenu(from: children).children))
            } else {
                let key = (node["key"] as? String) ?? ""
                let checked = (node["checked"] as? Bool) ?? false
                let destructive = (node["destructive"] as? Bool) ?? false
                let action = UIAction(
                    title: label,
                    image: image,
                    attributes: destructive ? .destructive : [],
                    state: checked ? .on : .off
                ) { [weak self] _ in self?.onAction?(key) }
                elements.append(action)
            }
        }
        return UIMenu(title: "", children: elements)
    }

    /// Coerce a bridged JS value into an array of objects (handles JSArray).
    private func objects(_ value: JSValue?) -> [JSObject] {
        guard let array = value as? JSArray else { return [] }
        return array.compactMap { $0 as? JSObject }
    }
}

extension NativeNavBarController: UISearchBarDelegate {
    func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
        onSearch?(searchText)
    }

    func searchBarSearchButtonClicked(_ searchBar: UISearchBar) {
        searchBar.resignFirstResponder()
        onSearch?(searchBar.text ?? "")
    }

    func searchBarCancelButtonClicked(_ searchBar: UISearchBar) {
        searchBar.text = ""
        searchBar.resignFirstResponder()
        onSearch?("")
    }
}
