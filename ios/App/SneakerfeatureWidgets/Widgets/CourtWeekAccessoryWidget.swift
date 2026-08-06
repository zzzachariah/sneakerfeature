import WidgetKit
import SwiftUI

// The Lock Screen ring — this week's court hours against your goal.
//
// Deliberately the same shape as the fitness rings people already read without
// thinking: filled means you hooped, empty means you didn't. It's the one piece
// of the app worth a Lock Screen slot, because it's the only number that's about
// what you did rather than what you might buy.
//
// Uses Gauge rather than a hand-drawn ring: the accessory families render in
// vibrant mode, where arbitrary strokes lose their contrast and the system's own
// gauge keeps it.
//
// TARGET MEMBERSHIP: SneakerfeatureWidgets only.

@available(iOS 16.0, *)
struct CourtWeekAccessoryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SneakerfeatureCourtWeek", provider: SneakerfeatureProvider()) { entry in
            CourtWeekAccessoryView(entry: entry)
                .widgetURL(WidgetLinks.urlOrHome(for: "/closet"))
        }
        .configurationDisplayName("Court hours this week")
        .description("Your weekly court time as a ring on the Lock Screen.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

@available(iOS 16.0, *)
struct CourtWeekAccessoryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SneakerfeatureEntry

    private var copy: WidgetCopy { entry.copy }

    /// The ring is off when either the lock-screen switch or the closet data is
    /// gone. There's no room on an accessory widget to explain why, so it just
    /// shows an empty ring rather than an error nobody can read.
    private var closet: WidgetClosetPanel? {
        guard entry.snapshot?.features.lockWeek != false else { return nil }
        return entry.snapshot?.closet
    }

    var body: some View {
        switch family {
        case .accessoryInline: inlineBody
        case .accessoryRectangular: rectangularBody
        default: circularBody
        }
    }

    // MARK: - Circular

    private var circularBody: some View {
        Gauge(value: closet?.weekProgress ?? 0) {
            Image(systemName: "figure.basketball")
        } currentValueLabel: {
            if let session = entry.session, let start = session.displayStart {
                // Mid-run the ring becomes a stopwatch — that's the number you
                // want when you glance at a locked phone courtside.
                Text(start, style: .timer)
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
            } else {
                Text(shortHours(closet?.weekHours ?? 0))
                    .minimumScaleFactor(0.6)
            }
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .sfAccented()
    }

    // MARK: - Rectangular

    private var rectangularBody: some View {
        HStack(spacing: 8) {
            Gauge(value: closet?.weekProgress ?? 0) {
                EmptyView()
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .scaleEffect(0.86)

            VStack(alignment: .leading, spacing: 1) {
                Text(copy.thisWeek)
                    .font(.system(size: 12, weight: .semibold))
                    .sfAccented()
                if let session = entry.session, let start = session.displayStart {
                    Text(start, style: .timer)
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .lineLimit(1)
                } else if let closet {
                    Text("\(copy.hours(closet.weekHours)) / \(copy.hours(closet.weekGoalHours))")
                        .font(.system(size: 13, weight: .medium))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                } else {
                    Text(copy.openApp)
                        .font(.system(size: 12))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: - Inline
    //
    // One line beside the Lock Screen clock. The system gives it a single font
    // and no layout control, so this is text and one symbol, nothing more.

    private var inlineBody: some View {
        if let session = entry.session, let start = session.displayStart {
            return Label {
                Text(start, style: .timer)
            } icon: {
                Image(systemName: "timer")
            }
        }
        return Label {
            Text("\(copy.hours(closet?.weekHours ?? 0)) \(copy.thisWeek)")
        } icon: {
            Image(systemName: "figure.basketball")
        }
    }

    /// "4h" / "4.5" — the circular gauge's centre is barely three characters
    /// wide, so the unit is dropped once there's a decimal to show.
    private func shortHours(_ value: Double) -> String {
        let rounded = (value * 10).rounded() / 10
        if rounded == rounded.rounded() { return "\(Int(rounded))h" }
        return String(format: "%.1f", rounded)
    }
}
