import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

// The Smart Picker's Live Activity: "we're still thinking, go do something else."
//
// A good answer takes long enough that people leave the app, and leaving used to
// mean losing sight of it. This puts the turn in the Dynamic Island so the wait
// is visible from anywhere, and a tap comes straight back to the conversation.
//
// There is no percentage here on purpose. The picker streams tokens; it has no
// honest notion of "42% done", and a progress bar that isn't measuring anything
// is a lie the user can catch. An elapsed clock is true.
//
// TARGET MEMBERSHIP: App + SneakerfeatureWidgets.

#if canImport(ActivityKit)

@available(iOS 16.1, *)
struct PickerActivityAttributes: ActivityAttributes {
    enum Stage: String, Codable, Hashable {
        case thinking
        case done
        /// The turn died — a dropped connection, or the user left the picker.
        case failed
    }

    struct ContentState: Codable, Hashable {
        var stage: Stage
        /// Shown once the turn lands; empty while thinking.
        var summary: String
    }

    var activityId: String
    /// What the user asked, trimmed for the Island's width.
    var prompt: String
    /// Where a tap goes — always "/smart-picker".
    var path: String
    var startedAt: Date
    var isChinese: Bool
}

#endif
