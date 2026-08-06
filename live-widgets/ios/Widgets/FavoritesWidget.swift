import WidgetKit
import SwiftUI

// 收藏与快捷对比 — the two pairs you saved most recently, and a way straight
// into comparing them.
//
// The small family shows the count and the two shoes; a tap opens /compare with
// both already selected, which is the thing people actually came to do. Below
// two saved pairs there's nothing to compare, so the link falls back to the
// favorites list — decided web-side in buildFavoritesPanel(), not here.
//
// TARGET MEMBERSHIP: SneakerfeatureWidgets only.

struct FavoritesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SneakerfeatureFavorites", provider: SneakerfeatureProvider()) { entry in
            FavoritesView(entry: entry)
                .widgetSurface()
        }
        .configurationDisplayName("Favorites & compare")
        .description("Your saved pairs, one tap from a comparison.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct FavoritesView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SneakerfeatureEntry

    private var copy: WidgetCopy { entry.copy }
    private var favorites: WidgetFavoritesPanel? { entry.snapshot?.favorites }

    var body: some View {
        content
            .widgetURL(WidgetLinks.urlOrHome(for: favorites?.comparePath ?? "/favorites"))
    }

    @ViewBuilder
    private var content: some View {
        if entry.snapshot?.features.favorites == false {
            WidgetEmptyState(symbol: "square.dashed", message: copy.turnedOff)
        } else if entry.snapshot?.signedIn == false {
            WidgetEmptyState(symbol: "person.crop.circle", message: copy.signedOut)
        } else if let favorites, !favorites.items.isEmpty {
            filled(favorites)
        } else {
            WidgetEmptyState(symbol: "heart", message: copy.noFavorites)
        }
    }

    private func filled(_ favorites: WidgetFavoritesPanel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 5) {
                Image(systemName: "heart.fill")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Color.sfBrand)
                Text("\(favorites.count) \(copy.saved)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
                if favorites.items.count >= 2 {
                    Text(copy.compare)
                        .font(.system(size: 10, weight: .semibold))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(.quaternary))
                }
            }

            // Two rows on small, side by side on medium — the medium family has
            // the width to show both shoes at a size worth looking at.
            if family == .systemSmall {
                VStack(spacing: 6) {
                    ForEach(favorites.items) { item in
                        row(item, thumb: 30)
                    }
                }
            } else {
                HStack(spacing: 12) {
                    ForEach(favorites.items) { item in
                        column(item)
                    }
                }
            }

            Spacer(minLength: 0)
        }
        .padding(14)
    }

    private func row(_ item: WidgetFavoriteItem, thumb: CGFloat) -> some View {
        HStack(spacing: 8) {
            ShoeThumb(file: item.image.file, name: item.name, size: thumb)
            VStack(alignment: .leading, spacing: 0) {
                Text(item.name)
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(1)
                Text(item.brand)
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
    }

    private func column(_ item: WidgetFavoriteItem) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            ShoeThumb(file: item.image.file, name: item.name, size: 54)
            Text(item.name)
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            Text(item.brand)
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
