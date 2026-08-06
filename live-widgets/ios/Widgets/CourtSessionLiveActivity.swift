import ActivityKit
import WidgetKit
import SwiftUI
#if canImport(AppIntents)
import AppIntents
#endif

// 打球计时 in the Dynamic Island and on the Lock Screen.
//
// One ActivityConfiguration produces every presentation the user will ever see:
// the pill beside the camera, the expanded card when they long-press it, the
// tiny circle when another app is also using the Island, and the full card on
// the Lock Screen. Writing it once is why "灵动岛" and "锁屏弹窗" are the same
// feature rather than two.
//
// The clock is Text(timerInterval:), never a pushed number. The system runs it,
// so the Island stays correct with the app suspended, the phone in a bag and
// nothing of ours scheduled — which is exactly the situation this feature exists
// for. See CourtSessionAttributes.displayStart for how pause/resume folds into
// a single range.
//
// The background tint is left unset on purpose: iOS 26 then renders the card in
// the system's Liquid Glass material, and earlier versions get the standard
// activity material. Overriding it with a flat colour would opt out of both.
//
// TARGET MEMBERSHIP: SneakerfeatureWidgets only.

@available(iOS 16.2, *)
struct CourtSessionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CourtSessionAttributes.self) { context in
            CourtSessionLockScreenView(context: context)
                .widgetURL(WidgetLinks.urlOrHome(for: "/closet"))
                .activitySystemActionForegroundColor(.primary)
        } dynamicIsland: { context in
            let copy = WidgetCopy(zh: context.attributes.isChinese)

            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) {
                        ShoeThumb(
                            file: context.attributes.imageFile,
                            name: context.attributes.shoeName,
                            size: 38
                        )
                        VStack(alignment: .leading, spacing: 1) {
                            Text(context.attributes.shoeBrand)
                                .font(.system(size: 10))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                            Text(context.attributes.shoeName)
                                .font(.system(size: 13, weight: .semibold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                    }
                    .padding(.leading, 2)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 1) {
                        CourtClock(state: context.state, copy: copy, size: 22, weight: .bold)
                        Text(context.state.isRunning ? copy.playing : copy.paused)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.trailing, 2)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 8) {
                        Text("\(copy.totalLabel) \(copy.hours(context.state.totalHours)) · \(context.state.totalSessions) \(copy.runs)")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        CourtSessionControls(context: context, copy: copy, compact: true)
                    }
                    .padding(.top, 2)
                }
            } compactLeading: {
                Image(systemName: "figure.basketball")
                    .foregroundStyle(Color.sfBrand)
            } compactTrailing: {
                // The compact region is a few dozen points wide and the system
                // truncates rather than shrinks, so the clock gets an explicit
                // width and monospaced digits to stop it jittering every second.
                CourtClock(state: context.state, copy: copy, size: 13, weight: .semibold)
                    .frame(width: 48)
            } minimal: {
                Image(systemName: "figure.basketball")
                    .foregroundStyle(Color.sfBrand)
            }
            .widgetURL(WidgetLinks.urlOrHome(for: "/closet"))
            .keylineTint(Color.sfBrand)
        }
    }
}

// MARK: - Lock Screen / banner

@available(iOS 16.2, *)
struct CourtSessionLockScreenView: View {
    let context: ActivityViewContext<CourtSessionAttributes>

    private var copy: WidgetCopy { WidgetCopy(zh: context.attributes.isChinese) }

    var body: some View {
        HStack(spacing: 14) {
            ShoeThumb(
                file: context.attributes.imageFile,
                name: context.attributes.shoeName,
                size: 56
            )

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    if context.state.isRunning { LiveDot() }
                    Text(context.state.isRunning ? copy.playing : copy.paused)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(context.state.isRunning ? Color.sfBrand : .secondary)
                }
                Text(context.attributes.shoeName)
                    .font(.system(.headline, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text("\(copy.totalLabel) \(copy.hours(context.state.totalHours)) · \(context.state.totalSessions) \(copy.runs)")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            VStack(alignment: .trailing, spacing: 8) {
                CourtClock(state: context.state, copy: copy, size: 26, weight: .bold)
                CourtSessionControls(context: context, copy: copy, compact: false)
            }
        }
        .padding(16)
    }
}

// MARK: - Shared pieces

/// The clock. Running → a system-driven timer that needs no updates from us;
/// paused → the frozen total, which can't drift because nothing is moving.
@available(iOS 16.2, *)
struct CourtClock: View {
    let state: CourtSessionAttributes.ContentState
    let copy: WidgetCopy
    let size: CGFloat
    let weight: Font.Weight

    var body: some View {
        Group {
            if let range = state.timerRange {
                Text(timerInterval: range, countsDown: false)
                    .multilineTextAlignment(.center)
            } else {
                Text(copy.clock(state.accumulatedSeconds))
            }
        }
        .font(.system(size: size, weight: weight, design: .rounded))
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.6)
    }
}

/// 暂停 / 继续 / 结束.
///
/// Interactive from iOS 17 via LiveActivityIntent, which the system runs inside
/// the app's process even when the app is not on screen — so ending a run from
/// the Lock Screen genuinely ends it, rather than queueing something for later.
/// On iOS 16 the buttons would do nothing, so they aren't drawn at all and the
/// card's own tap target (into /closet) is the whole interaction.
@available(iOS 16.2, *)
struct CourtSessionControls: View {
    let context: ActivityViewContext<CourtSessionAttributes>
    let copy: WidgetCopy
    let compact: Bool

    @ViewBuilder
    var body: some View {
        #if canImport(AppIntents)
        if #available(iOS 17.0, *) {
            HStack(spacing: 6) {
                Button(intent: ToggleCourtSessionIntent(sessionId: context.attributes.sessionId)) {
                    pill(
                        context.state.isRunning ? copy.pause : copy.resume,
                        symbol: context.state.isRunning ? "pause.fill" : "play.fill",
                        prominent: false
                    )
                }
                .buttonStyle(.plain)

                Button(intent: EndCourtSessionIntent(sessionId: context.attributes.sessionId)) {
                    pill(copy.end, symbol: "stop.fill", prominent: true)
                }
                .buttonStyle(.plain)
            }
        } else {
            EmptyView()
        }
        #else
        EmptyView()
        #endif
    }

    private func pill(_ title: String, symbol: String, prominent: Bool) -> some View {
        HStack(spacing: 4) {
            Image(systemName: symbol).font(.system(size: compact ? 9 : 10, weight: .bold))
            if !compact {
                Text(title).font(.system(size: 11, weight: .semibold))
            }
        }
        .padding(.horizontal, compact ? 9 : 11)
        .padding(.vertical, compact ? 5 : 6)
        .foregroundStyle(prominent ? Color(.systemBackground) : Color.primary)
        .background {
            if prominent {
                Capsule().fill(Color.primary)
            } else {
                // Real Liquid Glass on iOS 26, the system material before it —
                // either way the pill picks up what's behind the card instead of
                // sitting on a flat grey.
                Color.clear.sfGlassCapsule()
            }
        }
        .clipShape(Capsule())
    }
}
