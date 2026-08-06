import Foundation

// Turning an in-app path into a tap target.
//
// The app already registers the `sneakerfeature://` scheme and already knows how
// to resolve an inbound link safely — see lib/native/deep-link.ts, whose
// pathFromDeepLink() is the security boundary and has its own regression suite
// (npm run test:deep-link). This file's only job is to produce URLs in the exact
// shape that parser expects, so a widget tap lands on the right page.
//
// Shape note: for a custom scheme the FIRST path segment becomes the URL's
// *host*, not part of its path — "sneakerfeature://shoes/kd-17" parses as
// host "shoes" + path "/kd-17", which pathFromDeepLink stitches back into
// "/shoes/kd-17". So the leading slash of an app path is dropped here, and
// putting it back is the web side's job.
//
// TARGET MEMBERSHIP: App + SneakerfeatureWidgets.

enum WidgetLinks {
    static let scheme = "sneakerfeature"

    /// The app's home screen — the fallback for any widget with nothing better.
    static var home: URL { URL(string: "\(scheme)://")! }

    /// Builds a deep link for an in-app path such as "/shoes/kd-17" or
    /// "/compare?ids=a,b". Returns nil for anything that isn't a plain path, so
    /// a malformed snapshot can't produce a link pointing off-origin.
    static func url(for path: String) -> URL? {
        guard path.hasPrefix("/"), !path.hasPrefix("//"), !path.hasPrefix("/\\") else { return nil }
        let body = String(path.dropFirst())
        guard !body.isEmpty else { return home }
        // urlQueryAllowed covers "?", "&", "=" and "," (needed by /compare?ids=)
        // but not "/", which has to survive intact.
        let allowed = CharacterSet.urlQueryAllowed.union(CharacterSet(charactersIn: "/"))
        guard let escaped = body.addingPercentEncoding(withAllowedCharacters: allowed) else { return nil }
        return URL(string: "\(scheme)://\(escaped)")
    }

    /// Same, but never nil — falls back to the app's home screen.
    static func urlOrHome(for path: String?) -> URL {
        guard let path, let url = url(for: path) else { return home }
        return url
    }
}
