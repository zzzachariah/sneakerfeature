import UIKit
import Capacitor

/// Owns a single native floating action button pinned to the bottom-right of the
/// Capacitor view controller (the home feed's speed-dial trigger). The button is
/// hosted inside a UIVisualEffectView so iOS owns the material: built against the
/// iOS 26 SDK it renders Apple Liquid Glass, and on earlier iOS it falls back to a
/// system material blur. The web layer drives everything — it decides when the
/// FAB is visible, supplies the glyph + accessibility label, and (on tap) presents
/// the expanded actions via the existing presentMenu action sheet. A single tap
/// fires `onTap`; this controller intentionally holds NO speed-dial state.
///
/// Layout note (why a wrapper view): a UIVisualEffectView renders its blur/glass
/// in a private layer that is NOT masked by contentView's cornerRadius, so to get
/// a CIRCULAR glass pill we clip the effect view itself (clipsToBounds + corner
/// radius). Clipping kills the layer shadow, so the drop shadow lives on a
/// separate, non-clipping wrapper view that hosts the (inset-to-fill) glass view.
final class NativeFabController: NSObject {
    private weak var host: UIViewController?
    private let shadowWrapper = UIView()
    private let glass = UIVisualEffectView()
    private let button = UIButton(type: .system)
    private var attached = false

    /// The web FAB sits at `--mobile-nav-h + 20px`; the native tab bar is a
    /// UITabBar (~49pt content above the home-indicator safe inset), so we anchor
    /// to the safe-area bottom and lift by the tab-bar height + a gap to clear it.
    private let tabBarClearance: CGFloat = 49
    private let bottomGap: CGFloat = 20
    private let diameter: CGFloat = 52

    var onTap: (() -> Void)?

    init(host: UIViewController) {
        self.host = host
        super.init()
        attach()
    }

    private func attach() {
        guard let view = host?.view, !attached else { return }

        // ── Shadow wrapper: no clipping, carries the soft drop shadow. ──
        shadowWrapper.translatesAutoresizingMaskIntoConstraints = false
        shadowWrapper.backgroundColor = .clear
        shadowWrapper.clipsToBounds = false
        shadowWrapper.layer.shadowColor = UIColor.black.cgColor
        shadowWrapper.layer.shadowOpacity = 0.22
        shadowWrapper.layer.shadowRadius = 16
        shadowWrapper.layer.shadowOffset = CGSize(width: 0, height: 8)

        // ── Glass pill: system-owned material, clipped to a circle. ──
        if #available(iOS 26.0, *) {
            glass.effect = UIGlassEffect()
        } else {
            glass.effect = UIBlurEffect(style: .systemMaterial)
        }
        glass.translatesAutoresizingMaskIntoConstraints = false
        glass.clipsToBounds = true
        glass.layer.cornerRadius = diameter / 2
        glass.layer.cornerCurve = .continuous

        // ── The icon button fills the glass content view. ──
        button.translatesAutoresizingMaskIntoConstraints = false
        button.tintColor = .label
        let config = UIImage.SymbolConfiguration(pointSize: 20, weight: .medium)
        button.setImage(UIImage(systemName: "slider.horizontal.3", withConfiguration: config), for: .normal)
        button.addTarget(self, action: #selector(tapped), for: .touchUpInside)
        button.accessibilityLabel = "Feed controls"

        glass.contentView.addSubview(button)
        shadowWrapper.addSubview(glass)
        view.addSubview(shadowWrapper)

        NSLayoutConstraint.activate([
            shadowWrapper.widthAnchor.constraint(equalToConstant: diameter),
            shadowWrapper.heightAnchor.constraint(equalToConstant: diameter),
            shadowWrapper.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            shadowWrapper.bottomAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.bottomAnchor,
                constant: -(tabBarClearance + bottomGap)
            ),

            glass.leadingAnchor.constraint(equalTo: shadowWrapper.leadingAnchor),
            glass.trailingAnchor.constraint(equalTo: shadowWrapper.trailingAnchor),
            glass.topAnchor.constraint(equalTo: shadowWrapper.topAnchor),
            glass.bottomAnchor.constraint(equalTo: shadowWrapper.bottomAnchor),

            button.leadingAnchor.constraint(equalTo: glass.contentView.leadingAnchor),
            button.trailingAnchor.constraint(equalTo: glass.contentView.trailingAnchor),
            button.topAnchor.constraint(equalTo: glass.contentView.topAnchor),
            button.bottomAnchor.constraint(equalTo: glass.contentView.bottomAnchor)
        ])

        shadowWrapper.isHidden = true
        attached = true
        view.bringSubviewToFront(shadowWrapper)
    }

    /// Configure the FAB's glyph + accessibility label. Called once (or whenever
    /// the locale changes) before the FAB is shown. Keeps Swift free of any copy.
    func configure(symbol: String?, label: String?) {
        let name = (symbol?.isEmpty == false ? symbol! : "slider.horizontal.3")
        let config = UIImage.SymbolConfiguration(pointSize: 20, weight: .medium)
        button.setImage(UIImage(systemName: name, withConfiguration: config), for: .normal)
        if let label = label, !label.isEmpty { button.accessibilityLabel = label }
        host?.view.bringSubviewToFront(shadowWrapper)
    }

    func setVisible(_ visible: Bool) {
        shadowWrapper.isHidden = !visible
        // The tab bar re-fronts itself on reconfigure; re-front the FAB so it is
        // never buried behind it while visible.
        if visible { host?.view.bringSubviewToFront(shadowWrapper) }
    }

    @objc private func tapped() {
        onTap?()
    }
}
