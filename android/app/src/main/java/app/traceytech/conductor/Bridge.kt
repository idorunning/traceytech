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
 * window.Native in the app's own pages (Lists, Settings). Only those two local pages get it;
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
            else Net.call("POST", path, (body ?: "{}").toByteArray(), "application/json")
            if (r.signedOut) main.post { Notifier.signIn(a) }
            if (r.ok && method == "GET") when (path) {
                "/api/lists" -> Cache.put(a, "lists", r.body)
                "/api/todos" -> Cache.put(a, "todos", r.body)
            }
            if (r.ok && method == "POST" && (path == "/api/lists" || path == "/api/todos")) main.post { Sync.now(a) }
            reply(id, r.code, r.body)
        }
    }

    private fun reply(id: Int, code: Int, body: String) =
        js("window.__native&&__native($id,$code,${JSONObject.quote(body)})")

    @JavascriptInterface fun cached(key: String): String = Cache.get(a, key) ?: ""

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

    @JavascriptInterface fun open(tab: String) = main.post { a.show(tab) }.let {}

    @JavascriptInterface
    fun signOut() {
        io.execute {
            Net.call("POST", "/auth/logout", "{}".toByteArray(), "application/json")
            main.post { a.signedOut(); changed() }
        }
    }

    @JavascriptInterface fun openUrl(url: String) { if (url.startsWith("https://")) main.post { a.openExternal(url) } }

    @JavascriptInterface
    fun haptic() = main.post { a.window.decorView.performHapticFeedback(android.view.HapticFeedbackConstants.CONFIRM) }.let {}
}
