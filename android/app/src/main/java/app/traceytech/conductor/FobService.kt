package app.traceytech.conductor

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.ParcelUuid
import android.os.PowerManager
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors
import java.util.zip.CRC32

/**
 * Keeps the NoteAI voice fob (M5StickS3) connected while the phone is locked.
 * Same protocol as traceytech.app/voice and noteai_bridge v4+:
 *  - notify on AUD: "NAS1" u32 total u32 rate | data: u32 offset, u8 flags (bit0 = end of window), bytes | "NAE1" u32 total u32 crc32
 *  - write on CTL: 0x01 [mtu lo, hi] ready, 0x00 stop, 0x02 u32 received (ack), 0x03 ok/fail status (then 0x01 again)
 *  - firmware 0.5.2+: 0x04 "headline\nmore" shows text on the fob; 0x05 u32 id "question\nA\nB" asks a two-choice
 *    question (FRONT = A, SIDE = B). Each is followed by 0x01 because older firmware treats other writes as stop.
 *    The answer comes back as a notify on AUD: "NAQ1" u32 id u8 choice (0 = A, 1 = B), even with no transfer running.
 */
@SuppressLint("MissingPermission") // every entry point checks BLUETOOTH_CONNECT / BLUETOOTH_SCAN first
class FobService : Service() {

    companion object {
        val SVC: UUID = UUID.fromString("4fafc201-1fb5-459e-8fcc-c5c9c331914b")
        val AUD: UUID = UUID.fromString("beb5483e-36e1-4688-b7f5-ea07361b26a8")
        val CTL: UUID = UUID.fromString("cba1d466-344c-4be3-ab3f-189f80dd7518")
        val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
        const val NAME = "M5StickS3-Mic"
        private const val NOTE_ID = 7001

        @Volatile var running = false; private set
        @Volatile var connected = false; private set
        @Volatile var status = "Off"; private set
        @Volatile var detail = "Turn on Keep fob connected to use the fob with the phone locked."; private set
        @Volatile var lastHeard = ""; private set
        var listener: (() -> Unit)? = null

        fun hasPerms(c: Context) =
            c.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED &&
                c.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED

        /** Call from the screen or at boot only. */
        fun start(c: Context): Boolean {
            Prefs.of(c).edit().putBoolean(Prefs.FOB_ON, true).apply()
            if (!hasPerms(c)) { set("Needs permission", "Allow Nearby devices for Conductor IO, then try again."); return false }
            return try { c.startForegroundService(Intent(c, FobService::class.java)); true }
            catch (e: Exception) { set("Waiting", "Open Conductor IO once to reconnect the fob."); false }
        }

        fun stop(c: Context) {
            Prefs.of(c).edit().putBoolean(Prefs.FOB_ON, false).apply()
            c.stopService(Intent(c, FobService::class.java))
            set("Off", "The fob is not connected to this phone.", false)
        }

        fun forget(c: Context) {
            Prefs.of(c).edit().remove(Prefs.FOB_ADDR).apply()
            if (running) { stop(c); start(c) }
        }

        private val main = Handler(Looper.getMainLooper())
        private fun set(s: String, d: String? = null, conn: Boolean? = null) {
            status = s; if (d != null) detail = d; if (conn != null) connected = conn
            main.post { listener?.invoke() }
        }
    }

    private val h = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private var gatt: BluetoothGatt? = null
    private var ctl: BluetoothGattCharacteristic? = null
    private var mtu = 23
    private var scanning = false
    private var wake: PowerManager.WakeLock? = null
    private var stopped = false

    private class Rx(val total: Int, val rate: Int) { val buf = ByteArray(total); var len = 0 }
    private var rx: Rx? = null
    private var ackSoon = false

    // GATT allows one operation at a time: queue them
    private val ops = ArrayDeque<() -> Boolean>()
    private var busy = false
    private val opTimeout = Runnable { busy = false; next() }

