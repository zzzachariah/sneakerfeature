package com.sneakerfeature.livewidgets

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

// Where the widget's data lives on Android.
//
// Much simpler than the iOS side: an AppWidgetProvider is a BroadcastReceiver in
// the *same* app process, so it can read ordinary SharedPreferences and the
// ordinary files dir. No App Group, no container, no sandbox hop — everything
// the iOS code needs WidgetShared for is just `context` here.
//
// The JSON shape is identical to the one lib/widgets/snapshot.ts publishes, so
// both platforms read the same contract. Parsing is org.json rather than a
// serialization library to keep this module dependency-free; every read is
// null-tolerant for the same reason as iOS — the site updates long before the
// app does.
//
// ⚠️ UNVERIFIED — written without an Android SDK/device.
object WidgetStore {
    private const val PREFS = "sf_live_widgets"
    private const val KEY_SNAPSHOT = "snapshot.v1"
    private const val KEY_SESSION = "courtSession.v1"
    private const val KEY_PENDING = "pendingCourtIntents.v1"
    private const val IMAGES_DIR = "widget-images"
    private const val MAX_PENDING = 32

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    // --- Snapshot ------------------------------------------------------------

    fun saveSnapshot(context: Context, json: String) {
        prefs(context).edit().putString(KEY_SNAPSHOT, json).apply()
    }

    fun loadSnapshot(context: Context): JSONObject? {
        val raw = prefs(context).getString(KEY_SNAPSHOT, null) ?: return null
        return try {
            val parsed = JSONObject(raw)
            // A snapshot from a newer web build may mean something else; showing
            // the empty state beats showing a confident wrong number.
            if (parsed.optInt("v", 0) != 1) null else parsed
        } catch (_: Exception) {
            null
        }
    }

    // --- Images --------------------------------------------------------------

    fun imagesDir(context: Context): File {
        val dir = File(context.applicationContext.filesDir, IMAGES_DIR)
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    fun imageFile(context: Context, name: String?): File? {
        if (name.isNullOrEmpty() || name.contains('/') || name.contains("..")) return null
        return File(imagesDir(context), name)
    }

    fun loadBitmap(context: Context, name: String?): Bitmap? {
        val file = imageFile(context, name) ?: return null
        if (!file.exists()) return null
        return try {
            BitmapFactory.decodeFile(file.absolutePath)
        } catch (_: Exception) {
            null
        }
    }

    fun pruneImages(context: Context, keep: Set<String>) {
        if (keep.isEmpty()) return
        imagesDir(context).listFiles()?.forEach { file ->
            if (!keep.contains(file.name)) file.delete()
        }
    }

    // --- Court session -------------------------------------------------------

    fun saveSession(context: Context, session: JSONObject?) {
        val editor = prefs(context).edit()
        if (session == null) editor.remove(KEY_SESSION) else editor.putString(KEY_SESSION, session.toString())
        editor.apply()
    }

    fun loadSession(context: Context): JSONObject? {
        val raw = prefs(context).getString(KEY_SESSION, null) ?: return null
        return try {
            JSONObject(raw)
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Total elapsed millis of a stored session, including the leg still running.
     * Mirrors elapsedMs() in lib/closet/court-session.ts.
     */
    fun sessionElapsedMs(session: JSONObject, now: Long): Long {
        val accumulated = session.optLong("accumulatedMs", 0L)
        val runningSince = session.optLong("runningSince", 0L)
        val live = if (runningSince > 0L) (now - runningSince).coerceAtLeast(0L) else 0L
        return (accumulated + live).coerceAtLeast(0L)
    }

    /**
     * The instant a clock showing TOTAL elapsed time would have started from —
     * what Notification.setWhen() needs so its chronometer counts the whole
     * session rather than only the current leg.
     */
    fun sessionDisplayStart(session: JSONObject): Long? {
        val runningSince = session.optLong("runningSince", 0L)
        if (runningSince <= 0L) return null
        return runningSince - session.optLong("accumulatedMs", 0L)
    }

    // --- Pending intents -----------------------------------------------------

    /** Something the user did outside the WebView; the app drains this on resume. */
    fun appendPendingIntent(context: Context, intent: JSONObject) {
        val queue = loadPendingArray(context)
        queue.put(intent)
        // Bounded: an app that never reopens shouldn't grow this forever.
        val trimmed = if (queue.length() > MAX_PENDING) {
            JSONArray().also { out ->
                for (i in (queue.length() - MAX_PENDING) until queue.length()) out.put(queue.get(i))
            }
        } else {
            queue
        }
        prefs(context).edit().putString(KEY_PENDING, trimmed.toString()).apply()
    }

    fun takePendingIntents(context: Context): JSONArray {
        val queue = loadPendingArray(context)
        prefs(context).edit().remove(KEY_PENDING).apply()
        return queue
    }

    private fun loadPendingArray(context: Context): JSONArray {
        val raw = prefs(context).getString(KEY_PENDING, null) ?: return JSONArray()
        return try {
            JSONArray(raw)
        } catch (_: Exception) {
            JSONArray()
        }
    }
}
