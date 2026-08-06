import Foundation

// The Swift mirror of lib/widgets/snapshot.ts. The JSON keys ARE the interface
// between the web app and every native surface — change one side and you must
// change the other.
//
// Every field decodes defensively. A widget is the one part of the app that
// routinely runs against data written by a *different build*: the site updates
// instantly, the app only when the user takes an App Store update, and the
// container still holds whatever the last install wrote. So a missing or
// renamed key must degrade to an empty panel, never to a decode failure that
// blanks the whole widget.
//
// The `init(from:)` implementations live in extensions on purpose: declaring an
// initializer inside a struct body suppresses Swift's memberwise init, and the
// widget previews / placeholder states want it.
//
// TARGET MEMBERSHIP: App + SneakerfeatureWidgets.

struct WidgetImageRef: Codable, Hashable {
    /// File name inside the shared container's image directory. The URL the web
    /// side resolved it from is deliberately not persisted.
    var file: String?

    enum CodingKeys: String, CodingKey { case file }
}

extension WidgetImageRef {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.file = try c.decodeIfPresent(String.self, forKey: .file) ?? nil
    }
}

struct WidgetFeatureFlags: Codable, Hashable {
    var closet: Bool = true
    var daily: Bool = true
    var favorites: Bool = true
    var lockWeek: Bool = true

    enum CodingKeys: String, CodingKey { case closet, daily, favorites, lockWeek }
}

extension WidgetFeatureFlags {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.closet = try c.decodeIfPresent(Bool.self, forKey: .closet) ?? true
        self.daily = try c.decodeIfPresent(Bool.self, forKey: .daily) ?? true
        self.favorites = try c.decodeIfPresent(Bool.self, forKey: .favorites) ?? true
        self.lockWeek = try c.decodeIfPresent(Bool.self, forKey: .lockWeek) ?? true
    }
}

struct WidgetClosetPanel: Codable, Hashable {
    var shoeId: String?
    var shoeName: String = ""
    var shoeBrand: String = ""
    var image: WidgetImageRef = WidgetImageRef()
    var totalHours: Double = 0
    var totalSessions: Int = 0
    var weekHours: Double = 0
    var weekGoalHours: Double = 6
    var wearRatio: Double = 0
    var costPerSession: Double?
    var currency: String = "¥"
    var path: String = "/closet"

    /// 0…1 for the ring. An over-goal week clamps the arc rather than wrapping
    /// it; the number underneath still reads the real total.
    var weekProgress: Double {
        guard weekGoalHours > 0 else { return 0 }
        return min(1, max(0, weekHours / weekGoalHours))
    }

    enum CodingKeys: String, CodingKey {
        case shoeId, shoeName, shoeBrand, image, totalHours, totalSessions
        case weekHours, weekGoalHours, wearRatio, costPerSession, currency, path
    }
}

extension WidgetClosetPanel {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.shoeId = try c.decodeIfPresent(String.self, forKey: .shoeId) ?? nil
        self.shoeName = try c.decodeIfPresent(String.self, forKey: .shoeName) ?? ""
        self.shoeBrand = try c.decodeIfPresent(String.self, forKey: .shoeBrand) ?? ""
        self.image = try c.decodeIfPresent(WidgetImageRef.self, forKey: .image) ?? WidgetImageRef()
        self.totalHours = try c.decodeIfPresent(Double.self, forKey: .totalHours) ?? 0
        self.totalSessions = try c.decodeIfPresent(Int.self, forKey: .totalSessions) ?? 0
        self.weekHours = try c.decodeIfPresent(Double.self, forKey: .weekHours) ?? 0
        self.weekGoalHours = try c.decodeIfPresent(Double.self, forKey: .weekGoalHours) ?? 6
        self.wearRatio = try c.decodeIfPresent(Double.self, forKey: .wearRatio) ?? 0
        self.costPerSession = try c.decodeIfPresent(Double.self, forKey: .costPerSession) ?? nil
        self.currency = try c.decodeIfPresent(String.self, forKey: .currency) ?? "¥"
        self.path = try c.decodeIfPresent(String.self, forKey: .path) ?? "/closet"
    }
}

