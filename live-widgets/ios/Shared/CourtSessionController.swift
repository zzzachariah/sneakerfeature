import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif
#if canImport(WidgetKit)
import WidgetKit
#endif

// Starting, updating and ending the court-session Live Activity, plus keeping
// the shared container's copy of the session in step with it.
//
// Lives in Shared rather than App-only because the App Intents behind the
// widget's 开场 and the Island's 结束 buttons need it, and those intent types
// must compile into the widget extension too (that's how the system serialises
// them). LiveActivityIntent guarantees the *execution* happens in the app's
// process, which is where ActivityKit will actually honour a request().
//
// iOS 16.2 is the floor: it's where ActivityContent replaced the original
// request/update signatures, and coding against one API instead of two is worth
// more than the two-month-wide band of 16.1 devices it gives up.
//
// TARGET MEMBERSHIP: App + SneakerfeatureWidgets.

#if canImport(ActivityKit)

@available(iOS 16.2, *)
enum CourtSessionController {

    /// Whether the user has left Live Activities on for this app in Settings.
    static var isAvailable: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    static func activity(for sessionId: String) -> Activity<CourtSessionAttributes>? {
        Activity<CourtSessionAttributes>.activities.first { $0.attributes.sessionId == sessionId }
    }

    static var current: Activity<CourtSessionAttributes>? {
        Activity<CourtSessionAttributes>.activities.first
    }

    @discardableResult
    static func start(
        session: StoredCourtSession,
        totalHours: Double,
        totalSessions: Int,
        isChinese: Bool
    ) -> Bool {
        guard isAvailable else { return false }
        // Re-entrancy guard: the web layer and a widget button can both ask to
        // start within the same second (the user taps the widget, the app comes
        // to the foreground, the WebView restores its own session and asks too).
        // Only one run exists, so only one activity should.
        if activity(for: session.id) != nil { return true }
        endAll(immediately: true)

        let attributes = CourtSessionAttributes(
            sessionId: session.id,
            shoeId: session.shoeId,
            shoeName: session.shoeName,
            shoeBrand: session.shoeBrand,
            imageFile: session.imageFile,
            startedAt: session.startedAt,
            isChinese: isChinese
        )
        let state = CourtSessionAttributes.ContentState(
            runningSince: session.runningSince,
            accumulatedSeconds: session.accumulatedSeconds,
            totalHours: totalHours,
            totalSessions: totalSessions
        )

        do {
            _ = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: nil),
                pushType: nil
            )
            WidgetShared.saveSession(session)
            reloadWidgets()
            return true
        } catch {
            // The timer in the app is unaffected — only the Island is missing —
            // so this stays non-fatal. But it must not stay quiet: a swallowed
            // throw here is indistinguishable from a working feature nobody
            // looked at, and the three usual causes (no NSSupportsLiveActivities
            // in the app's Info.plist, a request from the background that didn't
            // come through a LiveActivityIntent, the per-app activity cap) are
            // told apart by the error and the two values printed with it.
            logStartFailure(error)
            return false
        }
    }

    /// One line with everything needed to tell the failure modes apart.
    private static func logStartFailure(_ error: Error) {
        let declared = Bundle.main.object(forInfoDictionaryKey: "NSSupportsLiveActivities") as? Bool
        print("""
        ⚡️  [LiveWidgets] Activity.request failed: \(error)
        ⚡️  [LiveWidgets] areActivitiesEnabled=\(ActivityAuthorizationInfo().areActivitiesEnabled) \
        NSSupportsLiveActivities=\(declared.map(String.init) ?? "MISSING from the app's Info.plist")
        """)
    }

    static func update(session: StoredCourtSession, totalHours: Double? = nil, totalSessions: Int? = nil) {
        WidgetShared.saveSession(session)
        guard let activity = activity(for: session.id) else { return }
        let previous = activity.content.state
        let state = CourtSessionAttributes.ContentState(
            runningSince: session.runningSince,
            accumulatedSeconds: session.accumulatedSeconds,
            totalHours: totalHours ?? previous.totalHours,
            totalSessions: totalSessions ?? previous.totalSessions
        )
        Task {
            await activity.update(ActivityContent(state: state, staleDate: nil))
        }
    }

    /// Ends the run. `loggedHours` is only for the farewell card — the wear log
    /// itself is written by the web layer, which is the side with the session.
    static func end(sessionId: String, loggedHours: Double) {
        WidgetShared.saveSession(nil)
        guard let activity = activity(for: sessionId) else {
            reloadWidgets()
            return
        }
        let previous = activity.content.state
        let final = CourtSessionAttributes.ContentState(
            runningSince: nil,
            accumulatedSeconds: previous.elapsed(),
            totalHours: previous.totalHours + max(0, loggedHours),
            totalSessions: previous.totalSessions + (loggedHours > 0 ? 1 : 0)
        )
        Task {
            // A few seconds of "结束 · 已记录 1.5h" on the Lock Screen is the
            // receipt for an action the user took from outside the app; a card
            // that simply vanishes reads as a crash.
            await activity.end(
                ActivityContent(state: final, staleDate: nil),
                dismissalPolicy: .after(.now.addingTimeInterval(8))
            )
        }
        reloadWidgets()
    }

    static func endAll(immediately: Bool = false) {
        let policy: ActivityUIDismissalPolicy = immediately ? .immediate : .default
        for activity in Activity<CourtSessionAttributes>.activities {
            Task { await activity.end(nil, dismissalPolicy: policy) }
        }
    }

    private static func reloadWidgets() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }
}

#endif
