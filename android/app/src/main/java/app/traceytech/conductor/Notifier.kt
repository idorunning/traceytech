package app.traceytech.conductor

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import org.json.JSONObject
import java.util.concurrent.Executors

object Notifier {
    private fun nm(c: Context) = c.getSystemService(NotificationManager::class.java)
    fun allowed(c: Context) = c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun openIntent(c: Context, tab: String, req: Int): PendingIntent = PendingIntent.getActivity(
        c, req,
        Intent(c, MainActivity::class.java).putExtra(MainActivity.EXTRA_TAB, tab)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    fun post(c: Context, id: Int, ch: String, title: String, text: String, tab: String, vararg actions: Notification.Action) {
        if (!allowed(c)) return
        val b = Notification.Builder(c, ch)
            .setSmallIcon(R.drawable.ic_stat)
            .setColor(0xFFE5322B.toInt())
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setContentIntent(openIntent(c, tab, id))
        actions.forEach { b.addAction(it) }
        nm(c).notify(id, b.build())
    }

    fun signIn(c: Context) {
        val p = Prefs.of(c)
        if (System.currentTimeMillis() - p.getLong("signin_warned", 0) < 6 * 3600_000) return
        p.edit().putLong("signin_warned", System.currentTimeMillis()).apply()
        post(c, 9001, Notif.CH_ACCOUNT, "Sign in to TraceyTech again",
            "Your session has ended, so reminders and voice notes are paused. Tap to sign in.", MainActivity.TAB_HOME)
    }

    fun voiceResult(c: Context, ok: Boolean, said: String, msg: String) {
        if (!Prefs.of(c).getBoolean(Prefs.N_VOICE, true)) return
        val text = listOf(if (said.isNotEmpty()) "“$said”" else "", msg).filter { it.isNotEmpty() }.joinToString("\n")
        post(c, 5000 + (System.currentTimeMillis() % 500).toInt(), Notif.CH_VOICE,
            if (ok) "Voice note saved" else "Voice note not saved", text.ifEmpty { "Open Voice to see it." }, MainActivity.TAB_VOICE)
    }

    fun done(c: Context, id: Int, todo: Long): Notification.Action = Notification.Action.Builder(null, "Done",
        PendingIntent.getBroadcast(c, id, Intent(c, ActionReceiver::class.java).setAction(ActionReceiver.TODO_DONE)
            .putExtra("todo", todo).putExtra("nid", id), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)).build()

    fun snooze(c: Context, id: Int, title: String, text: String, todo: Long): Notification.Action = Notification.Action.Builder(null, "In 1 hour",
        PendingIntent.getBroadcast(c, id + 1, Intent(c, ActionReceiver::class.java).setAction(ActionReceiver.SNOOZE)
            .putExtra("title", title).putExtra("text", text).putExtra("todo", todo).putExtra("nid", id),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)).build()
}

/** Exact-time alarms for to-do reminders and calendar events. */
object Alarms {
    private const val KEYS = "alarm_keys"

    private fun pi(c: Context, key: String, kind: String, title: String, text: String, todo: Long) =
        PendingIntent.getBroadcast(c, 0,
            Intent(c, AlarmReceiver::class.java).setData(Uri.parse("conductor://alarm/" + Uri.encode(key)))
                .putExtra("kind", kind).putExtra("title", title).putExtra("text", text).putExtra("todo", todo),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    data class Alarm(val key: String, val at: Long, val kind: String, val title: String, val text: String, val todo: Long = 0)

    /** Replaces every alarm we set before with this list. */
    fun replaceAll(c: Context, list: List<Alarm>) {
        val am = c.getSystemService(AlarmManager::class.java)
        val p = Prefs.of(c)
        val now = System.currentTimeMillis()
        val keep = list.filter { it.at > now }.associateBy { it.key }
        (p.getStringSet(KEYS, emptySet()) ?: emptySet()).filter { it !in keep }.forEach {
            am.cancel(pi(c, it, "", "", "", 0))
        }
        keep.values.forEach { set(c, it) }
        p.edit().putStringSet(KEYS, keep.keys).apply()
    }

    fun set(c: Context, a: Alarm) {
        val am = c.getSystemService(AlarmManager::class.java)
        val intent = pi(c, a.key, a.kind, a.title, a.text, a.todo)
        if (am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, a.at, intent)
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, a.at, intent)
    }
}

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        val kind = i.getStringExtra("kind") ?: return
        val title = i.getStringExtra("title") ?: ""
        val text = i.getStringExtra("text") ?: ""
        val todo = i.getLongExtra("todo", 0)
        val id = (i.data?.toString() ?: title).hashCode() and 0x3fffffff
        if (kind == "todo") {
            if (!Prefs.of(c).getBoolean(Prefs.N_REMIND, true)) return
            Notifier.post(c, id, Notif.CH_REMIND, title, text, MainActivity.TAB_LISTS,
                *listOfNotNull(if (todo > 0) Notifier.done(c, id, todo) else null, Notifier.snooze(c, id, title, text, todo)).toTypedArray())
        } else {
            if (!Prefs.of(c).getBoolean(Prefs.N_CAL, true)) return
            Notifier.post(c, id, Notif.CH_CAL, title, text, MainActivity.TAB_HOME)
        }
    }
}

class ActionReceiver : BroadcastReceiver() {
    companion object {
        const val FOB_STOP = "app.traceytech.conductor.FOB_STOP"
        const val TODO_DONE = "app.traceytech.conductor.TODO_DONE"
        const val SNOOZE = "app.traceytech.conductor.SNOOZE"
        private val io = Executors.newSingleThreadExecutor()
    }

    override fun onReceive(c: Context, i: Intent) {
        val nm = c.getSystemService(NotificationManager::class.java)
        when (i.action) {
            FOB_STOP -> FobService.stop(c)
            TODO_DONE -> {
                val todo = i.getLongExtra("todo", 0); val nid = i.getIntExtra("nid", 0)
                nm.cancel(nid)
                val pending = goAsync()
                io.execute {
                    try {
                        val r = Net.postJson("/api/todos", JSONObject().put("id", todo).put("state", "done"))
                        if (r.signedOut) Notifier.signIn(c)
                        else if (!r.ok) Notifier.post(c, nid, Notif.CH_REMIND, "Not marked done", r.json().optString("error", "Try again in the app."), MainActivity.TAB_LISTS)
                    } finally { pending.finish() }
                }
            }
            SNOOZE -> {
                nm.cancel(i.getIntExtra("nid", 0))
                val title = i.getStringExtra("title") ?: ""
                Alarms.set(c, Alarms.Alarm("snooze:" + title + ":" + System.currentTimeMillis(),
                    System.currentTimeMillis() + 3600_000, "todo", title, i.getStringExtra("text") ?: "", i.getLongExtra("todo", 0)))
            }
        }
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        Sync.schedule(c, false)
        Sync.now(c) // sets the alarms again: Android forgets them at restart
        if (i.action == Intent.ACTION_BOOT_COMPLETED || i.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            if (Prefs.of(c).getBoolean(Prefs.FOB_ON, false)) FobService.start(c)
        }
    }
}
