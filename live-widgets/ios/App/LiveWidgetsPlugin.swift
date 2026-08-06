import Foundation
import Capacitor
import UIKit
#if canImport(WidgetKit)
import WidgetKit
#endif
#if canImport(ActivityKit)
import ActivityKit
#endif

// The Capacitor bridge for the widgets and Live Activities — everything the web
// app can ask native to do on its behalf.
//
// Design rule for this file: it never decides anything. The web layer owns the
// state machine (which pair, how long, what gets logged); this only writes what
// it's told into the shared container and asks ActivityKit / WidgetKit to
// redraw. That keeps the interesting logic in TypeScript, where it ships the
// moment we deploy, instead of in Swift, where it ships when Apple says so.
//
// Every method resolves rather than rejects on a missing capability. The JS side
// treats "no widgets on this device" as normal, and a rejected promise there
// would be indistinguishable from a bug.
//
// TARGET MEMBERSHIP: App only.

@objc(LiveWidgetsPlugin)
public class LiveWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveWidgetsPlugin"
    public let jsName = "LiveWidgets"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "publishSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cacheImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pruneImages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startCourtSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateCourtSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCourtSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCourtSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePendingCourtIntents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startPickerActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endPickerActivity", returnType: CAPPluginReturnPromise)
    ]

    /// Cached shoe images are capped on their long edge. Widgets are at most
    /// ~360pt wide at @3x; anything larger is bytes in a shared container and
    /// decode time in an extension with a hard memory limit.
    private let maxImageEdge: CGFloat = 480
    private let imageTimeout: TimeInterval = 12

    private lazy var downloader: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = imageTimeout
        config.timeoutIntervalForResource = imageTimeout * 2
        return URLSession(configuration: config)
    }()

    // MARK: - Capability

    @objc func isAvailable(_ call: CAPPluginCall) {
        // App Group missing → nothing can be handed to a widget, so report the
        // honest answer and let the web app hide its settings section rather
        // than offer switches that do nothing.
        let configured = WidgetShared.isConfigured
        var liveActivities = false
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            liveActivities = configured && ActivityAuthorizationInfo().areActivitiesEnabled
        }
        #endif
        call.resolve([
            "available": configured,
            "widgets": configured,
            "liveActivities": liveActivities
        ])
    }

    // MARK: - Snapshot

    @objc func publishSnapshot(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), WidgetShared.isConfigured else {
            call.resolve()
            return
        }
        WidgetShared.saveSnapshot(json: json)
        reloadWidgets()
        call.resolve()
    }

    @objc func cacheImage(_ call: CAPPluginCall) {
        guard
            WidgetShared.isConfigured,
            let key = call.getString("key"),
            let urlString = call.getString("url"),
            let url = URL(string: urlString),
            let scheme = url.scheme?.lowercased(),
            scheme == "https" || scheme == "http"
        else {
            call.resolve(["file": NSNull()])
            return
        }

        let file = "\(sanitize(key)).png"
        // Already on disk from an earlier launch — the JS map can be dropped
        // (storage cleared, new install) while the files survive.
        if let existing = WidgetShared.imageURL(named: file), FileManager.default.fileExists(atPath: existing.path) {
            call.resolve(["file": file])
            return
        }

        downloader.dataTask(with: url) { [weak self] data, response, _ in
            guard
                let self,
                let data,
                let http = response as? HTTPURLResponse,
                (200..<300).contains(http.statusCode),
                let image = UIImage(data: data),
                // PNG, not JPEG: shoe cut-outs are transparent (the site runs a
                // background-removal pass), and flattening them onto white would
                // put a card-coloured box around every shoe in dark mode.
                let encoded = self.downscaled(image).pngData(),
                WidgetShared.writeImage(data: encoded, named: file)
            else {
                call.resolve(["file": NSNull()])
                return
            }
            call.resolve(["file": file])
        }.resume()
    }

    @objc func pruneImages(_ call: CAPPluginCall) {
        guard WidgetShared.isConfigured else {
            call.resolve()
            return
        }
        // getArray hands back a heterogeneous JS array; compactMap is what
        // makes a stray non-string in the payload a skipped entry rather than a
        // failed cast that wipes the whole keep-list.
        let keep = Set(call.getArray("keep")?.compactMap { $0 as? String } ?? [])
        // An empty keep-list almost always means the snapshot had no images
        // this time (signed out, everything switched off) — not "delete the
        // cache". Only prune when we were actually given a set to keep.
        if !keep.isEmpty {
            WidgetShared.pruneImages(keeping: keep)
        }
        call.resolve()
    }

    // MARK: - Court session

    @objc func startCourtSession(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let shoeId = call.getString("shoeId") else {
            call.resolve()
            return
        }
        let startedAt = date(call.getDouble("startedAt")) ?? Date()
        let session = StoredCourtSession(
            id: id,
            shoeId: shoeId,
            shoeName: call.getString("shoeName") ?? "",
            shoeBrand: call.getString("shoeBrand") ?? "",
            imageFile: call.getString("imageFile"),
            startedAt: startedAt,
            runningSince: startedAt,
            accumulatedSeconds: 0,
            returnPath: call.getString("returnPath")
        )

        // Totals are for the card's "累计" line. The web app passes what it
        // knows; a run started from a widget passes 0 and we fall back to the
        // last published snapshot.
        let snapshot = WidgetShared.loadSnapshot()
        var totalHours = call.getDouble("totalHours") ?? 0
        var totalSessions = call.getInt("totalSessions") ?? 0
        if totalHours <= 0, let closet = snapshot?.closet { totalHours = closet.totalHours }
        if totalSessions <= 0, let closet = snapshot?.closet { totalSessions = closet.totalSessions }

        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            CourtSessionController.start(
                session: session,
                totalHours: totalHours,
                totalSessions: totalSessions,
                isChinese: snapshot?.isChinese ?? false
            )
            call.resolve()
            return
        }
        #endif
        // No ActivityKit: still record the session so a widget can show it.
        WidgetShared.saveSession(session)
        reloadWidgets()
        call.resolve()
    }

    @objc func updateCourtSession(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), var session = WidgetShared.loadSession(), session.id == id else {
            call.resolve()
            return
        }
        session.runningSince = date(call.getDouble("runningSince"))
        session.accumulatedSeconds = max(0, (call.getDouble("accumulatedMs") ?? 0) / 1000)
        // Absent means "unchanged" — a pause/resume update shouldn't wipe the
        // page the user was last on.
        if let returnPath = call.getString("returnPath"), returnPath.hasPrefix("/") {
            session.returnPath = returnPath
        }

        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            CourtSessionController.update(session: session)
            call.resolve()
            return
        }
        #endif
        WidgetShared.saveSession(session)
        call.resolve()
    }

    @objc func endCourtSession(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? WidgetShared.loadSession()?.id ?? ""
        let loggedHours = call.getDouble("loggedHours") ?? 0
        let resultPath = call.getString("resultPath")

        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            CourtSessionController.end(sessionId: id, loggedHours: loggedHours, resultPath: resultPath)
            call.resolve()
            return
        }
        #endif
        WidgetShared.saveSession(nil)
        reloadWidgets()
        call.resolve()
    }

    @objc func getCourtSession(_ call: CAPPluginCall) {
        guard let session = WidgetShared.loadSession() else {
            call.resolve(["session": NSNull()])
            return
        }
        // `runningSince` is null while paused, and JS distinguishes null from 0
        // (0 is a real instant). NSNull is what survives the bridge as `null`.
        var payload: [String: Any] = [
            "id": session.id,
            "shoeId": session.shoeId,
            "shoeName": session.shoeName,
            "shoeBrand": session.shoeBrand,
            "startedAt": millis(session.startedAt),
            "accumulatedMs": session.accumulatedSeconds * 1000
        ]
        if let runningSince = session.runningSince {
            payload["runningSince"] = millis(runningSince)
        } else {
            payload["runningSince"] = NSNull()
        }
        call.resolve(["session": payload])
    }

    @objc func takePendingCourtIntents(_ call: CAPPluginCall) {
        let intents = WidgetShared.takePendingIntents().map { intent -> [String: Any] in
            var payload: [String: Any] = [
                "kind": intent.kind.rawValue,
                "sessionId": intent.sessionId,
                "shoeId": intent.shoeId,
                "at": millis(intent.at)
            ]
            if intent.kind == .end {
                payload["elapsedMs"] = (intent.elapsedSeconds ?? 0) * 1000
            }
            if let name = intent.shoeName { payload["shoeName"] = name }
            if let brand = intent.shoeBrand { payload["shoeBrand"] = brand }
            return payload
        }
        call.resolve(["intents": intents])
    }

    // MARK: - Smart Picker

    @objc func startPickerActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *), let id = call.getString("id") {
            PickerActivityController.start(
                id: id,
                prompt: call.getString("prompt") ?? "",
                path: call.getString("path") ?? "/smart-picker",
                isChinese: WidgetShared.loadSnapshot()?.isChinese ?? false
            )
        }
        #endif
        call.resolve()
    }

    @objc func endPickerActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *), let id = call.getString("id") {
            PickerActivityController.end(
                id: id,
                summary: call.getString("summary") ?? "",
                failed: call.getBool("failed") ?? false
            )
        }
        #endif
        call.resolve()
    }

    // MARK: - Helpers

    private func reloadWidgets() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }

    /// JS hands over epoch milliseconds; Foundation wants seconds since 1970.
    private func date(_ millis: Double?) -> Date? {
        guard let millis, millis > 0 else { return nil }
        return Date(timeIntervalSince1970: millis / 1000)
    }

    private func millis(_ date: Date) -> Double {
        (date.timeIntervalSince1970 * 1000).rounded()
    }

    /// The key is our own hash, but it lands in a file path — keep it to
    /// characters that can't walk out of the images directory.
    private func sanitize(_ key: String) -> String {
        let allowed = CharacterSet.alphanumerics
        let cleaned = key.unicodeScalars.filter { allowed.contains($0) }
        let result = String(String.UnicodeScalarView(cleaned))
        return result.isEmpty ? "img" : String(result.prefix(40))
    }

    private func downscaled(_ image: UIImage) -> UIImage {
        let longEdge = max(image.size.width, image.size.height)
        guard longEdge > maxImageEdge, longEdge > 0 else { return image }
        let ratio = maxImageEdge / longEdge
        let target = CGSize(width: image.size.width * ratio, height: image.size.height * ratio)
        let format = UIGraphicsImageRendererFormat.default()
        format.opaque = false
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }
}
