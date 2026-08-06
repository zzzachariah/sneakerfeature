import WidgetKit
import SwiftUI

// The timeline behind every home-screen widget in the bundle.
//
// There is no network here, and that's the design. The extension has no session
// cookie and a hard memory ceiling; anything it fetched would either be public
// (and therefore not the user's rotation) or require a token sitting on disk for
// an extension to use. Instead the app publishes a finished snapshot on every
// launch and resume, and this provider just reads it.
//
// The refresh policy is a safety net, not the mechanism: WidgetCenter reloads
// are pushed the moment anything changes (a run logged, a switch flipped). The
// hourly tick only matters for a phone whose owner hasn't opened the app in a
// while — and its job is mostly to roll "this week" over on Monday morning.
//
// TARGET MEMBERSHIP: SneakerfeatureWidgets only.

struct SneakerfeatureEntry: TimelineEntry {
    let date: Date
    /// nil when the app has never published — a freshly added widget on a
    /// device where the app hasn't been opened since the update.
    let snapshot: WidgetSnapshot?
    /// A run in progress, so the closet widget can show it rather than
    /// yesterday's totals.
    let session: StoredCourtSession?

    var copy: WidgetCopy { WidgetCopy(snapshot) }
}

struct SneakerfeatureProvider: TimelineProvider {
    /// Falls back to an hourly tick. Widget refresh budget is per-app and
    /// generous at this rate, and it keeps the week rolling over on time.
    private let refreshInterval: TimeInterval = 60 * 60

    func placeholder(in context: Context) -> SneakerfeatureEntry {
        SneakerfeatureEntry(date: Date(), snapshot: .preview, session: nil)
    }

    // WidgetKit's own "snapshot" — the still frame shown in the widget gallery.
    // Unrelated to our WidgetSnapshot; the name collision is Apple's.
    func getSnapshot(in context: Context, completion: @escaping (SneakerfeatureEntry) -> Void) {
        if context.isPreview {
            completion(SneakerfeatureEntry(date: Date(), snapshot: .preview, session: nil))
            return
        }
        completion(currentEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SneakerfeatureEntry>) -> Void) {
        let entry = currentEntry()
        let next = Date().addingTimeInterval(refreshInterval)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func currentEntry() -> SneakerfeatureEntry {
        SneakerfeatureEntry(
            date: Date(),
            snapshot: WidgetShared.loadSnapshot(),
            session: WidgetShared.loadSession()
        )
    }
}

// MARK: - Gallery preview data

extension WidgetSnapshot {
    /// What the widget gallery shows before the user has any data. Plausible
    /// numbers, not zeroes: a row of dashes tells someone nothing about whether
    /// they want the widget.
    static var preview: WidgetSnapshot {
        var closet = WidgetClosetPanel()
        closet.shoeId = "preview"
        closet.shoeName = "KD 17"
        closet.shoeBrand = "Nike"
        closet.totalHours = 46.5
        closet.totalSessions = 23
        closet.weekHours = 4
        closet.weekGoalHours = 6
        closet.wearRatio = 0.155
        closet.costPerSession = 62
        closet.currency = "¥"
        closet.path = "/closet"

        var daily = WidgetDailyPanel()
        daily.title = "Way of Wade 11"
        daily.brand = "Li-Ning"
        daily.reason = "Boom foam, wide forefoot, guard-friendly."
        daily.path = "/"

        var favorites = WidgetFavoritesPanel()
        favorites.count = 12
        favorites.comparePath = "/favorites"

        var snapshot = WidgetSnapshot()
        snapshot.signedIn = true
        snapshot.closet = closet
        snapshot.daily = daily
        snapshot.favorites = favorites
        return snapshot
    }
}
