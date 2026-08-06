package com.sneakerfeature.livewidgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import kotlin.math.roundToInt

// 战靴里程 on the Android home screen.
//
// One widget, not four. iOS gets the full set because widgets there are a
// first-class habit; on Android the honest highest-value slot is the same one
// that matters most on iOS — this week's court hours and the pair you're in —
// and shipping one that's right beats four that are approximate.
//
// A progress BAR, not a ring: RemoteViews has ProgressBar built in, and drawing
// a ring would mean rasterising a bitmap on every update. A bar is also the
// native idiom here, the same way a ring is on iOS.
//
// ⚠️ UNVERIFIED — written without an Android SDK/device.
class ClosetWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) {
            manager.updateAppWidget(id, buildViews(context))
        }
    }

    companion object {
        /// Asks the launcher to redraw every instance of this widget.
        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context) ?: return
            val component = ComponentName(context, ClosetWidgetProvider::class.java)
            val ids = manager.getAppWidgetIds(component)
            if (ids.isEmpty()) return
            val views = buildViews(context)
            for (id in ids) manager.updateAppWidget(id, views)
        }

        private fun buildViews(context: Context): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_closet)
            val snapshot = WidgetStore.loadSnapshot(context)
            val zh = snapshot?.optString("locale", "en")?.startsWith("zh") == true
            val closetEnabled = snapshot
                ?.optJSONObject("features")
                ?.optBoolean("closet", true) ?: true
            val closet = if (closetEnabled) snapshot?.optJSONObject("closet") else null

            views.setOnClickPendingIntent(R.id.widget_root, openIntent(context, closet))

            if (closet == null) {
                views.setViewVisibility(R.id.widget_body, View.GONE)
                views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
                views.setTextViewText(
                    R.id.widget_empty,
                    when {
                        !closetEnabled -> if (zh) "已在设置中关闭" else "Turned off in Settings"
                        snapshot?.optBoolean("signedIn", false) == false ->
                            if (zh) "登录后追踪你的轮换" else "Sign in to track your rotation"
                        else -> if (zh) "添加一双开始追踪" else "Add a pair to start tracking"
                    }
                )
                return views
            }

            views.setViewVisibility(R.id.widget_body, View.VISIBLE)
            views.setViewVisibility(R.id.widget_empty, View.GONE)

            val weekHours = closet.optDouble("weekHours", 0.0)
            val goalHours = closet.optDouble("weekGoalHours", 6.0).coerceAtLeast(0.1)
            val session = WidgetStore.loadSession(context)

            views.setTextViewText(R.id.widget_label, if (zh) "本周" else "This week")
            views.setTextViewText(
                R.id.widget_headline,
                if (session != null) {
                    CourtSessionNotifier.formatClock(
                        WidgetStore.sessionElapsedMs(session, System.currentTimeMillis())
                    )
                } else {
                    "${formatHours(weekHours)} / ${formatHours(goalHours)}"
                }
            )
            views.setProgressBar(
                R.id.widget_progress,
                100,
                ((weekHours / goalHours).coerceIn(0.0, 1.0) * 100).roundToInt(),
                false
            )

            val shoeName = closet.optString("shoeName")
            views.setTextViewText(
                R.id.widget_shoe,
                if (shoeName.isNotEmpty()) shoeName else if (zh) "轮换" else "Rotation"
            )
            views.setTextViewText(
                R.id.widget_stats,
                buildString {
                    append(formatHours(closet.optDouble("totalHours", 0.0)))
                    append(" · ")
                    append(closet.optInt("totalSessions", 0))
                    append(if (zh) " 场" else " runs")
                    val cost = closet.optDouble("costPerSession", Double.NaN)
                    if (!cost.isNaN() && cost > 0) {
                        append(" · ")
                        append(closet.optString("currency", "¥"))
                        append(cost.roundToInt())
                    }
                }
            )

            val bitmap = WidgetStore.loadBitmap(context, closet.optJSONObject("image")?.optString("file"))
            if (bitmap != null) {
                views.setImageViewBitmap(R.id.widget_shoe_image, bitmap)
                views.setViewVisibility(R.id.widget_shoe_image, View.VISIBLE)
            } else {
                views.setViewVisibility(R.id.widget_shoe_image, View.GONE)
            }

            return views
        }

        /// Taps land on the same in-app path the iOS widget uses, through the
        /// custom scheme the shell already registers (see MOBILE.md §7).
        private fun openIntent(context: Context, closet: JSONObject?): PendingIntent {
            val path = closet?.optString("path")?.takeIf { it.startsWith("/") } ?: "/closet"
            val intent = Intent(
                Intent.ACTION_VIEW,
                Uri.parse("sneakerfeature://" + path.removePrefix("/"))
            ).apply {
                setPackage(context.packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            return PendingIntent.getActivity(
                context,
                2,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        /** "12.5h", trailing ".0" dropped. Mirrors WidgetCopy.hours on iOS. */
        private fun formatHours(value: Double): String {
            val rounded = Math.round(value * 10) / 10.0
            return if (rounded == Math.floor(rounded)) "${rounded.toInt()}h" else String.format("%.1fh", rounded)
        }
    }
}