    private val btState = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            when (i.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1)) {
                BluetoothAdapter.STATE_ON -> h.postDelayed({ begin() }, 800)
                BluetoothAdapter.STATE_OFF -> { drop(); set("Bluetooth is off", "Turn Bluetooth on and the fob reconnects by itself.", false); note() }
            }
        }
    }

    override fun onBind(i: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        registerReceiver(btState, IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            startForeground(NOTE_ID, buildNote(), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        } catch (e: Exception) {
            set("Waiting", "Open Conductor IO once to reconnect the fob.", false)
            stopSelf(); return START_NOT_STICKY
        }
        if (!hasPerms(this)) {
            set("Needs permission", "Allow Nearby devices for Conductor IO, then try again.", false)
            stopSelf(); return START_NOT_STICKY
        }
        stopped = false
        if (gatt == null && !scanning) begin()
        return START_STICKY
    }

    override fun onDestroy() {
        stopped = true
        running = false
        try { unregisterReceiver(btState) } catch (_: Exception) {}
        stopScan()
        gatt?.let { g ->
            try { g.getService(SVC)?.getCharacteristic(CTL)?.let { c -> g.writeCharacteristic(c, byteArrayOf(0), BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) } } catch (_: Exception) {}
            h.postDelayed({ try { g.disconnect(); g.close() } catch (_: Exception) {} }, 150)
        }
        gatt = null; ctl = null; rx = null
        wake?.let { if (it.isHeld) it.release() }
        h.removeCallbacksAndMessages(null)
        set("Off", "The fob is not connected to this phone.", false)
        super.onDestroy()
    }

    // ---- connecting ----

    private fun adapter(): BluetoothAdapter? = getSystemService(BluetoothManager::class.java)?.adapter

    private fun begin() {
        if (stopped) return
        val a = adapter()
        if (a == null || !a.isEnabled) { set("Bluetooth is off", "Turn Bluetooth on and the fob reconnects by itself.", false); note(); return }
        val addr = Prefs.of(this).getString(Prefs.FOB_ADDR, null)
        if (addr != null && BluetoothAdapter.checkBluetoothAddress(addr)) connect(a.getRemoteDevice(addr)) else scan()
    }

    private val scanCb = object : ScanCallback() {
        override fun onScanResult(type: Int, r: ScanResult) {
            if (!scanning) return
            stopScan()
            Prefs.of(this@FobService).edit().putString(Prefs.FOB_ADDR, r.device.address).apply()
            connect(r.device)
        }
        override fun onScanFailed(errorCode: Int) { scanning = false; h.postDelayed({ begin() }, 30000) }
    }

    private fun scan() {
        val s = adapter()?.bluetoothLeScanner ?: return
        set("Looking for your fob…", "Turn the fob on and keep it near the phone.", false); note()
        scanning = true
        try {
            s.startScan(
                listOf(ScanFilter.Builder().setDeviceName(NAME).build(),
                    ScanFilter.Builder().setServiceUuid(ParcelUuid(SVC)).build()),
                ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scanCb)
        } catch (e: Exception) { scanning = false }
        h.postDelayed({
            if (scanning) {
                stopScan()
                set("Fob not found", "Turn the fob on. The phone keeps looking every minute.", false); note()
                h.postDelayed({ begin() }, 60000)
            }
        }, 20000)
    }

    private fun stopScan() {
        if (!scanning) return
        scanning = false
        try { adapter()?.bluetoothLeScanner?.stopScan(scanCb) } catch (_: Exception) {}
    }

    private fun connect(d: BluetoothDevice) {
        if (stopped) return
        set("Connecting…", "Waiting for the fob. It connects as soon as it is on and in range.", false); note()
        // autoConnect = true: Android waits in the background for the fob, with no time limit
        gatt = d.connectGatt(this, true, cb, BluetoothDevice.TRANSPORT_LE)
    }

    private fun drop() {
        gatt?.let { try { it.close() } catch (_: Exception) {} }
        gatt = null; ctl = null; rx = null; ops.clear(); busy = false
        connected = false
    }

    private val cb = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, st: Int, newState: Int) = h.post {
            if (g != gatt) return@post
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                set("Connecting…", "Setting up the link.")
                g.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH)
                if (!g.requestMtu(247)) g.discoverServices()
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                val wasRx = rx != null
                drop()
                if (stopped) return@post
                set("Reconnecting…", if (wasRx) "Lost the fob during a recording. Please record it again." else "The fob went out of range or switched off. It reconnects by itself.", false)
                note()
                h.postDelayed({ begin() }, 2000)
            }
        }.let {}

        override fun onMtuChanged(g: BluetoothGatt, m: Int, st: Int) = h.post {
            if (st == BluetoothGatt.GATT_SUCCESS) mtu = m
            g.discoverServices()
        }.let {}

        override fun onServicesDiscovered(g: BluetoothGatt, st: Int) = h.post {
            val s = g.getService(SVC)
            val a = s?.getCharacteristic(AUD)
            val c = s?.getCharacteristic(CTL)
            if (a == null || c == null) {
                set("Wrong device", "That device is not the NoteAI fob. Press Forget fob and try again.", false); note()
                g.disconnect(); return@post
            }
            ctl = c
            g.setCharacteristicNotification(a, true)
            a.getDescriptor(CCCD)?.let { d -> enqueue { g.writeDescriptor(d, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) == BluetoothStatusCodes.SUCCESS } }
            write(byteArrayOf(1, (mtu and 255).toByte(), (mtu shr 8 and 255).toByte()))
            enqueue {
                set("Connected", "Ready. Hold the fob button, speak, let go. Works with the phone locked.", true); note()
                false
            }
        }.let {}

        override fun onDescriptorWrite(g: BluetoothGatt, d: BluetoothGattDescriptor, st: Int) = h.post { done() }.let {}
        override fun onCharacteristicWrite(g: BluetoothGatt, c: BluetoothGattCharacteristic, st: Int) = h.post { done() }.let {}

        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic, value: ByteArray) {
            val v = value.copyOf()
            h.post { onPkt(v) }
        }
    }

    // ---- GATT queue ----

    private fun enqueue(op: () -> Boolean) { ops.addLast(op); if (!busy) next() }
    private fun next() {
        while (ops.isNotEmpty()) {
            val op = ops.removeFirst()
            val started = try { op() } catch (e: Exception) { false }
            if (started) { busy = true; h.postDelayed(opTimeout, 2000); return }
        }
        busy = false
    }
    private fun done() { h.removeCallbacks(opTimeout); busy = false; next() }

    private fun write(bytes: ByteArray, noResp: Boolean = false) = enqueue {
        val g = gatt; val c = ctl
        if (g == null || c == null) false
        else g.writeCharacteristic(c, bytes,
            if (noResp) BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE else BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        ) == BluetoothStatusCodes.SUCCESS
    }

    // ---- receiving a recording ----

    private fun u32(p: ByteArray, o: Int): Long =
        ((p[o].toLong() and 255) or ((p[o + 1].toLong() and 255) shl 8) or
            ((p[o + 2].toLong() and 255) shl 16) or ((p[o + 3].toLong() and 255) shl 24))

    private fun tag(p: ByteArray) = String(p, 0, 4, Charsets.ISO_8859_1)

    private fun ack() {
        if (ackSoon) return
        ackSoon = true
        h.post {
            ackSoon = false
            val r = rx ?: return@post
            val n = r.len
            write(byteArrayOf(2, n.toByte(), (n shr 8).toByte(), (n shr 16).toByte(), (n shr 24).toByte()), true)
        }
    }

    private val idle = Runnable { if (rx != null) ack() }

    private fun onPkt(p: ByteArray) {
        if (p.size == 9 && tag(p) == "NAQ1") { val id = u32(p, 4); val ch = p[8].toInt() and 1
            waAsk.remove(id)?.let { (opts, text) -> val w = opts[ch]; Wa.notify(this, w.name, w.number, text)
                fobText("WhatsApp to " + w.name.substringBefore(' '), "Tap Send on your phone"); status(true); set("Connected", "WhatsApp to ${w.name} is ready: tap the alert, then Send."); note(); return }
            answer(id, ch); return }
        if (p.size == 12 && tag(p) == "NAS1") {
            val total = u32(p, 4).toInt()
            if (total <= 0 || total > 48000 * 2 * 65) return
            rx = Rx(total, u32(p, 8).toInt())
            wakeOn()
            set("Receiving your note…", "")
            note()
            return
        }
        val r = rx ?: return
        if (p.size == 12 && tag(p) == "NAE1") {
            val total = u32(p, 4).toInt(); val crc = u32(p, 8)
            rx = null; h.removeCallbacks(idle)
            val got = r.buf.copyOf(r.len)
            val c = CRC32().apply { update(got) }.value
            if (r.len == total && c == crc) upload(got, r.rate)
            else { status(false); set("Connected", "The recording was damaged on the way. Please try again."); note(); wakeOff() }
            return
        }
        if (p.size < 5) return
        val off = u32(p, 0).toInt()
        val n = p.size - 5
        if (off <= r.len && off + n <= r.buf.size) { System.arraycopy(p, 5, r.buf, off, n); r.len = off + n }
        if ((p[4].toInt() and 1) != 0 || off > r.len) ack()
        h.removeCallbacks(idle); h.postDelayed(idle, 250) // the window's last packet was lost: ack anyway
        if (r.total > 0) set("Receiving your note… ${r.len * 100 / r.total}%")
    }

    private fun status(ok: Boolean) { write(byteArrayOf(3, if (ok) 1 else 0)); write(byteArrayOf(1)) }

    // ---- the fob's screen (firmware 0.5.2+; older firmware ignores these) ----

    private fun ascii(t: String) = t.map { if (it == '\n' || it.code in 32..126) it else when (it) { '‘', '’' -> '\''; '“', '”' -> '"'; '–', '—' -> '-'; '…' -> '.'; else -> '?' } }.joinToString("")
    private fun fobText(head: String, line: String) {
        val b = ascii(head.trim() + if (line.isNotBlank()) "\n" + line.trim() else "").toByteArray(Charsets.US_ASCII).let { it.copyOf(minOf(it.size, 180)) }
        if (b.isEmpty()) return
        write(byteArrayOf(4) + b); write(byteArrayOf(1))
    }
    private fun fobAsk(id: Long, q: String, a: String, b: String) {
        val t = ascii(q.trim() + "\n" + a.trim() + "\n" + b.trim()).toByteArray(Charsets.US_ASCII).let { it.copyOf(minOf(it.size, 180)) }
        write(byteArrayOf(5, id.toByte(), (id shr 8).toByte(), (id shr 16).toByte(), (id shr 24).toByte()) + t); write(byteArrayOf(1))
    }
    /** Shows the server's result on the fob. Returns true when it asked a question instead (no status until it is answered). */
    private fun showResult(j: org.json.JSONObject): Boolean {
        val ask = j.optJSONObject("ask"); val opts = ask?.optJSONArray("options")
        if (ask != null && j.optString("state") == "asking" && opts != null && opts.length() >= 2) {
            fobAsk(ask.optLong("id"), ask.optString("question"), opts.optString(0), opts.optString(1)); return true
        }
        j.optJSONObject("fob")?.let { fobText(it.optString("head"), it.optString("line")) }
        return false
    }
    // ---- WhatsApp: "message Sam I'm running late" (the server replies with whatsapp:{to,text,phone?}) ----
    private val waAsk = HashMap<Long, Pair<List<Wa.Who>, String>>()
    private var waSeq = 0L
    /** Returns true when the result was a WhatsApp message (it then handles the fob screen and status itself). */
    private fun whatsapp(j: org.json.JSONObject): Boolean {
        val wa = j.optJSONObject("whatsapp") ?: return false
        val to = wa.optString("to").trim(); val text = wa.optString("text").trim()
        if (text.isEmpty()) return false
        val phone = wa.optString("phone").trim().ifEmpty { null }
        val found = if (phone != null) listOf(Wa.Who(to.ifEmpty { phone }, phone)) else Wa.find(this, to)
        val first = to.substringBefore(' ').ifEmpty { "them" }
        when {
            found.size == 1 -> { Wa.notify(this, found[0].name, found[0].number, text); fobText("WhatsApp to " + found[0].name.substringBefore(' '), "Tap Send on your phone"); status(true) }
            found.size == 2 -> { val id = 0x80000000L or (++waSeq and 0x7fffffffL); waAsk[id] = found to text
                fobAsk(id, "WhatsApp which $first?", found[0].name, found[1].name) }
            else -> { Wa.notify(this, to.ifEmpty { "a chat" }, null, text)
                fobText("WhatsApp: pick $first", if (!Wa.canRead(this)) "Allow Contacts in app Settings" else "Tap the alert on your phone"); status(true) }
        }
        set("Connected", "WhatsApp to ${to.ifEmpty { "someone" }} is ready: tap the alert, then Send.")
        return true
    }

    private fun answer(id: Long, choice: Int) {
        wakeOn(); set("Thinking…", ""); note()
        io.execute {
            val body = org.json.JSONObject().put("id", id).put("choice", choice).toString().toByteArray()
            val res = Net.call("POST", "/api/voice/answer", body, "application/json", timeoutMs = 60000)
            val j = res.json()
            h.post {
                if (res.ok) {
                    if (!whatsapp(j)) { val asked = showResult(j); if (!asked) status(j.optBoolean("ok", true)) }
                    set("Connected", j.optString("message", "Saved"))
                    Notifier.voiceResult(this, true, lastHeard, j.optString("message")); Sync.now(this)
                } else {
                    fobText("Not saved", if (res.signedOut) "Sign in again in the app" else j.optString("error", "Try again"))
                    status(false); set("Connected", "Not saved: " + j.optString("error", "HTTP ${res.code}"))
                }
                note(); wakeOff()
            }
        }
    }

    private fun upload(pcm: ByteArray, rate: Int) {
        set("Thinking…", "")
        note()
        io.execute {
            val res = Net.call("POST", "/api/voice/audio", pcm, "application/octet-stream",
                mapOf("X-Sample-Rate" to rate.toString()), timeoutMs = 90000)
            val j = res.json()
            h.post {
                when {
                    res.signedOut -> {
                        status(false)
                        set("Connected", "Not saved: sign in to TraceyTech in the app again.")
                        Notifier.signIn(this)
                    }
                    !res.ok -> {
                        status(false)
                        set("Connected", "Not saved: " + j.optString("error", "HTTP ${res.code}"))
                        Notifier.voiceResult(this, false, "", detail)
                    }
                    else -> {
                        val good = j.optBoolean("ok") && j.optString("state") != "unclear"
                        if (!whatsapp(j) && !showResult(j)) status(good)
                        val said = j.optString("transcript")
                        lastHeard = said
                        set("Connected", (if (said.isNotEmpty()) "You said: “$said”. " else "") + j.optString("message"))
                        Notifier.voiceResult(this, good, said, j.optString("message"))
                        Sync.now(this)
                    }
                }
                note()
                wakeOff()
            }
        }
    }

    private fun wakeOn() {
        if (wake == null) wake = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ConductorIO:fob").apply { setReferenceCounted(false) }
        wake?.acquire(3 * 60 * 1000L)
    }
    private fun wakeOff() { wake?.let { if (it.isHeld) it.release() } }

    // ---- the ongoing notification ----

    private fun buildNote(): Notification {
        val open = PendingIntent.getActivity(this, 1,
            Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_TAB, MainActivity.TAB_VOICE)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val stop = PendingIntent.getBroadcast(this, 2,
            Intent(this, ActionReceiver::class.java).setAction(ActionReceiver.FOB_STOP),
            PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, Notif.CH_FOB)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle("Fob: $status")
            .setContentText(detail.ifEmpty { "Conductor IO keeps your voice fob connected." })
            .setStyle(Notification.BigTextStyle().bigText(detail))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, "Disconnect", stop).build())
            .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun note() {
        if (stopped) return
        getSystemService(NotificationManager::class.java).notify(NOTE_ID, buildNote())
    }
}
