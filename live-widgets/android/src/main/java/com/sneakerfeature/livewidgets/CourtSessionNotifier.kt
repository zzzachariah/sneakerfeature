package com.sneakerfeature.livewidgets

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

// Android's answer to the Dynamic Island: an ongoing notification whose
// chronometer counts the run.
//
// There is no system-level equivalent of the Island. What Android does have is
// setUsesChronometer(), where SystemUI itself ticks the clock from a timestamp —
// the same trick as Text(timerInterval:) on iOS, and the same payoff: correct
// with our process asleep, no updates pushed, no battery spent.
//
// Deliberately NOT a foreground service. A notification is owned by
// NotificationManager and survives our process dying, which is all this needs;
// a foreground service would buy nothing here and, since Android 14, would drag
// in a declared service type and its own review questions.
//
// Vendor capsules — MIUI's 灵动岛, HarmonyOS 实时窗, OPPO/vivo 实况通知 — each
// need their own SDK and per-app registration with that vendor. This is the
// portable floor that works on every device today; those are additive later.
//
// ⚠️ UNVERIFIED — written without an Android SDK/device.
object CourtSessionNotifier {
    const val CHANNEL_ID = "sf_court_session"
    const val NOTIFICATION_ID = 4711

    const val ACTION_END = "com.sneakerfeature.livewidgets.END_SESSION"
    const val EXTRA_SESSION_ID = "sessionId"

    fun show(context: Context, session: JSONObject, zh: Boolean) {
        val app = context.applicationContext
        if (!NotificationManagerCompat.from(app).areNotificationsEnabled()) {
            // Android 13+ without POST_NOTIFICATIONS granted. The in-app timer
            // is unaffected — only this mirror of it is missing.
            return
        }
        ensureChannel(app, zh)

        val sessionId = session.optString("id")
        val shoeName = session.optString("shoeName")
        val displayStart = WidgetStore.sessionDisplayStart(session)
        val running = displayStart != null

        val builder = NotificationCompat.Builder(app, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_sf_court_timer)
            .setContentTitle(if (shoeName.isNotEmpty()) shoeName else if (zh) "打球计时" else "Court timer")
            .setOngoing(true)
            // Re-posting to update the title must not buzz the phone every time.
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openAppIntent(app))

        if (running) {
            // SystemUI runs the clock from this timestamp. `when` is pushed back
            // by the time already banked so a paused-and-resumed session keeps
            // counting from where it left off instead of restarting at zero.
            builder.setUsesChronometer(true)
                .setWhen(displayStart!!)
                .setShowWhen(true)
                .setContentText(if (zh) "打球中" else "Playing")
        } else {
            val elapsed = WidgetStore.sessionElapsedMs(session, System.currentTimeMillis())
            builder.setUsesChronometer(false)
                .setShowWhen(false)
                .setContentText(
                    (if (zh) "已暂停 · " else "Paused · ") + formatClock(elapsed)
                )
        }

        builder.addAction(
            NotificationCompat.Action(
                R.drawable.ic_sf_stop,
                if (zh) "结束" else "End",
                endIntent(app, sessionId)
            )
        )

        NotificationManagerCompat.from(app).notify(NOTIFICATION_ID, builder.build())
    }

    fun clear(context: Context) {
        NotificationManagerCompat.from(context.applicationContext).cancel(NOTIFICATION_ID)
    }

    private fun ensureChannel(context: Context, zh: Boolean) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            if (zh) "打球计时" else "Court timer",
            // LOW: it must be visible and persistent, never a sound or a
            // heads-up banner. Someone mid-run does not want to be buzzed.
            NotificationManager.IMPORTANCE_LOW
        )
        channel.setShowBadge(false)
        channel.description =
            if (zh) "进行中的打球计时会一直显示在通知栏。" else "Keeps a running court session in your notification shade."
        manager.createNotificationChannel(channel)
    }

    private fun endIntent(context: Context, sessionId: String): PendingIntent {
        val intent = Intent(context, CourtSessionReceiver::class.java).apply {
            action = ACTION_END
            putExtra(EXTRA_SESSION_ID, sessionId)
            // Explicit package so this can't be intercepted by another app.
            setPackage(context.packageName)
        }
        return PendingIntent.getBroadcast(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun openAppIntent(context: Context): PendingIntent {
        // Same deep link the widgets use, so tapping the notification lands on
        // the closet rather than wherever the app happened to be.
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("sneakerfeature://closet")).apply {
            setPackage(context.packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        return PendingIntent.getActivity(
            context,
            1,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    /** Mirrors formatElapsed() in lib/closet/court-session.ts. */
    fun formatClock(millis: Long): String {
        val total = (millis / 1000).coerceAtLeast(0L)
        val h = total / 3600
        val m = (total % 3600) / 60
        val s = total % 60
        return if (h > 0) String.format("%d:%02d:%02d", h, m, s) else String.format("%02d:%02d", m, s)
    }
}
