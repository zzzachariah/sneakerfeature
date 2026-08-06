import WidgetKit
import SwiftUI

// 今日一鞋 — the pair worth knowing about today.
//
// Signed in, it's the top pick from the weekly personalized digest
// (lib/personalize/digest.ts). Signed out or before the first digest runs, the
// API falls back to a shoe-of-the-day drawn from the best-rated shoes, keyed by
// the date — so this widget always has something on it, which is the difference
// between a widget people keep and one they delete on day two.
//
// TARGET MEMBERSHIP: SneakerfeatureWidgets only.

struct DailyShoeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SneakerfeatureDailyShoe", provider: SneakerfeatureProvider()) { entry in
            DailyShoeView(entry: entry)
                .widgetSurface()
        }
        .configurationDisplayName("Shoe of the day")
        .description("Your pick of the day, one tap from its page.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct DailyShoeView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SneakerfeatureEntry

    private var copy: WidgetCopy { entry.copy }
    private var daily: WidgetDailyPanel? { entry.snapshot?.daily }

    var body: some View {
        content
            .widgetURL(WidgetLinks.urlOrHome(for: daily?.path ?? "/"))
    }

    @ViewBuilder
    private var content: some View {
        if entry.snapshot?.features.daily == false {
            WidgetEmptyState(symbol: "square.dashed", message: copy.turnedOff)
        } else if let daily {
            if family == .systemSmall {
                small(daily)
            } else {
                medium(daily)
            }
        } else {
            WidgetEmptyState(symbol: "sparkles", message: copy.openApp)
        }
    }

    private func small(_ daily: WidgetDailyPanel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(copy.todaysPick)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .kerning(0.6)

            Spacer(minLength: 2)

            ShoeThumb(file: daily.image.file, name: daily.title, size: 62)
                .frame(maxWidth: .infinity)

            Spacer(minLength: 2)

            Text(daily.brand)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Text(daily.title)
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
        .padding(14)
    }

    private func medium(_ daily: WidgetDailyPanel) -> some View {
        HStack(spacing: 14) {
            ShoeThumb(file: daily.image.file, name: daily.title, size: 84)

            VStack(alignment: .leading, spacing: 4) {
                Text(copy.todaysPick)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                    .kerning(0.6)
                Text(daily.brand)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text(daily.title)
                    .font(.system(.headline, design: .rounded))
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                if !daily.reason.isEmpty {
                    Text(daily.reason)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)
                }
                Spacer(minLength: 0)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
    }
}
