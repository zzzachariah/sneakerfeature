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
                // Where they left off while the run is live; the receipt for
                // that run once it has ended. Both come from the state.
                .widgetURL(WidgetLinks.urlOrHome(for: context.state.linkPath ?? "/closet"))
                .activitySystemActionForegroundColor(.primary)
        } dynamicIsland: { context in
            let copy = WidgetCopy(zh: context.attributes.isChinese)

            return DynamicIsland {
                // Three regions, one job each. Leading identifies the pair,
                // trailing is the clock and nothing else, and the bottom row
                // carries the state, the totals, and the two controls — which is
                // the only region wide enough to give those controls a real
                // tap target.
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) {
                        ShoeThumb(
                            file: context.attributes.imageFile,
                            name: context.attributes.shoeName,
                            size: 34
                        )
                        VStack(alignment: .leading, spacing: 0) {
                            Text(context.attributes.shoeBrand)
                                .font(.system(size: 10))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                            Text(context.attributes.shoeName)
                                .font(.system(size: 14, weight: .semibold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.75)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, 4)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    // The clock alone. The state word used to sit under it and
                    // crowded the right edge for no information — it reads
                    // better in the bottom row next to the totals.
                    CourtClock(state: context.state, copy: copy, size: 24, weight: .bold)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.trailing, 4)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack(alignment: .center, spacing: 10) {
                        Text("\(context.state.isRunning ? copy.playing : copy.paused) · \(copy.totalLabel) \(copy.hours(context.state.totalHours)) · \(context.state.totalSessions) \(copy.runs)")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                        Spacer(minLength: 0)
                        CourtSessionControls(context: context, copy: copy)
                    }
                    .padding(.top, 6)
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                AppLogoMark(size: 16)
            } compactTrailing: {
                // The compact pill is the state everyone actually sees, so it
                // stays as narrow as it can while still saying something. The
                // clock's width is reserved rather than measured (the digits
                // change every second and a fluid width would jitter), so it is
                // sized for "59:59" — the longest string a run this short can
                // produce — and not for the hours case, which shrinks to fit.
                HStack(spacing: 3) {
                    Text(context.state.isRunning ? copy.courtShort : copy.pausedShort)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .layoutPriority(-1)
                    CourtClock(state: context.state, copy: copy, size: 13, weight: .semibold)
                        .frame(width: 40)
                }
            } minimal: {
                // Only shown when another app is sharing the Island, so this is
                // pure identity — the clock has nowhere to go.
                AppLogoMark(size: 16)
            }
            .widgetURL(WidgetLinks.urlOrHome(for: context.state.linkPath ?? "/closet"))
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
                    AppLogoMark(size: 12)
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
                CourtSessionControls(context: context, copy: copy)
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
/// card's own tap target (into the closet) is the whole interaction.
///
/// Circles, not labelled pills. The first version used icon-only pills padded to
/// roughly 26×20pt, which is well under the 44pt Apple asks for and was, in
/// practice, un-tappable. Labels don't fit beside the totals in the Island's
/// bottom row, so the shape carries the meaning instead and the target is sized
/// properly: 38pt of visible circle inside a 44pt hit area.
@available(iOS 16.2, *)
struct CourtSessionControls: View {
    let context: ActivityViewContext<CourtSessionAttributes>
    let copy: WidgetCopy

    @ViewBuilder
    var body: some View {
        #if canImport(AppIntents)
        if #available(iOS 17.0, *) {
            HStack(spacing: 6) {
                Button(intent: ToggleCourtSessionIntent(sessionId: context.attributes.sessionId)) {
                    control(
                        context.state.isRunning ? "pause.fill" : "play.fill",
                        label: context.state.isRunning ? copy.pause : copy.resume,
                        prominent: false
                    )
                }
                .buttonStyle(.plain)

                Button(intent: EndCourtSessionIntent(sessionId: context.attributes.sessionId)) {
                    control("stop.fill", label: copy.end, prominent: true)
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

    /// `.primary` rather than a literal white: the Dynamic Island always renders
    /// dark, so it resolves to white there, while the Lock Screen card follows
    /// the wallpaper's appearance and needs the opposite in light mode.
    private func control(_ symbol: String, label: String, prominent: Bool) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(prominent ? AnyShapeStyle(Color(.systemBackground)) : AnyShapeStyle(.primary))
            .frame(width: 38, height: 38)
            .background(Circle().fill(prominent ? AnyShapeStyle(.primary) : AnyShapeStyle(.quaternary)))
            // The visible circle stays 38pt so the row doesn't grow, but the
            // tappable region is the full 44pt.
            .frame(width: 44, height: 44)
            .contentShape(Circle())
            .accessibilityLabel(label)
    }
}
