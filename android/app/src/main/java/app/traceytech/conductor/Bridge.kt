package app.traceytech.conductor

import android.Manifest
import android.app.AlarmManager
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * window.Native in the app's own pages (Conductor home, Lists, Settings). Only those local pages get it;
 * traceytech.app pages never see it.
 */
class Bridge(private val a: MainActivity) {
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newFixedThreadPool(2)

    private fun js(code: String) = main.post { a.localViews().forEach { it.evaluateJavascript(code, null) } }

    /** Tells the pages that something changed (permissions, fob, sync). */
    fun changed() = js("window.onNativeChange&&onNativeChange()")

    /** fetch-like call to traceytech.app. Answer arrives as window.__native(id, status, body). */
    @JavascriptInterface
    fun request(id: Int, method: String, path: String, body: String?) {
        val ok = path.startsWith("/api/") || path == "/auth/logout"
        if (!ok || method !in setOf("GET", "POST")) { reply(id, 400, "{\"error\":\"Not allowed\"}"); return }
        io.execute {
            val r = if (method == "GET") Net.get(path)
            else Net.call("POST", path, (body ?: "{}").toByteArray(), "application/json",
                timeoutMs = if (path == "/api/conductor" || path == "/api/lenses") 120000 else 30000)  // Conductor thinks twice; lens design tests the site
            if (r.signedOut) main.post { Notifier.signIn(a) }
            if (r.ok && method == "GET") when (path) {
                "/api/lists" -> Cache.put(a, "lists", r.body)
                "/api/todos" -> Cache.put(a, "todos", r.body)
                "/api/google/feed" -> Cache.put(a, "feed", r.body)
                "/api/voice" -> Cache.put(a, "voice", r.body)
                "/api/lenses" -> Cache.put(a, "lenses", r.body)
                "/api/search-console" -> Cache.put(a, "gsc", r.body)
            }
            if (r.ok && method == "POST" && path == "/api/conductor" && body?.contains("\"op\":\"brief\"") == true && r.body.contains("\"headline\""))
                Cache.put(a, "brief", r.body)
            if (r.ok && method == "POST" && path == "/api/lenses" && body?.contains("\"op\":\"refresh\"") == true && !body.contains("\"id\"")) Cache.put(a, "lenses", r.body)
            if (r.ok && method == "POST" && (path == "/api/lists" || path == "/api/todos")) main.post { Sync.now(a) }
            reply(id, r.code, r.body)
        }
    }

    private fun reply(id: Int, code: Int, body: String) =
        js("window.__native&&__native($id,$code,${JSONObject.quote(body)})")

    @JavascriptInterface fun cached(key: String): String = Cache.get(a, key) ?: ""

    /** Which lenses are on, and their order, for the Conductor home: {"order":[...],"off":[...]} */
    @JavascriptInterface fun lensPrefs(): String = Prefs.of(a).getString(Prefs.LENSES, "") ?: ""

    @JavascriptInterface
    fun setLensPrefs(json: String) {
        val ok = try { JSONObject(json); json.length < 4000 } catch (e: Exception) { false }
        if (!ok) return
        Prefs.of(a).edit().putString(Prefs.LENSES, json).apply()
        changed()
    }

    /** Reads Conductor's answer aloud (only when the question was spoken). */
    @JavascriptInterface fun speak(text: String) = main.post { a.speak(text.take(1500)) }.let {}
    @JavascriptInterface fun stopSpeaking() = main.post { a.speak(null) }.let {}

    /** Hold-to-talk on the Conductor chat bar. Answers come back as onMicState(state, detail) and onMicText(text). */
    @JavascriptInterface fun micStart() = main.post { a.conductorMic(true) }.let {}
    @JavascriptInterface fun micStop() = main.post { a.conductorMic(false) }.let {}

