package app.traceytech.conductor

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors

/**
 * Voice notes from the phone's own microphone, for when the fob isn't with you.
 * Hold to talk: 16 kHz mono 16-bit PCM, up to 60 seconds, sent to the same /api/voice/audio
 * the fob uses, so a note becomes a reminder, a to-do or a draft in exactly the same way.
 */
class PhoneMic(private val c: Context, private val onState: (busy: Boolean, title: String, detail: String) -> Unit) {
    private val rate = 16000
    private val max = rate * 2 * 60
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    @Volatile private var rec: AudioRecord? = null
    @Volatile private var recording = false
    var busy = false; private set

    @SuppressLint("MissingPermission")  // checked by the caller before start()
    fun start() {
        if (recording || busy) return
        val min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val r = try {
            AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, rate))
        } catch (e: Exception) { null }
        if (r == null || r.state != AudioRecord.STATE_INITIALIZED) { r?.release(); onState(false, "Microphone not available", "Another app may be using it."); return }
        rec = r; recording = true
        onState(true, "Listening…", "Speak, then let go.")
        io.execute {
            val out = ByteArrayOutputStream()
            val buf = ByteArray(3200)
            try {
                r.startRecording()
                while (recording && out.size() < max) {
                    val n = r.read(buf, 0, buf.size)
                    if (n > 0) out.write(buf, 0, n)
                }
            } catch (_: Exception) {
            } finally {
                try { r.stop() } catch (_: Exception) {}
                r.release(); rec = null; recording = false
            }
            send(out.toByteArray())
        }
    }

    fun stop() { recording = false }

    private fun send(pcm: ByteArray) {
        if (pcm.size < rate) { main.post { onState(false, "Too short", "Hold the button while you speak.") }; return }
        busy = true
        main.post { onState(true, "Thinking…", "Turning your note into text.") }
        val res = Net.call("POST", "/api/voice/audio", pcm, "application/octet-stream", mapOf("X-Sample-Rate" to rate.toString()), timeoutMs = 90000)
        val j = res.json()
        busy = false
        main.post {
            when {
                res.signedOut -> { onState(false, "Not saved", "Sign in to TraceyTech on the Home tab first."); Notifier.signIn(c) }
                !res.ok -> onState(false, "Not saved", j.optString("error", "No connection. Try again."))
                else -> {
                    val said = j.optString("transcript")
                    onState(false, if (j.optBoolean("ok")) "Saved" else "Not sure what to do",
                        (if (said.isNotEmpty()) "You said: “$said”. " else "") + j.optString("message"))
                    Sync.now(c)
                }
            }
        }
    }
}
