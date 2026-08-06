import WidgetKit
import SwiftUI

// The widget extension's entry point. Everything the user can add to a home
// screen, a Lock Screen or StandBy, plus both Live Activities, is registered
// here — a bundle is how one extension vends several widgets.
//
// No availability branching, on purpose. WidgetBundleBuilder's support for
// `if #available` is thin and version-dependent, so the extension target simply
// sets a deployment target of iOS 16.2 (see live-widgets/README.md) — the floor
// the ActivityContent API needs anyway — and every widget here is then
// unconditionally available. The APP target keeps its much older floor; the two
// targets do not have to agree.
//
// TARGET MEMBERSHIP: SneakerfeatureWidgets only. This file carries @main, so it
// must NOT be added to the App target — the app has its own entry point and two
// @main attributes in one module is a compile error.

@main
struct SneakerfeatureWidgetsBundle: WidgetBundle {
    var body: some Widget {
        // Home screen (and StandBy, which draws systemSmall widgets).
        ClosetMileageWidget()
        DailyShoeWidget()
        FavoritesWidget()
        // Lock Screen.
        CourtWeekAccessoryWidget()
        // Dynamic Island + Lock Screen live cards.
        CourtSessionLiveActivity()
        PickerLiveActivity()
    }
}
