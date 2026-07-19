import UIKit
import Capacitor

/// A native options sheet — the Liquid Glass counterpart of the web BottomSheet
/// for rich single-choice lists (e.g. the Smart Picker's AI model selector).
/// Rows (icon + title + subtitle) live inside a UIVisualEffectView whose
/// material is system-owned: built against the iOS 26 SDK it renders Apple
/// Liquid Glass, on earlier iOS it falls back to a system material blur (same
/// pattern as the FAB). A row can carry a checkmark (current choice) or be
/// disabled — grayed out and untappable, with an optional trailing tag (e.g.
/// "Pro") — which is how plan-gated choices stay visible but clearly locked.
@available(iOS 15.0, *)
final class NativeOptionSheetController: UIViewController {
    private let sheetTitle: String?
    private let items: [JSObject]
    private var onDone: ((String?) -> Void)?

    init(title: String?, items: [JSObject], onDone: @escaping (String?) -> Void) {
        self.sheetTitle = title
        self.items = items
        self.onDone = onDone
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .pageSheet
        if let sheet = sheetPresentationController {
            sheet.prefersGrabberVisible = true
            sheet.preferredCornerRadius = 28
            if #available(iOS 16.0, *) {
                let height = estimatedHeight()
                sheet.detents = [.custom { context in min(height, context.maximumDetentValue) }]
            } else {
                sheet.detents = [.medium()]
            }
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    /// Resolve exactly once: a row tap wins; any other dismissal resolves nil.
    private func finish(_ key: String?) {
        guard let done = onDone else { return }
        onDone = nil
        done(key)
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        finish(nil)
    }

    /// Sizes the custom detent before Auto Layout has run: top padding + title +
    /// N rows + bottom slack (kept clear of the home indicator).
    private func estimatedHeight() -> CGFloat {
        let title: CGFloat = (sheetTitle?.isEmpty == false) ? 40 : 0
        return 26 + title + CGFloat(items.count) * 66 + 42
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        // System-owned material fills the whole sheet; the sheet's own corner
        // mask keeps it rounded, and our matching radius keeps the glass edge
        // crisp during the presentation transition.
        let glass = UIVisualEffectView()
        if #available(iOS 26.0, *) {
            glass.effect = UIGlassEffect()
        } else {
            glass.effect = UIBlurEffect(style: .systemMaterial)
        }
        glass.translatesAutoresizingMaskIntoConstraints = false
        glass.clipsToBounds = true
        glass.layer.cornerRadius = 28
        glass.layer.cornerCurve = .continuous
        glass.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
        view.addSubview(glass)

        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 2
        stack.translatesAutoresizingMaskIntoConstraints = false
        glass.contentView.addSubview(stack)

        NSLayoutConstraint.activate([
            glass.topAnchor.constraint(equalTo: view.topAnchor),
            glass.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            glass.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            glass.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.topAnchor.constraint(equalTo: glass.contentView.topAnchor, constant: 26),
            stack.leadingAnchor.constraint(equalTo: glass.contentView.leadingAnchor, constant: 14),
            stack.trailingAnchor.constraint(equalTo: glass.contentView.trailingAnchor, constant: -14)
        ])

        if let title = sheetTitle, !title.isEmpty {
            let label = UILabel()
            label.text = title
            label.font = .preferredFont(forTextStyle: .headline)
            label.textColor = .label
            let wrap = UIView()
            wrap.addSubview(label)
            label.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                label.leadingAnchor.constraint(equalTo: wrap.leadingAnchor, constant: 12),
                label.trailingAnchor.constraint(lessThanOrEqualTo: wrap.trailingAnchor, constant: -12),
                label.topAnchor.constraint(equalTo: wrap.topAnchor),
                label.bottomAnchor.constraint(equalTo: wrap.bottomAnchor, constant: -10)
            ])
            stack.addArrangedSubview(wrap)
        }

        for item in items {
            stack.addArrangedSubview(makeRow(item))
        }
    }

    private func makeRow(_ item: JSObject) -> UIView {
        let key = (item["key"] as? String) ?? ""
        let title = (item["label"] as? String) ?? key
        let subtitle = item["subtitle"] as? String
        let symbol = item["symbol"] as? String
        let checked = (item["checked"] as? Bool) ?? false
        let disabled = (item["disabled"] as? Bool) ?? false
        let tag = item["tag"] as? String

        let row = HighlightRow()
        row.layer.cornerRadius = 16
        row.layer.cornerCurve = .continuous
        row.isEnabled = !disabled
        row.isAccessibilityElement = true
        row.accessibilityLabel = [title, subtitle, tag].compactMap { $0 }.joined(separator: ", ")
        var traits: UIAccessibilityTraits = .button
        if checked { traits.insert(.selected) }
        if disabled { traits.insert(.notEnabled) }
        row.accessibilityTraits = traits
        if !disabled {
            row.addAction(UIAction { [weak self] _ in
                self?.finish(key)
                self?.dismiss(animated: true)
            }, for: .touchUpInside)
        }

        // Leading glyph in a soft rounded square.
        let iconBox = UIView()
        iconBox.backgroundColor = UIColor.label.withAlphaComponent(disabled ? 0.04 : 0.08)
        iconBox.layer.cornerRadius = 10
        iconBox.layer.cornerCurve = .continuous
        let icon = UIImageView()
        if let symbol = symbol, !symbol.isEmpty {
            icon.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 15, weight: .medium))
        }
        icon.tintColor = disabled ? .tertiaryLabel : .label
        icon.contentMode = .scaleAspectFit
        iconBox.addSubview(icon)
        icon.translatesAutoresizingMaskIntoConstraints = false

        let titleLabel = UILabel()
        titleLabel.text = title
        titleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        titleLabel.textColor = disabled ? .tertiaryLabel : .label

        let textStack = UIStackView(arrangedSubviews: [titleLabel])
        textStack.axis = .vertical
        textStack.alignment = .leading
        textStack.spacing = 1
        if let subtitle = subtitle, !subtitle.isEmpty {
            let sub = UILabel()
            sub.text = subtitle
            sub.font = .preferredFont(forTextStyle: .footnote)
            sub.textColor = disabled ? .tertiaryLabel : .secondaryLabel
            textStack.addArrangedSubview(sub)
        }
        // The text column stretches so trailing accessories pin to the edge.
        textStack.setContentHuggingPriority(.defaultLow, for: .horizontal)

        let content = UIStackView(arrangedSubviews: [iconBox, textStack])
        content.axis = .horizontal
        content.alignment = .center
        content.spacing = 12
        // Touches must fall through to the row control, not its subviews.
        content.isUserInteractionEnabled = false

        if checked {
            let check = UIImageView(image: UIImage(
                systemName: "checkmark.circle.fill",
                withConfiguration: UIImage.SymbolConfiguration(pointSize: 18, weight: .semibold)
            ))
            check.tintColor = .label
            content.addArrangedSubview(check)
        } else if disabled {
            let lock = UIImageView(image: UIImage(
                systemName: "lock.fill",
                withConfiguration: UIImage.SymbolConfiguration(pointSize: 12, weight: .semibold)
            ))
            lock.tintColor = .tertiaryLabel
            content.addArrangedSubview(lock)
            if let tag = tag, !tag.isEmpty {
                content.setCustomSpacing(6, after: lock)
                content.addArrangedSubview(makeTagPill(tag))
            }
        }

        row.addSubview(content)
        content.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            iconBox.widthAnchor.constraint(equalToConstant: 36),
            iconBox.heightAnchor.constraint(equalToConstant: 36),
            icon.centerXAnchor.constraint(equalTo: iconBox.centerXAnchor),
            icon.centerYAnchor.constraint(equalTo: iconBox.centerYAnchor),
            content.topAnchor.constraint(equalTo: row.topAnchor, constant: 13),
            content.bottomAnchor.constraint(equalTo: row.bottomAnchor, constant: -13),
            content.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 12),
            content.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -12)
        ])
        return row
    }

    private func makeTagPill(_ text: String) -> UIView {
        let pill = UIView()
        pill.backgroundColor = UIColor.label.withAlphaComponent(0.08)
        pill.layer.cornerRadius = 9
        pill.layer.cornerCurve = .continuous
        let label = UILabel()
        label.text = text
        label.font = .systemFont(ofSize: 11, weight: .bold)
        label.textColor = .secondaryLabel
        pill.addSubview(label)
        label.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: pill.topAnchor, constant: 3),
            label.bottomAnchor.constraint(equalTo: pill.bottomAnchor, constant: -3),
            label.leadingAnchor.constraint(equalTo: pill.leadingAnchor, constant: 8),
            label.trailingAnchor.constraint(equalTo: pill.trailingAnchor, constant: -8)
        ])
        return pill
    }
}

/// UIControl row with the standard pressed-state wash.
private final class HighlightRow: UIControl {
    override var isHighlighted: Bool {
        didSet {
            backgroundColor = isHighlighted ? UIColor.label.withAlphaComponent(0.08) : .clear
        }
    }
}