    @JavascriptInterface
    fun state(): String {
        val p = Prefs.of(a)
        val am = a.getSystemService(AlarmManager::class.java)
        val pm = a.getSystemService(PowerManager::class.java)
        return JSONObject()
            .put("version", BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")")
            .put("signedIn", Net.signedIn())
            .put("perm", JSONObject()
                .put("notifications", a.has(Manifest.permission.POST_NOTIFICATIONS))
                .put("nearby", FobService.hasPerms(a))
                .put("location", a.has(Manifest.permission.ACCESS_FINE_LOCATION) || a.has(Manifest.permission.ACCESS_COARSE_LOCATION))
                .put("alarms", am.canScheduleExactAlarms())
                .put("battery", pm.isIgnoringBatteryOptimizations(a.packageName)))
            .put("fob", JSONObject()
                .put("on", p.getBoolean(Prefs.FOB_ON, false) && FobService.running)
                .put("connected", FobService.connected)
                .put("status", FobService.status)
                .put("detail", FobService.detail)
                .put("known", p.getString(Prefs.FOB_ADDR, null) != null))
            .put("prefs", JSONObject()
                .put(Prefs.SYNC_MIN, p.getInt(Prefs.SYNC_MIN, 15))
                .put(Prefs.N_REMIND, p.getBoolean(Prefs.N_REMIND, true))
                .put(Prefs.N_CAL, p.getBoolean(Prefs.N_CAL, true))
                .put(Prefs.N_CAL_LEAD, p.getInt(Prefs.N_CAL_LEAD, 10))
                .put(Prefs.N_VOICE, p.getBoolean(Prefs.N_VOICE, true))
                .put(Prefs.N_MAIL, p.getBoolean(Prefs.N_MAIL, true))
                .put(Prefs.N_INVITE, p.getBoolean(Prefs.N_INVITE, true)))
            .put("lastSync", p.getLong(Prefs.LAST_SYNC, 0))
            .put("lastSyncMsg", p.getString(Prefs.LAST_SYNC_MSG, ""))
            .toString()
    }

    @JavascriptInterface
    fun setPref(key: String, value: String) {
        val e = Prefs.of(a).edit()
        when (key) {
            Prefs.SYNC_MIN -> { e.putInt(key, value.toIntOrNull()?.coerceIn(15, 240) ?: 15).apply(); Sync.schedule(a, true); return }
            Prefs.N_CAL_LEAD -> e.putInt(key, value.toIntOrNull()?.coerceIn(0, 120) ?: 10)
            Prefs.N_REMIND, Prefs.N_CAL, Prefs.N_VOICE, Prefs.N_MAIL, Prefs.N_INVITE -> e.putBoolean(key, value == "true")
            else -> return
        }
        e.apply()
        if (key == Prefs.N_CAL_LEAD) Sync.now(a)
    }

    @JavascriptInterface fun permission(what: String) = main.post { a.askPermission(what) }.let {}

    @JavascriptInterface
    fun fob(action: String) = main.post {
        when (action) {
            "toggle" -> a.toggleFob()
            "forget" -> FobService.forget(a)
            "open" -> a.show(MainActivity.TAB_VOICE)
        }
        changed()
    }.let {}

    @JavascriptInterface fun syncNow() = Sync.now(a)

    @JavascriptInterface fun open(tab: String) = main.post { if (tab == "site") a.openSite() else a.show(tab) }.let {}

    @JavascriptInterface
    fun signOut() {
        io.execute {
            Net.call("POST", "/auth/logout", "{}".toByteArray(), "application/json")
            main.post { a.signedOut(); changed() }
        }
    }

    @JavascriptInterface fun openUrl(url: String) { if (url.startsWith("https://")) main.post { a.openExternal(url) } }

    /** Saves an exported list (CSV or Markdown) and opens the share sheet: Drive, Gmail, Sheets, Files… */
    @JavascriptInterface
    fun share(name: String, mime: String, text: String) {
        val safe = name.replace(Regex("[^A-Za-z0-9 ._-]"), "").trim().take(60).ifEmpty { "list.txt" }
        val type = if (mime == "text/csv" || mime == "text/markdown") mime else "text/plain"
        main.post {
            try {
                val dir = java.io.File(a.cacheDir, "exports").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
                val f = java.io.File(dir, safe).apply { writeText(text) }
                val uri = androidx.core.content.FileProvider.getUriForFile(a, a.packageName + ".files", f)
                val send = android.content.Intent(android.content.Intent.ACTION_SEND).setType(type)
                    .putExtra(android.content.Intent.EXTRA_STREAM, uri)
                    .putExtra(android.content.Intent.EXTRA_SUBJECT, safe)
                    .addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
                a.startActivity(android.content.Intent.createChooser(send, "Share $safe"))
            } catch (e: Exception) {
                a.localViews().forEach { it.evaluateJavascript("window.toast&&toast('Could not share the list')", null) }
            }
        }
    }

    @JavascriptInterface
    fun haptic() = main.post { a.window.decorView.performHapticFeedback(android.view.HapticFeedbackConstants.CONFIRM) }.let {}
}
