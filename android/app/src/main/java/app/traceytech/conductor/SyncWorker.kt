package app.traceytech.conductor

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Runs every 15 minutes (or as set): fetches to-dos, voice notes and Google, sets alarms, posts notifications. */
class SyncWorker(c: Context, p: WorkerParameters) : CoroutineWorker(c, p) {

    override suspend fun doWork(): Result {
        val c = applicationContext
        val p = Prefs.of(c)
        if (!Net.signedIn()) { note(c, "Not signed in"); return Result.success() }
        val alarms = mutableListOf<Alarms.Alarm>()
        var problems = 0

        // To-dos (with lists when the server has them)
        val lists = Net.get("/api/lists")
        val todos: JSONArray
        if (lists.signedOut) { Notifier.signIn(c); note(c, "Signed out"); return Result.success() }
        if (lists.ok) {
            Cache.put(c, "lists", lists.body)
            todos = lists.json().optJSONArray("todos") ?: JSONArray()
        } else {
            val t = Net.get("/api/todos")
            if (t.signedOut) { Notifier.signIn(c); note(c, "Signed out"); return Result.success() }
            if (t.ok) Cache.put(c, "todos", t.body) else problems++
            todos = t.json().optJSONArray("rows") ?: JSONArray()
        }
        val names = HashMap<Long, String>()
        lists.json().optJSONArray("lists")?.let { a -> for (i in 0 until a.length()) a.optJSONObject(i)?.let { names[it.optLong("id")] = it.optString("name") } }
        for (i in 0 until todos.length()) {
            val t = todos.optJSONObject(i) ?: continue
            if (t.optString("state", "open") != "open") continue
            val at = Due.parse(t.optString("due")) ?: continue
            val list = names[t.optLong("list")] ?: t.optString("cat").replaceFirstChar { it.uppercase() }
            alarms += Alarms.Alarm("todo:" + t.optLong("id") + ":" + at, at, "todo", t.optString("text"),
                "Due now" + (if (list.isNotBlank()) " · $list" else ""), t.optLong("id"))
        }

        // Voice notes that wait for a press (calendar events and emails)
        val v = Net.get("/api/voice")
        if (v.ok) {
            val seen = seenSet(c, "seen_voice")
            val rows = v.json().optJSONArray("rows") ?: JSONArray()
            for (i in 0 until rows.length()) {
                val n = rows.optJSONObject(i) ?: continue
                val id = n.optLong("id").toString()
                if (n.optString("state") == "pending" && id !in seen) {
                    seen += id
                    if (p.getBoolean(Prefs.N_VOICE, true)) Notifier.post(c, 6000 + (n.optLong("id") % 900).toInt(), Notif.CH_VOICE,
                        if (n.optString("intent") == "email_draft") "Email ready to check" else "Calendar event ready to check",
                        n.optString("summary").ifEmpty { n.optString("transcript") } + "\nTap to confirm it.", MainActivity.TAB_VOICE)
                }
            }
            saveSet(c, "seen_voice", seen)
        } else problems++

        // Google: upcoming events, new invites, new email
        val g = Net.get("/api/google/feed")
        if (g.ok) {
            val j = g.json()
            Cache.put(c, "feed", g.body)
            val lead = p.getInt(Prefs.N_CAL_LEAD, 10).toLong()
            val fmt = DateTimeFormatter.ofPattern("HH:mm")
            j.optJSONArray("events")?.let { ev ->
                for (i in 0 until ev.length()) {
                    val e = ev.optJSONObject(i) ?: continue
                    if (e.optBoolean("allDay")) continue
                    val start = Due.instant(e.optString("start")) ?: continue
                    val local = java.time.Instant.ofEpochMilli(start).atZone(ZoneId.systemDefault())
                    val where = e.optString("where")
                    alarms += Alarms.Alarm("cal:" + e.optString("id") + ":" + start, start - lead * 60_000, "cal",
                        e.optString("title"), "Starts at " + local.format(fmt) + (if (where.isNotBlank()) " · $where" else ""))
                }
            }
            val firstRun = !p.getBoolean("seeded_google", false)
            j.optJSONArray("invites")?.let { inv ->
                val seen = seenSet(c, "seen_inv")
                for (i in 0 until inv.length()) {
                    val e = inv.optJSONObject(i) ?: continue
                    val k = e.optString("id"); if (k in seen) continue
                    seen += k
                    if (!firstRun && p.getBoolean(Prefs.N_INVITE, true)) Notifier.post(c, 7000 + (k.hashCode() and 0x3ff), Notif.CH_CAL,
                        "New invite: " + e.optString("title"), listOf(e.optString("org"), e.optString("start").take(16).replace('T', ' ')).filter { it.isNotBlank() }.joinToString(" · "), MainActivity.TAB_HOME)
                }
                saveSet(c, "seen_inv", seen)
            }
            j.optJSONArray("emails")?.let { em ->
                val seen = seenSet(c, "seen_mail")
                for (i in 0 until em.length()) {
                    val e = em.optJSONObject(i) ?: continue
                    val k = e.optString("id"); if (k in seen) continue
                    seen += k
                    if (!firstRun && !e.optBoolean("bulk") && p.getBoolean(Prefs.N_MAIL, true)) Notifier.post(c, 8000 + (k.hashCode() and 0x3ff), Notif.CH_MAIL,
                        e.optString("from").substringBefore('<').trim().trim('"').ifEmpty { "New email" },
                        e.optString("subject") + "\n" + e.optString("snippet"), MainActivity.TAB_HOME)
                }
                saveSet(c, "seen_mail", seen)
            }
            p.edit().putBoolean("seeded_google", true).apply()
        } else if (g.code != 409) problems++ // 409 = Google not connected, which is fine

        Alarms.replaceAll(c, alarms)
        note(c, if (problems == 0) "Up to date" else "Partly updated ($problems source${if (problems > 1) "s" else ""} failed)")
        return Result.success()
    }

