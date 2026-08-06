import ActivityKit
import WidgetKit
import SwiftUI

// Smart Picker in the Dynamic Island: "still thinking — go do something else."
//
// A picker turn can run for a while, and the honest thing to show is elapsed
// time, not a progress bar. The model streams tokens; it has no idea how close
// it is to done, and a bar that isn't measuring anything is a claim the user
// will eventually catch us making up.
//
// The card is read-only. Everything actionable about a turn lives in the
// conversation, so the whole surface is one tap back to /smart-picker.
//
// TARGET MEMBERSHIP: SneakerfeatureWidgets only.

@available(iOS 16.2, *)
struct PickerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PickerActivityAttributes.self) { context in
            PickerLockScreenView(context: context)
                .widgetURL(WidgetLinks.urlOrHome(for: context.attributes.path))
                .activitySystemActionForegroundColor(.primary)
        } dynamicIsland: { context in
            let copy = WidgetCopy(zh: context.attributes.isChinese)

            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: symbol(for: context.state.stage))
                        .font(.title3)
                        .foregroundStyle(Color.sfBrand)
                        .padding(.leading, 4)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.attributes.startedAt, style: .timer)
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .frame(width: 54)
                        .multilineTextAlignment(.trailing)
                        .foregroundStyle(.secondary)
                }

                DynamicIslandExpandedRegion(.center) {
                    Text(headline(context.state, copy: copy))
                        .font(.system(size: 13, weight: .semibold))
                        .lineLimit(1)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.attributes.prompt)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                AppLogoMark(size: 18)
            } compactTrailing: {
                Text(context.attributes.startedAt, style: .timer)
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .frame(width: 44)
                    .multilineTextAlignment(.center)
            } minimal: {
                AppLogoMark(size: 16)
            }
            .widgetURL(WidgetLinks.urlOrHome(for: context.attributes.path))
            .keylineTint(Color.sfBrand)
        }
    }

    private func symbol(for stage: PickerActivityAttributes.Stage) -> String {
        switch stage {
        case .thinking: return "sparkles"
        case .done: return "checkmark.circle.fill"
        case .failed: return "exclamationmark.circle"
        }
    }

    private func headline(_ state: PickerActivityAttributes.ContentState, copy: WidgetCopy) -> String {
        switch state.stage {
        case .thinking: return copy.picking
        case .done: return state.summary.isEmpty ? copy.picksReady : state.summary
        case .failed: return copy.smartPicker
        }
    }
}

@available(iOS 16.2, *)
struct PickerLockScreenView: View {
    let context: ActivityViewContext<PickerActivityAttributes>

    private var copy: WidgetCopy { WidgetCopy(zh: context.attributes.isChinese) }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: context.state.stage == .thinking ? "sparkles" : "checkmark.circle.fill")
                .font(.title2)
                .foregroundStyle(Color.sfBrand)
                .frame(width: 34)

            VStack(alignment: .leading, spacing: 2) {
                Text(copy.smartPicker)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                    .kerning(0.6)
                Text(context.state.stage == .thinking
                     ? copy.picking
                     : (context.state.summary.isEmpty ? copy.picksReady : context.state.summary))
                    .font(.system(.headline, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                if !context.attributes.prompt.isEmpty {
                    Text(context.attributes.prompt)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 0)

            if context.state.stage == .thinking {
                Text(context.attributes.startedAt, style: .timer)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .frame(width: 62)
                    .multilineTextAlignment(.trailing)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(16)
    }
}
