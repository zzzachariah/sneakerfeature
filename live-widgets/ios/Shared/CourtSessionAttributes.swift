import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

// The shape of the court-session Live Activity, shared by the app (which starts
// and updates it) and the widget extension (which draws it). ActivityKit matches
// the two by this type, which is exactly why the file has to be in both targets.
//
// The state carries TIMESTAMPS, never a running total. That's the whole trick
// behind a Live Activity that stays right: SwiftUI's Text(timerInterval:) counts
// on its own, on the system's clock, with no process of ours awake. If instead
// we pushed "elapsed = 372s" every second, the Island would freeze the moment
// iOS suspended the app — and ActivityKit throttles updates anyway.
//
// TARGET MEMBERSHIP: App + SneakerfeatureWidgets.

#if canImport(ActivityKit)

@available(iOS 16.1, *)
struct CourtSessionAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// When the current leg began; nil while paused.
        var runningSince: Date?
        /// Seconds banked by legs that already ended.
        var accumulatedSeconds: Double
        /// Lifetime totals for this rotation, shown under the clock.
        var totalHours: Double
        var totalSessions: Int

        var isRunning: Bool { runningSince != nil }

        /// The instant a clock showing *total* elapsed time would have started
        /// from — the current leg's start pushed back by everything already
        /// banked. Feeding this to Text(timerInterval:) makes a paused-and-
        /// resumed session keep counting from where it left off, rather than
        /// restarting at zero on every resume.
        var displayStart: Date? {
            runningSince.map { $0.addingTimeInterval(-accumulatedSeconds) }
        }

        /// Total elapsed at `now`, for the paused readout and for the value the
        /// end intent reports back to the app.
        func elapsed(at now: Date = Date()) -> TimeInterval {
            let live = runningSince.map { max(0, now.timeIntervalSince($0)) } ?? 0
            return max(0, accumulatedSeconds + live)
        }
    }

    /// Ties the activity back to the web app's session record.
    var sessionId: String
    var shoeId: String
    var shoeName: String
    var shoeBrand: String
    /// File name in the shared image cache; nil renders the monogram fallback.
    var imageFile: String?
    var startedAt: Date
    /// Snapshot of the UI language when the run started — a Live Activity can
    /// outlive the app process, so it can't ask the WebView later.
    var isChinese: Bool
}

@available(iOS 16.1, *)
extension CourtSessionAttributes.ContentState {
    /// The window Text(timerInterval:) counts across. ActivityKit ends an
    /// activity well before 12h, so the range only has to outlast the activity.
    static let displayWindow: TimeInterval = 12 * 60 * 60

    var timerRange: ClosedRange<Date>? {
        guard let start = displayStart else { return nil }
        return start...start.addingTimeInterval(Self.displayWindow)
    }
}

#endif
