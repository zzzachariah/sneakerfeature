package com.sneakerfeature.livewidgets

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject

// Handles 结束 from the ongoing notification, with the app closed.
//
// Same hand-off as the iOS App Intents: native can stop the clock, but it can't
// write the wear log — that needs the session cookie, which only the WebView
// has. So this records what happened in the shared queue and the app's next
// resume drains it and posts to /api/closet/wear.
//
// ⚠️ UNVERIFIED — written without an Android SDK/device.
class CourtSessionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != CourtSessionNotifier.ACTION_END) return

        val session = WidgetStore.loadSession(context)
        if (session == null) {
            CourtSessionNotifier.clear(context)
            return
        }

        // A stale notification (left over from a previous run) must not be able
        // to end the session that replaced it.
        val requested = intent.getStringExtra(CourtSessionNotifier.EXTRA_SESSION_ID)
        if (!requested.isNullOrEmpty() && requested != session.optString("id")) return

        val now = System.currentTimeMillis()
        val elapsed = WidgetStore.sessionElapsedMs(session, now)

        WidgetStore.appendPendingIntent(
            context,
            JSONObject().apply {
                put("kind", "end")
                put("sessionId", session.optString("id"))
                put("shoeId", session.optString("shoeId"))
                put("at", now)
                put("elapsedMs", elapsed)
            }
        )
        WidgetStore.saveSession(context, null)
        CourtSessionNotifier.clear(context)
        ClosetWidgetProvider.refresh(context)
    }
}
