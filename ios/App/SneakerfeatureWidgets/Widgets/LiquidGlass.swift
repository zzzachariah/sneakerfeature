import SwiftUI
#if canImport(WidgetKit)
// containerBackground(for:) and widgetAccentable() are WidgetKit modifiers even
// though they read as plain SwiftUI.
import WidgetKit
#endif

// Liquid Glass, where the OS will actually give it to us.
//
// The rest of the app already gets glass three different ways: the tab bar and
// nav bar are real UIKit chrome that iOS 26 renders as Liquid Glass on its own
// (see /native-chrome), and the WebView fakes it in CSS (.glass / .glass-rim in
// app/globals.css). Widgets and Live Activities are the one place we can ask for
// the real material in SwiftUI — .glassEffect() on iOS 26.
//
// Two guards, doing different jobs:
//   • #if compiler(>=6.2) — Swift 6.2 ships with Xcode 26, which is the first
//     SDK that HAS these symbols. Without this the file wouldn't compile on an
//     older Xcode at all, since #available only defers a check to runtime; the
//     symbol still has to exist at build time.
//   • if #available(iOS 26.0, *) — the device check, so an iPhone on iOS 17
//     falls back to the system material instead of crashing.
//
// Below iOS 26 the fallback is .ultraThinMaterial, which is the same vocabulary
// the CSS side approximates — so a widget looks like the app either way.
//
// TARGET MEMBERSHIP: SneakerfeatureWidgets only. The app never draws SwiftUI —
// its glass is the real UIKit chrome in /native-chrome — and keeping this out of
// the App target means these modifiers can assume the extension's iOS 16.2
// floor instead of Capacitor's much older one.

extension View {
    /// A glass surface for a card, chip or button inside a widget or Live Activity.
    @ViewBuilder
    func sfGlass<S: Shape>(in shape: S) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular, in: shape)
        } else {
            self.background(.ultraThinMaterial, in: shape)
        }
        #else
        self.background(.ultraThinMaterial, in: shape)
        #endif
    }

    /// The common case: a rounded rectangle.
    @ViewBuilder
    func sfGlass(cornerRadius: CGFloat = 16) -> some View {
        self.sfGlass(in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }

    /// A capsule — pause / end buttons, stat pills.
    @ViewBuilder
    func sfGlassCapsule() -> some View {
        self.sfGlass(in: Capsule(style: .continuous))
    }

    /// Widgets on iOS 17+ MUST declare their background through this modifier or
    /// they render with a hard-edged, un-inset box that ignores the home
    /// screen's rounded corners and tint modes. Applied by every widget root.
    @ViewBuilder
    func sfWidgetBackground<S: ShapeStyle>(_ style: S) -> some View {
        #if canImport(WidgetKit)
        if #available(iOS 17.0, *) {
            self.containerBackground(style, for: .widget)
        } else {
            self.background(style)
        }
        #else
        self.background(style)
        #endif
    }

    /// Marks the part of a Lock Screen / StandBy widget that should pick up the
    /// user's accent tint. Without it, tinted mode flattens the whole widget to
    /// one weight and the hierarchy disappears.
    @ViewBuilder
    func sfAccented() -> some View {
        #if canImport(WidgetKit)
        self.widgetAccentable()
        #else
        self
        #endif
    }
}
