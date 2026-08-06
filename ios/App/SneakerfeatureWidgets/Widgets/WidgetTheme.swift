import SwiftUI
import WidgetKit
import UIKit

// The small set of pieces every widget is built from, so the four of them read
// as one product rather than four exercises in SwiftUI.
//
// Colour discipline matches the web app: the interface is monochrome, and the
// single brand orange is spent only on the thing that's alive right now — the
// week ring, a running session. Everything else is .primary / .secondary, which
// is also what makes tinted and vibrant rendering modes survive.
//
// TARGET MEMBERSHIP: SneakerfeatureWidgets only.

extension Color {
    /// The site's brand orange (app/globals.css --brand), in both appearances.
    static let sfBrand = Color(
        UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 255 / 255, green: 110 / 255, blue: 64 / 255, alpha: 1)
                : UIColor(red: 234 / 255, green: 76 / 255, blue: 16 / 255, alpha: 1)
        }
    )
}

/// The app's mark, for the Dynamic Island's compact region and as a quiet stamp
/// on every widget.
///
/// Reads `AppLogo` out of the *extension's* asset catalogue — a widget extension
/// is a separate bundle and cannot see the app's Assets.xcassets, so the image
/// has to be added there too (live-widgets/README.md §3c). Until it is,
/// UIImage(named:) returns nil and this falls back to an SF Symbol rather than
/// drawing the empty box `Image("AppLogo")` would leave behind. That means the
/// build is never blocked on an asset, and adding it later upgrades every
/// surface at once.
struct AppLogoMark: View {
    var size: CGFloat = 16
    /// Compact Dynamic Island regions render on near-black; a mark with its own
    /// colours reads better there than a tinted one. Widgets are the opposite —
    /// the logo is furniture, so it defers to the content.
    var dimmed: Bool = false

    var body: some View {
        if let image = UIImage(named: "AppLogo") {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: size, height: size)
                .opacity(dimmed ? 0.55 : 1)
        } else {
            Image(systemName: "figure.basketball")
                .font(.system(size: size * 0.86, weight: .semibold))
                .foregroundStyle(dimmed ? AnyShapeStyle(.tertiary) : AnyShapeStyle(Color.sfBrand))
                .frame(width: size, height: size)
        }
    }
}

/// A shoe picture from the shared cache, or its initials when there isn't one.
///
/// The fallback matters more than it looks: images are downloaded lazily by the
/// app, so the first render after adding a widget often has none, and a blank
/// square would read as a broken widget rather than a loading one.
struct ShoeThumb: View {
    let file: String?
    let name: String
    var size: CGFloat = 56

    var body: some View {
        Group {
            if let image = WidgetShared.image(named: file) {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else {
                RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)
                    .fill(.quaternary)
                    .overlay(
                        Text(monogram)
                            .font(.system(size: size * 0.34, weight: .semibold, design: .rounded))
                            .foregroundStyle(.secondary)
                    )
            }
        }
        .frame(width: size, height: size)
    }

    private var monogram: String {
        let words = name.split(separator: " ").prefix(2)
        let letters = words.compactMap { $0.first }.map(String.init).joined()
        return letters.isEmpty ? "SF" : letters.uppercased()
    }
}

/// The week-progress ring. Also the lock-screen widget's whole body.
struct WeekRing: View {
    let progress: Double
    var lineWidth: CGFloat = 6
    var tint: Color = .sfBrand

    var body: some View {
        ZStack {
            Circle()
                .stroke(.quaternary, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0.001, min(1, progress)))
                .stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
    }
}

/// A label/value pair. Value first, because on a widget the number is the
/// content and the label is the caption.
struct StatCell: View {
    let value: String
    let label: String
    var alignment: HorizontalAlignment = .leading

    var body: some View {
        VStack(alignment: alignment, spacing: 1) {
            Text(value)
                .font(.system(.callout, design: .rounded).weight(.semibold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }
}

/// The three ways a widget can have nothing to show, in one place so they look
/// the same everywhere: signed out, empty, or switched off in settings.
struct WidgetEmptyState: View {
    let symbol: String
    let message: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(.secondary)
            Text(message)
                .font(.caption2)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .lineLimit(3)
                .minimumScaleFactor(0.85)
        }
        .padding(.horizontal, 6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// The material behind a home-screen widget. Glass on iOS 26, the system's
/// widget background elsewhere.
struct WidgetSurface: ViewModifier {
    func body(content: Content) -> some View {
        content.sfWidgetBackground(
            LinearGradient(
                colors: [Color(.systemBackground), Color(.secondarySystemBackground)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }
}

extension View {
    func widgetSurface() -> some View { modifier(WidgetSurface()) }
}
