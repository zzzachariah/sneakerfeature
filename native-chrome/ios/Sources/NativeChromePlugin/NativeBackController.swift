import UIKit
import Capacitor

/// Owns a single native floating back button pinned to the top-LEFT of the
/// Capacitor view controller (the shoe-detail page's "go back" affordance, just
/// under the native nav bar's logo). Structurally identical to NativeFabController
/// — the button is hosted inside a UIVisualEffectView so iOS owns the material:
/// built against the iOS 26 SDK it renders Apple Liquid Glass, and on earlier iOS
/// it falls back to a system material blur. The web layer drives everything: it
/// decides when the button is visible (per route), supplies the glyph +
/// accessibility label, and on tap navigates back. A single tap fires `onTap`.
///
/// Layout note (why a wrapper view): a UIVisualEffectView renders its blur/glass
/// in a private layer that is NOT masked by contentView's cornerRadius, so to get
/// a CIRCULAR glass pill we clip the effect view itself (clipsToBounds + corner
/// radius). Clipping kills the layer shadow, so the drop shadow lives on a
/// separate, non-clipping wrapper view that hosts the (inset-to-fill) glass view.
final class NativeBackController: NSObject {
    private weak var host: UIViewController?
    private let shadowWrapper = UIView()
    private let glass = UIVisualEffectView()
    private let button = UIButton(type: .system)
    private var attached = false

    /// The web pill sits just under the top bar; the native nav bar is a
    /// UINavigationBar (~44pt content above the safe-area top inset), so we anchor
    /// to the safe-area top and drop by the nav-bar height + a gap to clear it —
    /// the mirror image of the FAB's bottom anchoring.
    private let navBarClearance: CGFloat = 44
    private let topGap: CGFloat = 8
    private let diameter: CGFloat = 40

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
        shadowWrapper.layer.shadowOpacity = 0.18
        shadowWrapper.layer.shadowRadius = 12
        shadowWrapper.layer.shadowOffset = CGSize(width: 0, height: 6)

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

        // ── The chevron button fills the glass content view. ──
        button.translatesAutoresizingMaskIntoConstraints = false
        button.tintColor = .label
        let config = UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)
        button.setImage(UIImage(systemName: "chevron.left", withConfiguration: config), for: .normal)
        button.addTarget(self, action: #selector(tapped), for: .touchUpInside)
        button.accessibilityLabel = "Back"

        glass.contentView.addSubview(button)
        shadowWrapper.addSubview(glass)
        view.addSubview(shadowWrapper)

        NSLayoutConstraint.activate([
            shadowWrapper.widthAnchor.constraint(equalToConstant: diameter),
            shadowWrapper.heightAnchor.constraint(equalToConstant: diameter),
            shadowWrapper.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            shadowWrapper.topAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.topAnchor,
                constant: navBarClearance + topGap
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

    /// Configure the button's glyph + accessibility label. Called before the
    /// button is shown (and again on locale change). Keeps Swift free of any copy.
    func configure(symbol: String?, label: String?) {
        let name = (symbol?.isEmpty == false ? symbol! : "chevron.left")
        let config = UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)
        button.setImage(UIImage(systemName: name, withConfiguration: config), for: .normal)
        if let label = label, !label.isEmpty { button.accessibilityLabel = label }
        host?.view.bringSubviewToFront(shadowWrapper)
    }

    func setVisible(_ visible: Bool) {
        shadowWrapper.isHidden = !visible
        // The nav bar re-fronts itself on reconfigure; re-front the button so it is
        // never buried behind it while visible.
        if visible { host?.view.bringSubviewToFront(shadowWrapper) }
    }

    @objc private func tapped() {
        onTap?()
    }
}
