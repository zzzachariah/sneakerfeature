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
    // (text, submit) — submit is true only on the keyboard Search key / Cancel,
    // so the web can filter on submit and only update the draft while typing.
    var onSearch: ((String, Bool) -> Void)?

    init(host: UIViewController) {
        self.host = host
        super.init()
        attach()
    }

    private func attach() {
        guard let view = host?.view else { return }
        navBar.translatesAutoresizingMaskIntoConstraints = false
        navBar.items = [navItem]
        // Tint logo + bar-button glyphs to the label colour (monochrome, adapts
        // to light/dark) instead of the default system blue.
        navBar.tintColor = .label
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
        // Each item in its OWN fixed group so iOS 26 renders them as two separate
        // glass pills. Plain rightBarButtonItems (or a fixedSpace between them)
        // get auto-grouped and collapse into a single "…" overflow on iOS 26.
        // Reversed so the visual order matches the web: account left, hamburger
        // right.
        if #available(iOS 16.0, *) {
            navItem.trailingItemGroups = rightItems.reversed().map { $0.creatingFixedGroup() }
        } else {
            navItem.rightBarButtonItems = rightItems
        }

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
            // `.minimal` + a cleared backgroundImage strips the opaque `.prominent`
            // chrome (an inset bevel that would otherwise hide the glass material),
            // so the system Liquid Glass shows through on iOS 26; pre-26 it's a
            // plain translucent field, which is the acceptable fallback.
            searchBar.isTranslucent = true
            searchBar.searchBarStyle = .minimal
            searchBar.backgroundImage = UIImage()
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

    /// Push text INTO the native field (web → native), e.g. when the web layer
    /// clears the query programmatically. Does not fire onSearch (avoids a loop).
    func setSearchText(_ text: String) {
        searchBar.text = text
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
        // logo.png is a 1024² canvas whose brand mark only fills the middle (~62%
        // wide, ~35% tall) — the rest is transparent padding. Downscaling the whole
        // square (the old behaviour) left a tiny mark adrift in the iOS 26 glass
        // pill. Instead trim to the opaque bounds, then re-center the mark in a
        // fixed 24pt square: it now fills most of the glass circle WITHOUT growing
        // the pill (the bar button is still sized from a 24pt box, exactly as
        // before). Rendered as a template so it tints to the bar's tintColor
        // (label colour, adapts to light/dark).
        let mark = croppedToOpaqueBounds(image)
        let logo = squareLogo(mark, side: 24, inset: 2).withRenderingMode(.alwaysTemplate)
        let item = UIBarButtonItem(image: logo, style: .plain, target: self, action: #selector(homeTapped))
        navItem.leftBarButtonItem = item
    }

    /// Crops `image` to the bounding box of its non-transparent pixels so baked-in
    /// padding doesn't shrink the visible mark. Returns the original image if the
    /// bounds can't be computed.
    private func croppedToOpaqueBounds(_ image: UIImage) -> UIImage {
        guard let cg = image.cgImage,
              let bounds = opaqueBounds(of: cg),
              let cropped = cg.cropping(to: bounds) else { return image }
        return UIImage(cgImage: cropped, scale: image.scale, orientation: image.imageOrientation)
    }

    /// Pixel-space bounding box of `cg`'s pixels whose alpha exceeds `threshold`,
    /// or nil if it's effectively empty. A freshly drawn bitmap context is laid
    /// out top-left first, matching `CGImage.cropping(to:)`, so no flip is needed.
    /// Runs once, when the logo first loads.
    private func opaqueBounds(of cg: CGImage, threshold: UInt8 = 16) -> CGRect? {
        let w = cg.width, h = cg.height
        guard w > 0, h > 0 else { return nil }
        let bytesPerRow = w * 4
        var pixels = [UInt8](repeating: 0, count: h * bytesPerRow)
        guard let ctx = CGContext(
            data: &pixels, width: w, height: h, bitsPerComponent: 8, bytesPerRow: bytesPerRow,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        var minX = w, minY = h, maxX = -1, maxY = -1
        for y in 0..<h {
            let row = y * bytesPerRow
            for x in 0..<w where pixels[row + x * 4 + 3] > threshold {
                if x < minX { minX = x }
                if x > maxX { maxX = x }
                if y < minY { minY = y }
                if y > maxY { maxY = y }
            }
        }
        guard maxX >= minX, maxY >= minY else { return nil }
        return CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
    }

    /// Draws `image` aspect-fit and centered inside a `side`×`side` square with a
    /// uniform `inset`, at screen scale. The square canvas keeps the bar button's
    /// glass pill round and the same size, while the mark inside grows to fill it.
    private func squareLogo(_ image: UIImage, side: CGFloat, inset: CGFloat) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = UIScreen.main.scale
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format)
        return renderer.image { _ in
            let maxBox = max(1, side - inset * 2)
            let s = image.size
            let fit = (s.width > 0 && s.height > 0) ? min(maxBox / s.width, maxBox / s.height) : 1
            let dw = s.width * fit, dh = s.height * fit
            image.draw(in: CGRect(x: (side - dw) / 2, y: (side - dh) / 2, width: dw, height: dh))
        }
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
        // Typing only updates the draft (submit:false) — no live filtering, to
        // match the web search box (which filters on submit, not per keystroke).
        onSearch?(searchText, false)
    }

    func searchBarSearchButtonClicked(_ searchBar: UISearchBar) {
        searchBar.resignFirstResponder()
        onSearch?(searchBar.text ?? "", true)
    }

    func searchBarCancelButtonClicked(_ searchBar: UISearchBar) {
        searchBar.text = ""
        searchBar.resignFirstResponder()
        onSearch?("", true)
    }
}
