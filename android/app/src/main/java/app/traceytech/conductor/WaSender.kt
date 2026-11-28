package app.traceytech.conductor

import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Sends pin messages in WhatsApp with no tap. Nathan turns it on in Android's Accessibility settings.
 * It only looks at WhatsApp, and only acts while a message from the pin is waiting: it opens the chat
 * with the text typed in, checks the box holds that text, presses Send, then goes back.
 * A locked phone can't be driven, so a message waits and goes the moment the phone is unlocked.
 */
class WaSender : AccessibilityService() {
    companion object {
        @Volatile var instance: WaSender? = null; private set
        data class Job(val who: Wa.Who, val text: String, val at: Long = System.currentTimeMillis())
        private val queue = ArrayDeque<Job>()
        /** Told the outcome of each message: (name, sent). */
        @Volatile var onResult: ((String, Boolean, Boolean) -> Unit)? = null  // name, sent, waitingForUnlock
        fun on() = instance != null
        fun send(c: Context, who: Wa.Who, text: String) {
            synchronized(queue) { queue.addLast(Job(who, text)) }
            instance?.kick()
        }
    }

    private val h = Handler(Looper.getMainLooper())
    private var armed: Job? = null
    private var picked = false
    private var pkg = "com.whatsapp"
    private val unlocked = object : BroadcastReceiver() { override fun onReceive(c: Context, i: Intent) { kick() } }
    private val timeout = Runnable { val j = armed ?: return@Runnable; armed = null; fail(j) }

    override fun onServiceConnected() {
        instance = this
        registerReceiver(unlocked, IntentFilter(Intent.ACTION_USER_PRESENT))
        kick()
    }
    override fun onDestroy() { instance = null; try { unregisterReceiver(unlocked) } catch (_: Exception) {}; super.onDestroy() }
    override fun onInterrupt() {}

    private fun usable(): Boolean {
        val km = getSystemService(KeyguardManager::class.java); val pm = getSystemService(PowerManager::class.java)
        return pm.isInteractive && !km.isKeyguardLocked
    }

    fun kick() = h.post {
        if (armed != null) return@post
        val j = synchronized(queue) {
            while (queue.isNotEmpty() && System.currentTimeMillis() - queue.first().at > 6 * 3600_000) queue.removeFirst()  // stale after 6 hours
            queue.firstOrNull()
        } ?: return@post
        if (!usable()) { onResult?.invoke(j.who.name, false, true); return@post }
        synchronized(queue) { queue.removeFirst() }
        val i = Wa.intent(this, j.who.number, j.text)
        pkg = i.`package` ?: "com.whatsapp"
        armed = j; picked = false
        h.postDelayed(timeout, 15000)
        try { startActivity(i) } catch (e: Exception) { h.removeCallbacks(timeout); armed = null; fail(j) }
    }

    override fun onAccessibilityEvent(e: AccessibilityEvent) {
        val j = armed ?: return
        if (e.packageName?.toString()?.startsWith("com.whatsapp") != true) return
        val root = rootInActiveWindow ?: return
        if (j.who.group) {
            // a group has no number: WhatsApp's chat list opens with the text ready; tap the group, then Send
            val send = root.findAccessibilityNodeInfosByViewId("$pkg:id/send").firstOrNull()
            if (picked && send != null) { press(j, send); return }
            if (!picked) {
                val hit = root.findAccessibilityNodeInfosByText(j.who.name).firstOrNull { (it.text?.toString() ?: "").trim().equals(j.who.name.trim(), true) }
                    ?: return
                var n: AccessibilityNodeInfo? = hit
                while (n != null && !n.isClickable) n = n.parent
                if (n?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) picked = true
            }
            return
        }
        val entry = root.findAccessibilityNodeInfosByViewId("$pkg:id/entry").firstOrNull()
        val typed = entry?.text?.toString().orEmpty()
        if (typed.isEmpty() || !typed.trim().startsWith(j.text.trim().take(12))) return  // not our chat yet
        val send = root.findAccessibilityNodeInfosByViewId("$pkg:id/send").firstOrNull()
            ?: root.findAccessibilityNodeInfosByText("Send").firstOrNull { it.isClickable }
            ?: return
        press(j, send)
    }

    private fun press(j: Job, send: AccessibilityNodeInfo) {
        armed = null; h.removeCallbacks(timeout)
        val ok = send.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        if (!ok) { fail(j); return }
        onResult?.invoke(j.who.name, true, false)
        h.postDelayed({ performGlobalAction(GLOBAL_ACTION_BACK) }, 700)
        h.postDelayed({ kick() }, 1500)
    }

    private fun fail(j: Job) {
        onResult?.invoke(j.who.name, false, false)
        Wa.notify(this, j.who.name, j.who.number, j.text)  // fall back to a tap
        h.postDelayed({ kick() }, 500)
    }
}
