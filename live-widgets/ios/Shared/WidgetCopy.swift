import Foundation

// Widget and Live Activity strings.
//
// These do NOT go through the app's translation layer: that lives in the
// WebView, and a widget never loads one. The language comes from the snapshot,
// which carries whatever the user picked in the app — so the home screen
// follows the app's language rather than the system's, which is the behaviour
// someone running an English phone in Chinese gets everywhere else in the app.
//
// Deliberately a struct of two literals per string rather than a .strings
// catalogue: two languages, thirty strings, and no build-time codegen to keep
// in sync with a JSON contract that already carries the locale.
//
// TARGET MEMBERSHIP: App + SneakerfeatureWidgets.

struct WidgetCopy {
    let zh: Bool

    init(zh: Bool) { self.zh = zh }
    init(_ snapshot: WidgetSnapshot?) { self.zh = snapshot?.isChinese ?? false }

    private func t(_ en: String, _ cn: String) -> String { zh ? cn : en }

    // Closet / mileage
    var thisWeek: String { t("This week", "本周") }
    var courtHours: String { t("Court hours", "上脚时长") }
    var rotation: String { t("Rotation", "轮换") }
    var runs: String { t("runs", "场") }
    var perRun: String { t("per run", "每场") }
    var goal: String { t("goal", "目标") }
    var cushionLeft: String { t("cushion left", "中底余量") }

    // Daily pick
    var todaysPick: String { t("Today's pick", "今日一鞋") }

    // Favorites
    var favorites: String { t("Favorites", "收藏") }
    var compare: String { t("Compare", "对比") }
    var saved: String { t("saved", "双收藏") }

    // Empty / disabled states
    var signedOut: String { t("Sign in to track your rotation", "登录后追踪你的轮换") }
    var noPairs: String { t("Add a pair to start tracking", "添加一双开始追踪") }
    var noFavorites: String { t("Nothing saved yet", "还没有收藏") }
    var turnedOff: String { t("Turned off in Settings", "已在设置中关闭") }
    var openApp: String { t("Open sneakerfeature", "打开 sneakerfeature") }

    // Court session Live Activity
    var playing: String { t("Playing", "打球中") }
    var paused: String { t("Paused", "已暂停") }
    var courtTimer: String { t("Court timer", "打球计时") }
    var start: String { t("Start", "开场") }
    var end: String { t("End", "结束") }
    var pause: String { t("Pause", "暂停") }
    var resume: String { t("Resume", "继续") }
    var totalLabel: String { t("Total", "累计") }

    // Smart Picker Live Activity
    var picking: String { t("Picking your shoes…", "正在为你选鞋…") }
    var picksReady: String { t("Your picks are ready", "选鞋结果已就绪") }
    var smartPicker: String { t("Smart Picker", "Smart Picker") }

    // MARK: - Number formatting

    /// "12.5h" — one decimal, trailing ".0" dropped. Widgets are small; a
    /// second decimal place buys nothing and costs a line break.
    func hours(_ value: Double) -> String {
        let rounded = (value * 10).rounded() / 10
        if rounded == rounded.rounded() {
            return "\(Int(rounded))h"
        }
        return String(format: "%.1fh", rounded)
    }

    /// "¥86" — cost per run, whole units. Sub-unit precision on a shoe that
    /// cost hundreds is noise.
    func money(_ value: Double, currency: String) -> String {
        "\(currency)\(Int(value.rounded()))"
    }

    /// "42:07" under an hour, "1:42:07" over — the paused readout, and the
    /// fallback wherever Text(timerInterval:) can't run. Matches formatElapsed()
    /// in lib/closet/court-session.ts so the app and the Island never disagree
    /// by a digit.
    func clock(_ seconds: TimeInterval) -> String {
        let total = max(0, Int(seconds))
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        if h > 0 {
            return String(format: "%d:%02d:%02d", h, m, s)
        }
        return String(format: "%02d:%02d", m, s)
    }
}
