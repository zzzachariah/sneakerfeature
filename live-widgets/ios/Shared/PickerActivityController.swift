import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

// The Smart Picker's Live Activity, driven entirely from the WebView: it starts
// when a turn starts and ends when the turn lands. Nothing else can touch it —
// there are no widget buttons here — so unlike the court session this needs no
// shared queue and no App Intents.
//
// TARGET MEMBERSHIP: App + SneakerfeatureWidgets.
// (The widget extension needs the type to draw the card; only the app calls it.)

#if canImport(ActivityKit)

@available(iOS 16.2, *)
enum PickerActivityController {

    /// The Island is ~40 characters wide when expanded; anything longer just
    /// gets truncated by the system, mid-word and without an ellipsis.
    private static let promptLimit = 48

    static func activity(for id: String) -> Activity<PickerActivityAttributes>? {
        Activity<PickerActivityAttributes>.activities.first { $0.attributes.activityId == id }
    }

    @discardableResult
    static func start(id: String, prompt: String, path: String, isChinese: Bool) -> Bool {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        if activity(for: id) != nil { return true }
        // Only ever one turn on screen: with up to three concurrent chats, three
        // stacked "thinking" cards would bury the Lock Screen for no extra
        // information.
        endAll(immediately: true)

        let attributes = PickerActivityAttributes(
            activityId: id,
            prompt: trimmed(prompt),
            path: path,
            startedAt: Date(),
            isChinese: isChinese
        )
        let state = PickerActivityAttributes.ContentState(stage: .thinking, summary: "")
        do {
            _ = try Activity.request(
                attributes: attributes,
                // A turn that outruns this is a turn that died with the app
                // suspended: the card greys itself out instead of claiming to
                // still be thinking an hour later.
                content: ActivityContent(state: state, staleDate: Date().addingTimeInterval(10 * 60)),
                pushType: nil
            )
            return true
        } catch {
            return false
        }
    }

    static func end(id: String, summary: String, failed: Bool) {
        guard let activity = activity(for: id) else { return }
        let state = PickerActivityAttributes.ContentState(
            stage: failed ? .failed : .done,
            summary: summary
        )
        Task {
            await activity.end(
                ActivityContent(state: state, staleDate: nil),
                // Long enough to notice from across the room and tap through;
                // a failed turn has nothing to show, so it goes at once.
                dismissalPolicy: failed ? .immediate : .after(.now.addingTimeInterval(20))
            )
        }
    }

    static func endAll(immediately: Bool = false) {
        for activity in Activity<PickerActivityAttributes>.activities {
            Task { await activity.end(nil, dismissalPolicy: immediately ? .immediate : .default) }
        }
    }

    private static func trimmed(_ prompt: String) -> String {
        let clean = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard clean.count > promptLimit else { return clean }
        return String(clean.prefix(promptLimit - 1)) + "…"
    }
}

#endif
