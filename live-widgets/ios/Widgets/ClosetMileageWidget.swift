import WidgetKit
import SwiftUI
#if canImport(AppIntents)
import AppIntents
#endif

// 战靴里程 — the rotation you actually hoop in, on the home screen.
//
// The one number worth a home-screen slot is *this week*, because it's the one
// that changes and the one you can still do something about. Lifetime hours and
// cost-per-run are the supporting cast; they belong on the wider families where
// there's room for them without shouting.
//
// The 开场 button is the reason this widget earns its place. Tapping it starts a
// real court session from the home screen — no app launch, no navigation — via
// a LiveActivityIntent that runs in the app's process and lights up the Dynamic
// Island. On iOS 16, where widgets can't be interactive, the same corner becomes
// a link into the closet.
//
// TARGET MEMBERSHIP: SneakerfeatureWidgets only.

struct ClosetMileageWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SneakerfeatureClosetMileage", provider: SneakerfeatureProvider()) { entry in
            ClosetMileageView(entry: entry)
                .widgetSurface()
        }
        .configurationDisplayName("Closet mileage")
        .description("This week's court hours, your rotation and cost per run.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct ClosetMileageView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SneakerfeatureEntry

    private var copy: WidgetCopy { entry.copy }
    private var closet: WidgetClosetPanel? { entry.snapshot?.closet }

    var body: some View {
        content
            .widgetURL(WidgetLinks.urlOrHome(for: closet?.path ?? "/closet"))
    }

    @ViewBuilder
    private var content: some View {
        if entry.snapshot?.features.closet == false {
            WidgetEmptyState(symbol: "square.dashed", message: copy.turnedOff)
        } else if entry.snapshot?.signedIn == false {
            WidgetEmptyState(symbol: "person.crop.circle", message: copy.signedOut)
        } else if let closet {
            switch family {
            case .systemSmall: smallBody(closet)
            case .systemLarge: largeBody(closet)
            default: mediumBody(closet)
            }
        } else {
            // "figure.basketball" ships in SF Symbols 4 (iOS 16) — the shoe
            // symbols are iOS 18-only and would render as a blank box on 17.
            WidgetEmptyState(symbol: "figure.basketball", message: copy.noPairs)
        }
    }

    // MARK: - Small
    //
    // StandBy (iPhone on its side, charging) shows systemSmall widgets, so this
    // is also the big-glanceable-numbers layout. Everything scales off the ring.

    private func smallBody(_ closet: WidgetClosetPanel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Text(copy.thisWeek)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 4)
                if entry.session != nil {
                    LiveDot()
                }
            }

            Spacer(minLength: 4)

            ZStack {
                WeekRing(progress: closet.weekProgress, lineWidth: 7)
                VStack(spacing: 0) {
                    if let session = entry.session, let start = session.displayStart {
                        // A run is going — the live clock outranks the weekly total.
                        Text(start, style: .timer)
                            .font(.system(.title3, design: .rounded).weight(.bold))
                            .monospacedDigit()
                            .minimumScaleFactor(0.5)
                            .lineLimit(1)
                    } else {
                        Text(copy.hours(closet.weekHours))
                            .font(.system(.title2, design: .rounded).weight(.bold))
                            .monospacedDigit()
                            .minimumScaleFactor(0.6)
                            .lineLimit(1)
                        Text("/ \(copy.hours(closet.weekGoalHours))")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(6)
            }
            .sfAccented()
            .frame(maxWidth: .infinity)

            Spacer(minLength: 4)

            Text(closet.shoeName.isEmpty ? copy.rotation : closet.shoeName)
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .padding(14)
    }

    // MARK: - Medium

    private func mediumBody(_ closet: WidgetClosetPanel) -> some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    ShoeThumb(file: closet.image.file, name: closet.shoeName, size: 40)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(closet.shoeName.isEmpty ? copy.rotation : closet.shoeName)
                            .font(.system(size: 14, weight: .semibold))
                            .lineLimit(1)
                        Text(closet.shoeBrand)
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 0)

                HStack(alignment: .top, spacing: 14) {
                    StatCell(value: copy.hours(closet.totalHours), label: copy.courtHours)
                    StatCell(value: "\(closet.totalSessions)", label: copy.runs)
                    if let cost = closet.costPerSession {
                        StatCell(value: copy.money(cost, currency: closet.currency), label: copy.perRun)
                    }
                }
            }

            Spacer(minLength: 0)

            VStack(spacing: 8) {
                weekDial(closet, size: 66)
                sessionButton(closet)
            }
        }
        .padding(14)
    }

    // MARK: - Large (also the iPad layout)

    private func largeBody(_ closet: WidgetClosetPanel) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 12) {
                ShoeThumb(file: closet.image.file, name: closet.shoeName, size: 72)
                VStack(alignment: .leading, spacing: 2) {
                    Text(closet.shoeBrand)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                    Text(closet.shoeName.isEmpty ? copy.rotation : closet.shoeName)
                        .font(.system(.title3, design: .rounded).weight(.bold))
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                }
                Spacer(minLength: 0)
                weekDial(closet, size: 84)
            }

            cushionBar(closet)

            HStack(alignment: .top, spacing: 0) {
                StatCell(value: copy.hours(closet.totalHours), label: copy.courtHours)
                Spacer(minLength: 8)
                StatCell(value: "\(closet.totalSessions)", label: copy.runs)
                Spacer(minLength: 8)
                if let cost = closet.costPerSession {
                    StatCell(value: copy.money(cost, currency: closet.currency), label: copy.perRun)
                } else {
                    StatCell(value: copy.hours(closet.weekGoalHours), label: copy.goal)
                }
            }

            Spacer(minLength: 0)
            sessionButton(closet)
                .frame(maxWidth: .infinity)
        }
        .padding(18)
    }

    // MARK: - Pieces

    private func weekDial(_ closet: WidgetClosetPanel, size: CGFloat) -> some View {
        ZStack {
            WeekRing(progress: closet.weekProgress, lineWidth: size * 0.11)
            VStack(spacing: 0) {
                if let session = entry.session, let start = session.displayStart {
                    Text(start, style: .timer)
                        .font(.system(size: size * 0.21, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                } else {
                    Text(copy.hours(closet.weekHours))
                        .font(.system(size: size * 0.26, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
                Text(copy.thisWeek)
                    .font(.system(size: size * 0.12, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .padding(size * 0.16)
        }
        .frame(width: size, height: size)
        .sfAccented()
    }

    /// Estimated cushion life used by the featured pair — the closet's own
    /// "time to retire" signal, at a glance.
    private func cushionBar(_ closet: WidgetClosetPanel) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(.quaternary)
                    Capsule()
                        .fill(closet.wearRatio >= 0.9 ? Color.sfBrand : Color.primary.opacity(0.65))
                        .frame(width: geo.size.width * min(1, max(0.02, closet.wearRatio)))
                }
            }
            .frame(height: 6)

            Text("\(copy.cushionLeft) · \(Int((1 - min(1, closet.wearRatio)) * 100))%")
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.secondary)
        }
    }

    /// 开场 / 结束. Interactive on iOS 17+, a deep link before that.
    @ViewBuilder
    private func sessionButton(_ closet: WidgetClosetPanel) -> some View {
        #if canImport(AppIntents)
        if #available(iOS 17.0, *) {
            if let session = entry.session {
                Button(intent: EndCourtSessionIntent(sessionId: session.id)) {
                    buttonLabel(copy.end, symbol: "stop.fill", filled: true)
                }
                .buttonStyle(.plain)
            } else if closet.shoeId != nil {
                Button(intent: StartCourtSessionIntent()) {
                    buttonLabel(copy.start, symbol: "play.fill", filled: true)
                }
                .buttonStyle(.plain)
            }
        } else {
            legacyLink(closet)
        }
        #else
        legacyLink(closet)
        #endif
    }

    /// iOS 16 has no interactive widgets, so the button becomes a shortcut into
    /// the closet, where the same action is one tap away.
    @ViewBuilder
    private func legacyLink(_ closet: WidgetClosetPanel) -> some View {
        if family != .systemSmall {
            Link(destination: WidgetLinks.urlOrHome(for: "/closet")) {
                buttonLabel(copy.courtTimer, symbol: "timer", filled: false)
            }
        }
    }

    private func buttonLabel(_ title: String, symbol: String, filled: Bool) -> some View {
        HStack(spacing: 5) {
            Image(systemName: symbol).font(.system(size: 10, weight: .bold))
            Text(title).font(.system(size: 12, weight: .semibold)).lineLimit(1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .foregroundStyle(filled ? Color(.systemBackground) : Color.primary)
        .background {
            if filled {
                Capsule().fill(Color.primary)
            } else {
                Capsule().fill(.quaternary)
            }
        }
    }
}

/// The "something is happening right now" marker, shared with the Live Activity.
struct LiveDot: View {
    var body: some View {
        Circle()
            .fill(Color.sfBrand)
            .frame(width: 6, height: 6)
    }
}
