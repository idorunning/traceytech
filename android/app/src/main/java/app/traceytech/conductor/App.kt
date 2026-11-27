package app.traceytech.conductor

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.SharedPreferences
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Notif.channels(this)
        Sync.schedule(this, false)
        // The fob service is started from the screen or at boot: Android does not let
        // a process that woke in the background start a foreground service.
    }
}

object Prefs {
    const val FOB_ON = "fob_on"            // keep the fob connected in the background
    const val FOB_ADDR = "fob_addr"        // the fob's Bluetooth address, once found
    const val SYNC_MIN = "sync_min"        // 15, 30 or 60
    const val N_REMIND = "n_remind"
    const val N_CAL = "n_cal"
    const val N_CAL_LEAD = "n_cal_lead"    // minutes before an event
    const val N_VOICE = "n_voice"
    const val N_MAIL = "n_mail"
    const val N_INVITE = "n_invite"
    const val LAST_SYNC = "last_sync"
    const val LAST_SYNC_MSG = "last_sync_msg"
    const val ONBOARDED = "onboarded"
    fun of(c: Context): SharedPreferences = c.getSharedPreferences("conductor", Context.MODE_PRIVATE)
}

object Sync {
    private const val PERIODIC = "conductor-sync"
    private const val NOW = "conductor-sync-now"

    fun schedule(c: Context, replace: Boolean) {
        val mins = Prefs.of(c).getInt(Prefs.SYNC_MIN, 15).coerceIn(15, 240).toLong()
        val req = PeriodicWorkRequestBuilder<SyncWorker>(mins, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(c).enqueueUniquePeriodicWork(
            PERIODIC,
            if (replace) ExistingPeriodicWorkPolicy.UPDATE else ExistingPeriodicWorkPolicy.KEEP,
            req
        )
    }

    fun now(c: Context) {
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(c).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, req)
    }
}

object Notif {
    const val CH_REMIND = "reminders"
    const val CH_CAL = "calendar"
    const val CH_VOICE = "voice"
    const val CH_MAIL = "mail"
    const val CH_FOB = "fob"
    const val CH_ACCOUNT = "account"

    fun channels(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java)
        fun ch(id: String, name: String, desc: String, imp: Int) =
            NotificationChannel(id, name, imp).apply { description = desc }
        nm.createNotificationChannels(listOf(
            ch(CH_REMIND, "Reminders", "To-do items when they are due", NotificationManager.IMPORTANCE_HIGH),
            ch(CH_CAL, "Calendar", "Events about to start and new invites", NotificationManager.IMPORTANCE_HIGH),
            ch(CH_VOICE, "Voice notes", "What happened to each fob recording", NotificationManager.IMPORTANCE_DEFAULT),
            ch(CH_MAIL, "Email", "New unread email that is not a newsletter", NotificationManager.IMPORTANCE_DEFAULT),
            ch(CH_FOB, "Fob connection", "Shows while the app keeps the fob connected", NotificationManager.IMPORTANCE_LOW),
            ch(CH_ACCOUNT, "Account", "Sign-in problems", NotificationManager.IMPORTANCE_DEFAULT),
        ))
    }
}
