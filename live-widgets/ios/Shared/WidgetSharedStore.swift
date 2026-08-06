import Foundation
#if canImport(UIKit)
import UIKit
#endif

// The App Group container — the only thing the app, the widgets and the Live
// Activity intents can all touch.
//
// A widget extension is a separate process with its own sandbox: it cannot read
// the app's UserDefaults, its Keychain, or the WebView's cookies. Everything a
// widget draws has to be handed over through this container, which is also why
// nothing sensitive goes in it. What's here is a rendered picture of the user's
// own closet — no tokens, no session, nothing that would let the extension act
// on the user's behalf if the container were read.
//
// TARGET MEMBERSHIP: App + SneakerfeatureWidgets.

enum WidgetShared {
    /// Must match the App Group enabled on BOTH targets (see live-widgets/README.md).
    static let appGroupIdentifier = "group.com.sneakerfeature.app"

    /// WidgetKit reload key — every widget in the bundle shares one timeline.
    static let widgetKind = "SneakerfeatureWidgets"

    private static let snapshotKey = "widget.snapshot.v1"
    private static let sessionKey = "widget.courtSession.v1"
    private static let pendingKey = "widget.pendingCourtIntents.v1"
    private static let imagesDirectoryName = "widget-images"

    static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupIdentifier)
    }

    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
    }

    /// True when the App Group capability is actually wired up. Every write
    /// checks this so a mis-provisioned build degrades to "widgets show their
    /// empty state" instead of crashing the app on launch.
    static var isConfigured: Bool { containerURL != nil && defaults != nil }

    // MARK: - Snapshot

    static func saveSnapshot(json: String) {
        defaults?.set(json, forKey: snapshotKey)
    }

    static func loadSnapshot() -> WidgetSnapshot? {
        guard
            let json = defaults?.string(forKey: snapshotKey),
            let data = json.data(using: .utf8),
            let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
        else { return nil }
        // A snapshot from a future web build may mean something else entirely;
        // showing the empty state beats showing a confident wrong number.
        guard snapshot.v == WidgetSnapshot.supportedVersion else { return nil }
        return snapshot
    }

    // MARK: - Images

    static var imagesDirectory: URL? {
        guard let base = containerURL else { return nil }
        let dir = base.appendingPathComponent(imagesDirectoryName, isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    static func imageURL(named file: String) -> URL? {
        // The file name comes from our own hash of a URL, but it lands in a
        // path — reject anything that could climb out of the directory.
        guard !file.isEmpty, !file.contains("/"), !file.contains("..") else { return nil }
        return imagesDirectory?.appendingPathComponent(file, isDirectory: false)
    }

    static func writeImage(data: Data, named file: String) -> Bool {
        guard let url = imageURL(named: file) else { return false }
        do {
            try data.write(to: url, options: .atomic)
            return true
        } catch {
            return false
        }
    }

    /// Deletes every cached image except the ones still referenced.
    static func pruneImages(keeping keep: Set<String>) {
        guard let dir = imagesDirectory else { return }
        let names = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
        for name in names where !keep.contains(name) {
            try? FileManager.default.removeItem(at: dir.appendingPathComponent(name))
        }
    }

    #if canImport(UIKit)
    static func image(named file: String?) -> UIImage? {
        guard
            let file, !file.isEmpty,
            let url = imageURL(named: file),
            let data = try? Data(contentsOf: url)
        else { return nil }
        return UIImage(data: data)
    }
    #endif

    // MARK: - Court session

    static func saveSession(_ session: StoredCourtSession?) {
        guard let defaults else { return }
        guard let session, let data = try? JSONEncoder().encode(session) else {
            defaults.removeObject(forKey: sessionKey)
            return
        }
        defaults.set(data, forKey: sessionKey)
    }

    static func loadSession() -> StoredCourtSession? {
        guard
            let data = defaults?.data(forKey: sessionKey),
            let session = try? JSONDecoder().decode(StoredCourtSession.self, from: data)
        else { return nil }
        return session
    }

    // MARK: - Pending intents

    /// Appends something that happened while the WebView wasn't listening — a
    /// widget's 开场, or 结束 from the Dynamic Island. The web layer drains this
    /// on its next resume and is the only thing that writes the wear log, since
    /// it's the only side holding a session cookie.
    static func appendPendingIntent(_ intent: PendingCourtIntent) {
        guard let defaults else { return }
        var queue = loadPendingIntents()
        queue.append(intent)
        // Bounded: an app that never reopens shouldn't grow this forever.
        if queue.count > 32 { queue.removeFirst(queue.count - 32) }
        if let data = try? JSONEncoder().encode(queue) {
            defaults.set(data, forKey: pendingKey)
        }
    }

    static func loadPendingIntents() -> [PendingCourtIntent] {
        guard
            let data = defaults?.data(forKey: pendingKey),
            let queue = try? JSONDecoder().decode([PendingCourtIntent].self, from: data)
        else { return [] }
        return queue
    }

    /// Reads and clears in one step so an intent is delivered exactly once.
    static func takePendingIntents() -> [PendingCourtIntent] {
        let queue = loadPendingIntents()
        defaults?.removeObject(forKey: pendingKey)
        return queue
    }
}

/// The running session, as both the app and the widget extension see it.
struct StoredCourtSession: Codable, Hashable {
    var id: String
    var shoeId: String
    var shoeName: String
    var shoeBrand: String
    var imageFile: String?
    var startedAt: Date
    /// When the current leg started, or nil while paused.
    var runningSince: Date?
    /// Seconds banked by legs that already ended.
    var accumulatedSeconds: Double
    /// The in-app path the user was last on, so tapping the Island or the widget
    /// resumes where they left off instead of dropping them on the closet.
    /// Written when the app goes to the background — which is exactly the moment
    /// "where I left off" stops changing.
    var returnPath: String?

    var isRunning: Bool { runningSince != nil }

    func elapsed(at now: Date = Date()) -> TimeInterval {
        let live = runningSince.map { max(0, now.timeIntervalSince($0)) } ?? 0
        return max(0, accumulatedSeconds + live)
    }

    /// The instant a clock showing TOTAL elapsed time would have started from —
    /// the current leg's start pushed back by everything already banked. Hand
    /// this to SwiftUI's Text(_:style: .timer) and it counts the whole session,
    /// on the system's clock, with nothing of ours awake.
    var displayStart: Date? {
        runningSince.map { $0.addingTimeInterval(-accumulatedSeconds) }
    }
}

struct PendingCourtIntent: Codable, Hashable {
    enum Kind: String, Codable { case start, end }

    var kind: Kind
    var sessionId: String
    var shoeId: String
    var at: Date
    /// Only set on `.end` — what the Island actually counted.
    var elapsedSeconds: Double?
    /// Carried on `.start` so the app can label the run it's adopting without
    /// looking the shoe up first. Native already knew these.
    var shoeName: String?
    var shoeBrand: String?
}