    private fun note(c: Context, msg: String) {
        Prefs.of(c).edit().putLong(Prefs.LAST_SYNC, System.currentTimeMillis()).putString(Prefs.LAST_SYNC_MSG, msg).apply()
    }

    private fun seenSet(c: Context, k: String): MutableSet<String> =
        (Prefs.of(c).getStringSet(k, emptySet()) ?: emptySet()).toMutableSet()

    private fun saveSet(c: Context, k: String, s: MutableSet<String>) {
        // keep the newest few hundred
        val trimmed = if (s.size > 400) s.toList().takeLast(400).toSet() else s
        Prefs.of(c).edit().putStringSet(k, trimmed).apply()
    }
}

/** When a to-do is due. TraceyTech stores "2026-11-28", "2026-11-28T14:30", full ISO times, or words like "today". */
object Due {
    fun parse(s: String?): Long? {
        val t = s?.trim().orEmpty()
        if (t.isEmpty()) return null
        instant(t)?.let { return it }
        return try {
            LocalDate.parse(t.take(10)).atTime(LocalTime.of(9, 0)).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        } catch (e: Exception) { null }
    }

    fun instant(s: String?): Long? {
        val t = s?.trim().orEmpty()
        if (t.length < 16) return null
        return try { OffsetDateTime.parse(t).toInstant().toEpochMilli() } catch (e: Exception) {
            try { java.time.Instant.parse(t).toEpochMilli() } catch (e: Exception) {
                try { LocalDateTime.parse(t.take(19).let { if (it.length == 16) "$it:00" else it }).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli() } catch (e: Exception) { null }
            }
        }
    }
}

/** Last good copy of each feed, so the Lists screen opens instantly and offline. */
object Cache {
    fun put(c: Context, k: String, body: String) = try { File(c.filesDir, "cache_$k.json").writeText(body) } catch (_: Exception) {}
    fun get(c: Context, k: String): String? = try { File(c.filesDir, "cache_$k.json").takeIf { it.exists() }?.readText() } catch (_: Exception) { null }
}
