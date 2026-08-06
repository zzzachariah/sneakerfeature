import Foundation
#if canImport(AppIntents)
import AppIntents
#endif
#if canImport(ActivityKit)
import ActivityKit
#endif
#if canImport(WidgetKit)
import WidgetKit
#endif

// The buttons on the widget and inside the Dynamic Island.
//
// These conform to LiveActivityIntent, which is what makes them legal: an app
// extension can't start a Live Activity, but the system runs a LiveActivityIntent
// in the *app's* process — launching it in the background if it isn't running.
// That is the only sanctioned way to go from "tap 开场 on the home screen" to a
// running Island without first putting the app on screen.
//
// The type has to compile into BOTH targets: the widget extension references it
// to build the button, the app executes it. That's why the file lives in Shared
// and why its body only touches Shared code.
//
// Each intent also drops a record into the shared queue. Native can start and
// stop a run on its own, but it cannot write the wear log — that needs the
// session cookie, which only the WebView has. So the queue is the hand-off:
// the app's next resume drains it and posts to /api/closet/wear.
//
// TARGET MEMBERSHIP: App + SneakerfeatureWidgets.

#if canImport(AppIntents) && canImport(ActivityKit)

/// Starts a run for the pair the closet widget is currently featuring.
@available(iOS 17.0, *)
struct StartCourtSessionIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Start a court session"
    static var description = IntentDescription("Starts the court timer for the pair on your widget.")
    /// Stays out of the app so the run can begin from the home screen. The
    /// Island appearing IS the confirmation.
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult {
        guard
            WidgetShared.isConfigured,
            let snapshot = WidgetShared.loadSnapshot(),
            let closet = snapshot.closet,
            let shoeId = closet.shoeId
        else {
            return .result()
        }
        // Already running — a second tap must not open a second timer or
        // silently reset the first one's clock.
        if WidgetShared.loadSession() != nil { return .result() }

        let now = Date()
        let session = StoredCourtSession(
            id: UUID().uuidString,
            shoeId: shoeId,
            shoeName: closet.shoeName,
            shoeBrand: closet.shoeBrand,
            imageFile: closet.image.file,
            startedAt: now,
            runningSince: now,
            accumulatedSeconds: 0
        )

        if #available(iOS 16.2, *) {
            CourtSessionController.start(
                session: session,
                totalHours: closet.totalHours,
                totalSessions: closet.totalSessions,
                isChinese: snapshot.isChinese
            )
        }

        WidgetShared.appendPendingIntent(
            PendingCourtIntent(
                kind: .start,
                sessionId: session.id,
                shoeId: session.shoeId,
                at: now,
                elapsedSeconds: nil,
                shoeName: session.shoeName,
                shoeBrand: session.shoeBrand
            )
        )
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
        return .result()
    }
}

/// Ends the run from the Island / Lock Screen card.
@available(iOS 17.0, *)
struct EndCourtSessionIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "End the court session"
    static var description = IntentDescription("Stops the court timer and logs the session to your closet.")
    static var openAppWhenRun: Bool = false

    init() {}

    init(sessionId: String) {
        self.sessionId = sessionId
    }

    /// Passed in by the card so a stale button can't end a newer run.
    @Parameter(title: "Session")
    var sessionId: String

    func perform() async throws -> some IntentResult {
        guard WidgetShared.isConfigured, let session = WidgetShared.loadSession() else { return .result() }
        guard session.id == sessionId else { return .result() }

        let now = Date()
        let elapsed = session.elapsed(at: now)

        if #available(iOS 16.2, *) {
            CourtSessionController.end(sessionId: session.id, loggedHours: elapsed / 3600)
        } else {
            WidgetShared.saveSession(nil)
        }

        WidgetShared.appendPendingIntent(
            PendingCourtIntent(
                kind: .end,
                sessionId: session.id,
                shoeId: session.shoeId,
                at: now,
                elapsedSeconds: elapsed,
                shoeName: nil,
                shoeBrand: nil
            )
        )
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
        return .result()
    }
}

/// Pause / resume, so a water break doesn't inflate the midsole's wear budget.
@available(iOS 17.0, *)
struct ToggleCourtSessionIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Pause or resume the court session"
    static var description = IntentDescription("Pauses or resumes the running court timer.")
    static var openAppWhenRun: Bool = false

    init() {}

    init(sessionId: String) {
        self.sessionId = sessionId
    }

    @Parameter(title: "Session")
    var sessionId: String

    func perform() async throws -> some IntentResult {
        guard WidgetShared.isConfigured, var session = WidgetShared.loadSession() else { return .result() }
        guard session.id == sessionId else { return .result() }

        let now = Date()
        if session.isRunning {
            session.accumulatedSeconds = session.elapsed(at: now)
            session.runningSince = nil
        } else {
            session.runningSince = now
        }

        if #available(iOS 16.2, *) {
            CourtSessionController.update(session: session)
        } else {
            WidgetShared.saveSession(session)
        }
        // No pending record: pausing changes nothing the server needs to know.
        // The web layer picks the new shape up from getCourtSession() on resume.
        return .result()
    }
}

#endif