struct WidgetDailyPanel: Codable, Hashable {
    var title: String = ""
    var brand: String = ""
    var reason: String = ""
    var image: WidgetImageRef = WidgetImageRef()
    var path: String = "/"

    enum CodingKeys: String, CodingKey { case title, brand, reason, image, path }
}

extension WidgetDailyPanel {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        self.brand = try c.decodeIfPresent(String.self, forKey: .brand) ?? ""
        self.reason = try c.decodeIfPresent(String.self, forKey: .reason) ?? ""
        self.image = try c.decodeIfPresent(WidgetImageRef.self, forKey: .image) ?? WidgetImageRef()
        self.path = try c.decodeIfPresent(String.self, forKey: .path) ?? "/"
    }
}

struct WidgetFavoriteItem: Codable, Hashable, Identifiable {
    var name: String = ""
    var brand: String = ""
    var image: WidgetImageRef = WidgetImageRef()
    var path: String = "/favorites"

    /// Unique per shoe within a snapshot — good enough to key a two-row list.
    var id: String { path }

    enum CodingKeys: String, CodingKey { case name, brand, image, path }
}

extension WidgetFavoriteItem {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        self.brand = try c.decodeIfPresent(String.self, forKey: .brand) ?? ""
        self.image = try c.decodeIfPresent(WidgetImageRef.self, forKey: .image) ?? WidgetImageRef()
        self.path = try c.decodeIfPresent(String.self, forKey: .path) ?? "/favorites"
    }
}

struct WidgetFavoritesPanel: Codable, Hashable {
    var count: Int = 0
    var items: [WidgetFavoriteItem] = []
    var comparePath: String = "/favorites"

    enum CodingKeys: String, CodingKey { case count, items, comparePath }
}

extension WidgetFavoritesPanel {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.count = try c.decodeIfPresent(Int.self, forKey: .count) ?? 0
        self.items = try c.decodeIfPresent([WidgetFavoriteItem].self, forKey: .items) ?? []
        self.comparePath = try c.decodeIfPresent(String.self, forKey: .comparePath) ?? "/favorites"
    }
}

struct WidgetSnapshot: Codable, Hashable {
    /// Must match WIDGET_SNAPSHOT_VERSION in lib/widgets/snapshot.ts.
    static let supportedVersion = 1

    var v: Int = WidgetSnapshot.supportedVersion
    var updatedAt: String = ""
    var signedIn: Bool = false
    var locale: String = "en"
    var features: WidgetFeatureFlags = WidgetFeatureFlags()
    var closet: WidgetClosetPanel?
    var daily: WidgetDailyPanel?
    var favorites: WidgetFavoritesPanel?

    var isChinese: Bool { locale.hasPrefix("zh") }

    enum CodingKeys: String, CodingKey {
        case v, updatedAt, signedIn, locale, features, closet, daily, favorites
    }
}

extension WidgetSnapshot {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.v = try c.decodeIfPresent(Int.self, forKey: .v) ?? 0
        self.updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt) ?? ""
        self.signedIn = try c.decodeIfPresent(Bool.self, forKey: .signedIn) ?? false
        self.locale = try c.decodeIfPresent(String.self, forKey: .locale) ?? "en"
        self.features = try c.decodeIfPresent(WidgetFeatureFlags.self, forKey: .features) ?? WidgetFeatureFlags()
        // A panel written by a newer web build with an incompatible shape is
        // dropped on its own rather than taking the whole snapshot down.
        self.closet = (try? c.decodeIfPresent(WidgetClosetPanel.self, forKey: .closet)) ?? nil
        self.daily = (try? c.decodeIfPresent(WidgetDailyPanel.self, forKey: .daily)) ?? nil
        self.favorites = (try? c.decodeIfPresent(WidgetFavoritesPanel.self, forKey: .favorites)) ?? nil
    }
}
