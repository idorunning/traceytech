package app.traceytech.conductor

import android.Manifest
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract

/**
 * WhatsApp from the voice pin. WhatsApp has no way to send from a personal number in the background,
 * so the app finds the contact, opens WhatsApp with the message already typed, and Nathan taps Send.
 * Nothing is ever sent without that tap.
 */
object Wa {
    data class Who(val name: String, val number: String)

    fun canRead(c: Context) = c.checkSelfPermission(Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED

    /** Contacts whose name matches, one number each (mobile first), at most 5. */
    fun find(c: Context, who: String): List<Who> {
        if (!canRead(c) || who.isBlank()) return emptyList()
        val out = LinkedHashMap<Long, Who>()
        val mobile = HashSet<Long>()
        try {
            c.contentResolver.query(
                Uri.withAppendedPath(ContactsContract.CommonDataKinds.Phone.CONTENT_FILTER_URI, Uri.encode(who.trim())),
                arrayOf(ContactsContract.CommonDataKinds.Phone.CONTACT_ID, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER, ContactsContract.CommonDataKinds.Phone.TYPE),
                null, null, null
            )?.use { cur ->
                while (cur.moveToNext() && out.size < 12) {
                    val id = cur.getLong(0); val name = cur.getString(1) ?: continue; val num = cur.getString(2) ?: continue
                    val isMob = cur.getInt(3) == ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE
                    if (!out.containsKey(id) || (isMob && id !in mobile)) { out[id] = Who(name, num); if (isMob) mobile.add(id) }
                }
            }
        } catch (_: Exception) {}
        // an exact first-name or full-name match beats partial ones ("Sam" should not offer "Samantha" too)
        val all = out.values.toList()
        val q = who.trim().lowercase()
        val exact = all.filter { it.name.lowercase() == q || it.name.lowercase().split(" ").firstOrNull() == q }
        return (exact.ifEmpty { all }).take(5)
    }

    /** UK-style number to the international digits WhatsApp wants (07… becomes 447…). */
    fun intl(n: String): String {
        val plus = n.trim().startsWith("+")
        var d = n.filter { it.isDigit() }
        if (!plus && d.startsWith("00")) d = d.drop(2)
        else if (!plus && d.startsWith("0")) d = "44" + d.drop(1)
        return d
    }

    private fun pkg(c: Context): String? = listOf("com.whatsapp", "com.whatsapp.w4b").firstOrNull {
        try { c.packageManager.getPackageInfo(it, 0); true } catch (_: Exception) { false }
    }

    /** Opens the chat with the text typed in, or WhatsApp's own chat picker when there is no number. */
    fun intent(c: Context, number: String?, text: String): Intent {
        val p = pkg(c)
        val i = if (!number.isNullOrBlank())
            Intent(Intent.ACTION_VIEW, Uri.parse("https://api.whatsapp.com/send?phone=${intl(number)}&text=${Uri.encode(text)}"))
        else Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        if (p != null) i.setPackage(p)
        return i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    /** Android won't let a background service open an app, so this is a notification: tap it, then tap Send. */
    fun notify(c: Context, to: String, number: String?, text: String) {
        if (!Notifier.allowed(c)) return
        val id = 7000 + (System.currentTimeMillis() % 900).toInt()
        val pi = PendingIntent.getActivity(c, id, intent(c, number, text), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val title = if (number != null) "WhatsApp to $to" else "WhatsApp: choose $to"
        val b = Notification.Builder(c, Notif.CH_VOICE)
            .setSmallIcon(R.drawable.ic_stat).setColor(0xFF25D366.toInt())
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText("“$text”\nTap to open WhatsApp, then tap Send."))
            .setAutoCancel(true).setContentIntent(pi)
            .addAction(Notification.Action.Builder(null, "Open WhatsApp", pi).build())
        c.getSystemService(android.app.NotificationManager::class.java).notify(id, b.build())
    }
}
