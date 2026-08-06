package com.sneakerfeature.livewidgets

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

// The Android half of the LiveWidgets bridge — same JS surface as iOS
// (lib/native/live-widgets.ts), so the web layer never branches on platform.
//
// What differs is what's behind it. Android has home-screen widgets, so those
// methods do real work. It has no Dynamic Island and no Live Activities, so
// isAvailable() reports liveActivities:false and the picker methods are honest
// no-ops — the web app hides those settings rows rather than offering a switch
// that can't do anything. The court session still gets a surface: an ongoing
// notification whose chronometer counts the run (CourtSessionNotifier).
//
// ⚠️ UNVERIFIED — written without an Android SDK/device.
@CapacitorPlugin(name = "LiveWidgets")
class LiveWidgetsPlugin : Plugin() {

    /// Cached shoe images are capped on their long edge — home-screen widgets
    /// are small, and RemoteViews bitmaps cross a Binder transaction with a
    /// hard size limit.
    private val maxImageEdge = 480

    private val io = Executors.newSingleThreadExecutor()

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val result = JSObject()
        result.put("available", true)
        result.put("widgets", true)
        // No system-level Live Activity on Android. Vendor capsules (MIUI 灵动岛,
        // HarmonyOS 实时窗, OPPO/vivo 实况通知) each need their own SDK and a
        // per-app registration with that vendor — not something to claim here.
        result.put("liveActivities", false)
        call.resolve(result)
    }

    // MARK: - Snapshot

    @PluginMethod
    fun publishSnapshot(call: PluginCall) {
        val json = call.getString("json")
        if (json.isNullOrEmpty()) {
            call.resolve()
            return
        }
        WidgetStore.saveSnapshot(context, json)
        ClosetWidgetProvider.refresh(context)
        call.resolve()
    }

    @PluginMethod
    fun cacheImage(call: PluginCall) {
        val key = call.getString("key")
        val url = call.getString("url")
        if (key.isNullOrEmpty() || url.isNullOrEmpty() || !url.startsWith("http")) {
            call.resolve(fileResult(null))
            return
        }
        val file = "${sanitize(key)}.png"
        val target = WidgetStore.imageFile(context, file)
        if (target == null) {
            call.resolve(fileResult(null))
            return
        }
        if (target.exists()) {
            call.resolve(fileResult(file))
            return
        }

        io.execute {
            val ok = download(url, target)
            call.resolve(fileResult(if (ok) file else null))
        }
    }

    /**
     * JSONObject.put(name, null) *removes* the key, and a bare Kotlin `null` is
     * ambiguous across the put() overloads anyway. JSONObject.NULL is the one
     * value that reaches JS as an explicit null, which is what the web side
     * checks for.
     */
    private fun fileResult(file: String?): JSObject =
        JSObject().apply { put("file", file ?: JSONObject.NULL) }

    @PluginMethod
    fun pruneImages(call: PluginCall) {
        val keep = mutableSetOf<String>()
        call.getArray("keep")?.let { array ->
            for (i in 0 until array.length()) {
                (array.opt(i) as? String)?.let { keep.add(it) }
            }
        }
        // An empty keep-list means "this snapshot had no images", not "delete
        // the cache" — pruning on it would wipe the pictures still on screen.
        WidgetStore.pruneImages(context, keep)
        call.resolve()
    }

    // MARK: - Court session

    @PluginMethod
    fun startCourtSession(call: PluginCall) {
        val id = call.getString("id")
        val shoeId = call.getString("shoeId")
        if (id.isNullOrEmpty() || shoeId.isNullOrEmpty()) {
            call.resolve()
            return
        }
        val startedAt = call.getDouble("startedAt")?.toLong() ?: System.currentTimeMillis()
        val session = JSONObject().apply {
            put("id", id)
            put("shoeId", shoeId)
            put("shoeName", call.getString("shoeName") ?: "")
            put("shoeBrand", call.getString("shoeBrand") ?: "")
            put("imageFile", call.getString("imageFile"))
            put("startedAt", startedAt)
            put("runningSince", startedAt)
            put("accumulatedMs", 0L)
        }
        WidgetStore.saveSession(context, session)
        CourtSessionNotifier.show(context, session, isChinese())
        ClosetWidgetProvider.refresh(context)
        call.resolve()
    }

    @PluginMethod
    fun updateCourtSession(call: PluginCall) {
        val id = call.getString("id")
        val session = WidgetStore.loadSession(context)
        if (id.isNullOrEmpty() || session == null || session.optString("id") != id) {
            call.resolve()
            return
        }
        // A JS null means "paused"; 0 would be a real (if nonsensical) instant,
        // so the absent case has to be distinguished from zero.
        val runningSince = call.getDouble("runningSince")?.toLong() ?: 0L
        session.put("runningSince", runningSince)
        session.put("accumulatedMs", (call.getDouble("accumulatedMs") ?: 0.0).toLong().coerceAtLeast(0L))

        WidgetStore.saveSession(context, session)
        CourtSessionNotifier.show(context, session, isChinese())
        ClosetWidgetProvider.refresh(context)
        call.resolve()
    }

    @PluginMethod
    fun endCourtSession(call: PluginCall) {
        WidgetStore.saveSession(context, null)
        CourtSessionNotifier.clear(context)
        ClosetWidgetProvider.refresh(context)
        call.resolve()
    }

    @PluginMethod
    fun getCourtSession(call: PluginCall) {
        val session = WidgetStore.loadSession(context)
        if (session == null) {
            call.resolve(JSObject().apply { put("session", JSONObject.NULL) })
            return
        }
        val runningSince = session.optLong("runningSince", 0L)
        val payload = JSObject().apply {
            put("id", session.optString("id"))
            put("shoeId", session.optString("shoeId"))
            put("shoeName", session.optString("shoeName"))
            put("shoeBrand", session.optString("shoeBrand"))
            put("startedAt", session.optLong("startedAt", 0L))
            // Paused. Null, not 0 — the web side treats 0 as a real timestamp.
            put("runningSince", if (runningSince > 0L) runningSince else JSONObject.NULL)
            put("accumulatedMs", session.optLong("accumulatedMs", 0L))
        }
        call.resolve(JSObject().apply { put("session", payload) })
    }

    @PluginMethod
    fun takePendingCourtIntents(call: PluginCall) {
        val queue = WidgetStore.takePendingIntents(context)
        // JSArray.from() takes a Java array / Collection, not a JSONArray, so
        // the queue is copied element by element.
        val intents = JSArray()
        for (i in 0 until queue.length()) intents.put(queue.opt(i))
        call.resolve(JSObject().apply { put("intents", intents) })
    }

    // MARK: - Smart Picker (no Android equivalent)

    @PluginMethod
    fun startPickerActivity(call: PluginCall) {
        call.resolve()
    }

    @PluginMethod
    fun endPickerActivity(call: PluginCall) {
        call.resolve()
    }

    // MARK: - Helpers

    private fun isChinese(): Boolean =
        WidgetStore.loadSnapshot(context)?.optString("locale", "en")?.startsWith("zh") == true

    private fun sanitize(key: String): String {
        val cleaned = key.filter { it.isLetterOrDigit() }
        return if (cleaned.isEmpty()) "img" else cleaned.take(40)
    }

    private fun download(url: String, target: File): Boolean {
        var connection: HttpURLConnection? = null
        return try {
            connection = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 12_000
                readTimeout = 12_000
                instanceFollowRedirects = true
            }
            if (connection.responseCode !in 200..299) return false
            val source = connection.inputStream.use { BitmapFactory.decodeStream(it) } ?: return false
            val scaled = downscale(source)
            target.outputStream().use { out ->
                // PNG, not JPEG: shoe cut-outs are transparent (the site runs a
                // background-removal pass), and flattening them onto white would
                // put a light box around every shoe on a dark home screen.
                scaled.compress(Bitmap.CompressFormat.PNG, 100, out)
            }
            true
        } catch (_: Exception) {
            target.delete()
            false
        } finally {
            connection?.disconnect()
        }
    }

    private fun downscale(source: Bitmap): Bitmap {
        val longEdge = maxOf(source.width, source.height)
        if (longEdge <= maxImageEdge || longEdge == 0) return source
        val ratio = maxImageEdge.toDouble() / longEdge
        return Bitmap.createScaledBitmap(
            source,
            (source.width * ratio).toInt().coerceAtLeast(1),
            (source.height * ratio).toInt().coerceAtLeast(1),
            true
        )
    }
}
