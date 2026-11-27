package app.traceytech.conductor

import android.webkit.CookieManager
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Talks to traceytech.app as the signed-in WebView does: same cookies, same Origin.
 * The Worker refreshes an expired access token and sends new cookies back; we hand
 * those to the WebView's cookie store so the page and the background code stay on
 * one session (Supabase rotates refresh tokens, so two copies would log each other out).
 */
object Net {
    const val ORIGIN = "https://traceytech.app"
    private val lock = Any()

    class Res(val code: Int, val body: String) {
        val ok get() = code in 200..299
        fun json(): JSONObject = try { JSONObject(body) } catch (e: Exception) { JSONObject() }
        val signedOut get() = code == 401
    }

    fun signedIn(): Boolean {
        val c = CookieManager.getInstance().getCookie(ORIGIN) ?: return false
        return c.contains("__Host-tt_rt=") || c.contains("__Host-tt_at=")
    }

    fun get(path: String): Res = call("GET", path, null, null)
    fun postJson(path: String, body: JSONObject): Res =
        call("POST", path, body.toString().toByteArray(), "application/json")

    fun call(method: String, path: String, body: ByteArray?, type: String?, extra: Map<String, String> = emptyMap(), timeoutMs: Int = 30000): Res =
        synchronized(lock) {
            val cm = CookieManager.getInstance()
            val conn = (URL(ORIGIN + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                instanceFollowRedirects = false
                connectTimeout = 15000
                readTimeout = timeoutMs
                useCaches = false
                setRequestProperty("Accept", "application/json")
                setRequestProperty("User-Agent", "ConductorIO/${BuildConfig.VERSION_NAME} (Android)")
                cm.getCookie(ORIGIN)?.let { setRequestProperty("Cookie", it) }
                if (method != "GET") {
                    // The Worker checks these on every change
                    setRequestProperty("Origin", ORIGIN)
                    setRequestProperty("Sec-Fetch-Site", "same-origin")
                }
                type?.let { setRequestProperty("Content-Type", it) }
                extra.forEach { (k, v) -> setRequestProperty(k, v) }
            }
            try {
                if (body != null) {
                    conn.doOutput = true
                    conn.setFixedLengthStreamingMode(body.size)
                    conn.outputStream.use { it.write(body) }
                }
                val code = conn.responseCode
                conn.headerFields.entries
                    .filter { it.key != null && it.key.equals("Set-Cookie", true) }
                    .flatMap { it.value }
                    .forEach { cm.setCookie(ORIGIN, it) }
                cm.flush()
                val stream = if (code >= 400) conn.errorStream else conn.inputStream
                val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
                Res(code, text)
            } catch (e: Exception) {
                Res(-1, JSONObject().put("error", "No connection: ${e.message ?: e.javaClass.simpleName}").toString())
            } finally {
                conn.disconnect()
            }
        }
}
