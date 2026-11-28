package app.traceytech.conductor

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.webkit.JavascriptInterface
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

class MainActivity : ComponentActivity() {

    companion object {
        const val EXTRA_TAB = "tab"
        const val TAB_HOME = "home"
        const val TAB_LISTS = "lists"
        const val TAB_VOICE = "voice"
        const val TAB_SETTINGS = "settings"
        private const val SITE = "https://traceytech.app"
        private const val LOCAL = "https://appassets.androidplatform.net/assets/"
    }

    private lateinit var content: FrameLayout
    private lateinit var nav: LinearLayout
    private lateinit var home: WebView          // traceytech.app itself: sign-in, and "Open TraceyTech site"
    private lateinit var cond: WebView          // the Conductor home, built into the app
    private lateinit var homeBox: FrameLayout
    private lateinit var homeSite: View
    private lateinit var homeCond: View
    private var siteOpen = false                // the person chose to look at the website from the Conductor home
    private var condMic: PhoneMic? = null
    private lateinit var voice: WebView
    private lateinit var lists: WebView
    private lateinit var settings: WebView
    private lateinit var voiceBox: LinearLayout
    private lateinit var fobDot: View
    private lateinit var fobText: TextView
    private lateinit var fobDetail: TextView
    private lateinit var fobBtn: Button
    private val tabs = LinkedHashMap<String, Pair<View, LinearLayout>>()
    private var tab = TAB_HOME
    lateinit var bridge: Bridge
    private val loaded = HashSet<String>()
    private val swipes = HashMap<WebView, SwipeRefreshLayout>()
    private val atTop = HashMap<WebView, Boolean>()
    private var pausedAt = 0L
    private lateinit var mic: PhoneMic
    private lateinit var micBtn: Button
    private lateinit var micTitle: TextView
    private lateinit var micDetail: TextView
    private val siteJs by lazy { assets.open("site.js").bufferedReader().use { it.readText() } }

    private var geoPending: Pair<String, GeolocationPermissions.Callback>? = null
    private var filePending: ValueCallback<Array<Uri>>? = null
    private var afterPerms: (() -> Unit)? = null

    private val permLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { res ->
        geoPending?.let { (o, cb) ->
            val ok = has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION)
            cb.invoke(o, ok, false); geoPending = null
        }
        afterPerms?.invoke(); afterPerms = null
        bridge.changed()
    }

    private val fileLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        filePending?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
        filePending = null
    }

    fun has(p: String) = checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED
    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        bridge = Bridge(this)
        build()
        immersive()
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val w = current()
                when {
                    w != null && w.canGoBack() -> w.goBack()
                    w === home && siteOpen && Net.signedIn() -> closeSite()
                    tab != TAB_HOME -> show(TAB_HOME)
                    else -> moveTaskToBack(true)
                }
            }
        })
        show(intent?.getStringExtra(EXTRA_TAB) ?: TAB_HOME)
        firstRun()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_TAB)?.let { show(it) }
    }

    override fun onResume() {
        super.onResume()
        immersive()
        FobService.listener = { fobUi(); bridge.changed() }
        fobUi()
        // Coming back to the app: if the fob is meant to be on but the service died, start it again (allowed now we are on screen)
        if (Prefs.of(this).getBoolean(Prefs.FOB_ON, false) && !FobService.running) FobService.start(this)
        bridge.changed()
        if (Net.signedIn()) Sync.now(this)
        // Back after a while: show fresh information on every tab that has been opened
        if (pausedAt > 0 && System.currentTimeMillis() - pausedAt > 60_000) refreshAll()
        pausedAt = 0
    }

    override fun onPause() {
        super.onPause()
        pausedAt = System.currentTimeMillis()
        if (::mic.isInitialized) mic.stop()
        condMic?.stop()
        tts?.stop()
        FobService.listener = null
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() { tts?.shutdown(); tts = null; super.onDestroy() }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) immersive()
    }

    /** Full screen: status and navigation bars hidden, a swipe from the edge shows them for a moment. */
    private fun immersive() {
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
    }

    // ---- layout ----

    private fun build() {
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(0xFF09090A.toInt()) }
        content = FrameLayout(this)
        root.addView(content, LinearLayout.LayoutParams(-1, 0, 1f))

        home = site(SITE + "/")
        voice = site(SITE + "/voice")
        cond = local("home.html")
        lists = local("lists.html")
        settings = local("settings.html")

        voiceBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        voiceBox.addView(fobStrip(), LinearLayout.LayoutParams(-1, -2))
        voiceBox.addView(micPanel(), LinearLayout.LayoutParams(-1, -2))
        voiceBox.addView(pull(voice), LinearLayout.LayoutParams(-1, 0, 1f))
        homeSite = pull(home); homeCond = pull(cond)
        homeBox = FrameLayout(this).apply {
            addView(homeCond, FrameLayout.LayoutParams(-1, -1)); addView(homeSite, FrameLayout.LayoutParams(-1, -1))
        }
        val listsBox = pull(lists); val settingsBox = pull(settings)

        listOf(homeBox, listsBox, voiceBox, settingsBox).forEach { content.addView(it, FrameLayout.LayoutParams(-1, -1)); it.visibility = View.GONE }

        nav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(0xFF0E0E10.toInt())
            setPadding(0, dp(6), 0, dp(6))
        }
        val hair = View(this).apply { setBackgroundColor(0x18EFEDE8) }
        root.addView(hair, LinearLayout.LayoutParams(-1, 1))
        root.addView(nav, LinearLayout.LayoutParams(-1, -2))
        addTab(TAB_HOME, "Home", R.drawable.ic_tab_home, homeBox)
        addTab(TAB_LISTS, "Lists", R.drawable.ic_tab_lists, listsBox)
        addTab(TAB_VOICE, "Voice", R.drawable.ic_tab_voice, voiceBox)
        addTab(TAB_SETTINGS, "Settings", R.drawable.ic_tab_settings, settingsBox)

        ViewCompat.setOnApplyWindowInsetsListener(root) { v, ins ->
            val cut = ins.getInsets(WindowInsetsCompat.Type.displayCutout())
            val bars = ins.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = ins.getInsets(WindowInsetsCompat.Type.ime())
            val gest = ins.getInsets(WindowInsetsCompat.Type.mandatorySystemGestures())
            val imeOn = ins.isVisible(WindowInsetsCompat.Type.ime())
            v.setPadding(cut.left, maxOf(cut.top, bars.top), cut.right, if (imeOn) ime.bottom else 0)
            nav.visibility = if (imeOn) View.GONE else View.VISIBLE
            hair.visibility = nav.visibility
            nav.setPadding(0, dp(6), 0, dp(6) + maxOf(bars.bottom, gest.bottom / 2))
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)
    }

    private fun addTab(key: String, label: String, icon: Int, view: View) {
        val b = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            isClickable = true
            isFocusable = true
            contentDescription = label
            setOnClickListener { if (tab == key) reselect() else show(key) }
        }
        val ic = ImageView(this).apply { setImageResource(icon) }
        val t = TextView(this).apply {
            text = label; textSize = 11f; gravity = Gravity.CENTER; letterSpacing = 0.04f
            setPadding(0, dp(3), 0, 0)
        }
        b.addView(ic, LinearLayout.LayoutParams(dp(24), dp(24)))
        b.addView(t)
        nav.addView(b, LinearLayout.LayoutParams(0, dp(52), 1f))
        tabs[key] = view to b
    }

    /** Pull down to refresh. Only starts when the page (or the list under your finger) is at the top. */
    private fun pull(w: WebView): SwipeRefreshLayout = SwipeRefreshLayout(this).apply {
        addView(w, ViewGroup.LayoutParams(-1, -1))
        setColorSchemeColors(0xFFEFEDE8.toInt())
        setProgressBackgroundColorSchemeColor(0xFF1C1C1F.toInt())
        setOnChildScrollUpCallback { _, _ -> w.scrollY > 0 || atTop[w] == false }
        setOnRefreshListener { refresh(w) }
        swipes[w] = this
        w.addJavascriptInterface(object {
            @JavascriptInterface fun top(t: Boolean) { atTop[w] = t }
        }, "ConductorPage")
    }

    private fun refresh(w: WebView) {
        if (Net.signedIn()) Sync.now(this)
        if (w === home || w === voice) w.reload()
        else if (w === cond) { w.evaluateJavascript("window.onNativeReselect&&onNativeReselect()", null); w.postDelayed({ swipes[w]?.isRefreshing = false }, 1200) }
        else {
            w.evaluateJavascript("window.onNativeShow&&onNativeShow()", null)
            w.postDelayed({ swipes[w]?.isRefreshing = false }, 900)
        }
    }

    private fun refreshAll() {
        if ("site" in loaded) home.reload()
        if (TAB_VOICE in loaded) voice.reload()
        localViews().forEach { it.evaluateJavascript("window.onNativeShow&&onNativeShow()", null) }
    }

    /** Home is the Conductor once signed in. Signed out (or asked for), it is the TraceyTech website. */
    private fun homeMode() {
        val site = siteOpen || !Net.signedIn()
        homeSite.visibility = if (site) View.VISIBLE else View.GONE
        homeCond.visibility = if (site) View.GONE else View.VISIBLE
    }

    /** From the Conductor home: "Fix in TraceyTech" or Settings, "Open TraceyTech site". */
    fun openSite(path: String = "/") {
        siteOpen = true
        if (path != "/") { loaded.add("site"); home.loadUrl(SITE + path) }
        else if (!loaded.contains("site")) { loaded.add("site"); home.loadUrl(SITE + "/") }
        show(TAB_HOME)
    }

    private fun closeSite() { siteOpen = false; show(TAB_HOME) }

    /** The Conductor chat bar's microphone. Nothing is saved: the words come back as a question. */
    fun conductorMic(start: Boolean) {
        val m = condMic ?: PhoneMic(this, "/api/conductor/audio", { j ->
            cond.evaluateJavascript("window.onMicText&&onMicText(" + JSONObject.quote(j.optString("text")) + ")", null)
        }) { busy, title, detail ->
            val st = when { title == "Listening…" -> "listening"; title == "Thinking…" -> "thinking"; busy -> "busy"; title == "Done" -> "idle"; else -> "error" }
            cond.evaluateJavascript("window.onMicState&&onMicState(" + JSONObject.quote(st) + "," + JSONObject.quote(if (st == "idle") "" else "$title $detail".trim()) + ")", null)
        }.also { condMic = it }
        if (!start) { m.stop(); return }
        if (!has(Manifest.permission.RECORD_AUDIO)) {
            afterPerms = { if (has(Manifest.permission.RECORD_AUDIO)) cond.evaluateJavascript("window.onMicState&&onMicState('error','Microphone ready. Hold the mic and speak.')", null) }
            permLauncher.launch(arrayOf(Manifest.permission.RECORD_AUDIO))
            return
        }
        window.decorView.performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY)
        m.start()
    }

    private var tts: android.speech.tts.TextToSpeech? = null
    private var ttsReady = false
    /** Speak Conductor's answer, or stop speaking when text is null. */
    fun speak(text: String?) {
        if (text == null) { tts?.stop(); return }
        val say = { tts?.speak(text, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, "conductor") }
        if (tts != null && ttsReady) { say(); return }
        tts = android.speech.tts.TextToSpeech(this) { st ->
            ttsReady = st == android.speech.tts.TextToSpeech.SUCCESS
            if (ttsReady) { tts?.language = java.util.Locale.UK; say() }
        }
    }

    private fun reselect() {
        when (tab) {
            TAB_HOME -> if (current() === home) { home.scrollTo(0, 0); home.reload() } else cond.evaluateJavascript("window.onNativeReselect&&onNativeReselect()", null)
            TAB_VOICE -> voice.reload()
            else -> current()?.evaluateJavascript("window.onNativeReselect&&onNativeReselect()", null)
        }
    }

    fun show(target: String) {
        val agent = target.endsWith("#agent")          // a lists-agent notification opens the suggestions
        val key = target.removeSuffix("#agent")
        val k = if (tabs.containsKey(key)) key else TAB_HOME
        tab = k
        tabs.forEach { (name, pair) ->
            val on = name == k
            pair.first.visibility = if (on) View.VISIBLE else View.GONE
            val ic = pair.second.getChildAt(0) as ImageView
            val t = pair.second.getChildAt(1) as TextView
            val col = if (on) 0xFFEFEDE8.toInt() else 0xFF8F8E8A.toInt()
            ic.setColorFilter(col); t.setTextColor(col)
            t.typeface = if (on) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        }
        if (k == TAB_HOME) homeMode()
        val w = current() ?: return
        val first = loaded.add(if (w === home) "site" else k)
        if (first) w.loadUrl((w.tag as String) + if (agent) "#agent" else "")
        else w.evaluateJavascript(if (agent) "window.onNativeOpenAgent&&onNativeOpenAgent()" else "window.onNativeShow&&onNativeShow()", null)
    }

    private fun current(): WebView? = when (tab) {
        TAB_HOME -> if (homeSite.visibility == View.VISIBLE) home else cond; TAB_LISTS -> lists; TAB_VOICE -> voice; TAB_SETTINGS -> settings; else -> null
    }

    private fun fobStrip(): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(12), dp(12), dp(12))
            background = GradientDrawable().apply { setColor(0xFF141416.toInt()); setStroke(1, 0x22EFEDE8) }
        }
        fobDot = View(this).apply { background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(0xFF555555.toInt()) } }
        row.addView(fobDot, LinearLayout.LayoutParams(dp(10), dp(10)).apply { rightMargin = dp(12) })
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        fobText = TextView(this).apply { setTextColor(0xFFEFEDE8.toInt()); textSize = 15f; typeface = Typeface.DEFAULT_BOLD }
        fobDetail = TextView(this).apply { setTextColor(0xFFC9C7C2.toInt()); textSize = 13f }
        col.addView(fobText); col.addView(fobDetail)
        row.addView(col, LinearLayout.LayoutParams(0, -2, 1f))
        fobBtn = Button(this).apply {
            isAllCaps = false; textSize = 14f; setTextColor(0xFF09090A.toInt())
            background = GradientDrawable().apply { cornerRadius = dp(12).toFloat(); setColor(0xFFEFEDE8.toInt()) }
            setPadding(dp(16), 0, dp(16), 0); minHeight = dp(44); minimumHeight = dp(44)
            setOnClickListener { toggleFob() }
        }
        row.addView(fobBtn, LinearLayout.LayoutParams(-2, dp(44)).apply { leftMargin = dp(10) })
        return row
    }

    /** Hold to talk with the phone's own microphone: for when the fob isn't with you. */
    private fun micPanel(): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(12), dp(12), dp(12))
            background = GradientDrawable().apply { setColor(0xFF111113.toInt()); setStroke(1, 0x22EFEDE8) }
        }
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        micTitle = TextView(this).apply { setTextColor(0xFFEFEDE8.toInt()); textSize = 15f; typeface = Typeface.DEFAULT_BOLD; text = "Phone microphone" }
        micDetail = TextView(this).apply { setTextColor(0xFFC9C7C2.toInt()); textSize = 13f; text = "No fob? Hold the button and speak." }
        col.addView(micTitle); col.addView(micDetail)
        row.addView(col, LinearLayout.LayoutParams(0, -2, 1f))
        micBtn = Button(this).apply {
            isAllCaps = false; textSize = 14f; text = "Hold to talk"; setTextColor(0xFFEFEDE8.toInt())
            background = GradientDrawable().apply { cornerRadius = dp(12).toFloat(); setColor(0xFF1C1C1F.toInt()); setStroke(dp(1), 0x44EFEDE8) }
            setPadding(dp(16), 0, dp(16), 0); minHeight = dp(44); minimumHeight = dp(44)
        }
        mic = PhoneMic(this) { busy, title, detail ->
            micTitle.text = title; micDetail.text = detail
            micBtn.isEnabled = !mic.busy
            (micBtn.background as GradientDrawable).setColor(if (busy && title == "Listening…") 0xFFE5322B.toInt() else 0xFF1C1C1F.toInt())
            if (!busy && title == "Saved") voice.reload()
        }
        @SuppressLint("ClickableViewAccessibility")
        micBtn.setOnTouchListener { v, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    if (!has(Manifest.permission.RECORD_AUDIO)) {
                        afterPerms = { if (has(Manifest.permission.RECORD_AUDIO)) { micTitle.text = "Ready"; micDetail.text = "Now hold the button and speak." } }
                        permLauncher.launch(arrayOf(Manifest.permission.RECORD_AUDIO))
                    } else { v.performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY); mic.start() }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { mic.stop(); if (e.actionMasked == MotionEvent.ACTION_UP) v.performClick(); true }
                else -> true
            }
        }
        row.addView(micBtn, LinearLayout.LayoutParams(-2, dp(44)).apply { leftMargin = dp(10) })
        return row
    }

    private fun fobUi() {
        if (!::fobText.isInitialized) return
        val on = Prefs.of(this).getBoolean(Prefs.FOB_ON, false) && FobService.running
        fobText.text = "Fob · " + FobService.status
        fobDetail.text = FobService.detail
        fobBtn.text = if (on) "Disconnect" else "Connect fob"
        (fobDot.background as GradientDrawable).setColor(when {
            FobService.connected -> 0xFF3FB950.toInt()
            on -> 0xFFE3B341.toInt()
            else -> 0xFF555555.toInt()
        })
    }

    fun toggleFob() {
        if (Prefs.of(this).getBoolean(Prefs.FOB_ON, false) && FobService.running) { FobService.stop(this); fobUi(); return }
        val need = listOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.POST_NOTIFICATIONS).filter { !has(it) }
        if (need.isEmpty()) { FobService.start(this); fobUi() }
        else { afterPerms = { if (FobService.hasPerms(this)) FobService.start(this); fobUi() }; permLauncher.launch(need.toTypedArray()) }
    }

    private fun firstRun() {
        val p = Prefs.of(this)
        if (p.getBoolean(Prefs.ONBOARDED, false)) return
        p.edit().putBoolean(Prefs.ONBOARDED, true).apply()
        val need = listOf(Manifest.permission.POST_NOTIFICATIONS, Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT).filter { !has(it) }
        if (need.isNotEmpty()) permLauncher.launch(need.toTypedArray())
    }

    /** Called from the Settings page. */
    fun askPermission(what: String) {
        when (what) {
            "notifications" -> if (!has(Manifest.permission.POST_NOTIFICATIONS)) permLauncher.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS)) else appSettings()
            "nearby" -> if (!FobService.hasPerms(this)) permLauncher.launch(arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)) else appSettings()
            "location" -> if (!has(Manifest.permission.ACCESS_FINE_LOCATION)) permLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) else appSettings()
            "alarms" -> startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))
            "battery" -> startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
            "channels" -> startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
            else -> appSettings()
        }
    }

    private fun appSettings() = startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))

    fun signedOut() {
        CookieManager.getInstance().removeAllCookies { CookieManager.getInstance().flush() }
        loaded.remove("site"); loaded.remove(TAB_VOICE); siteOpen = false
        home.loadUrl("$SITE/login"); loaded.add("site"); voice.clearHistory()
        show(TAB_HOME)
    }

    fun openExternal(url: String) {
        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)) }
        catch (e: ActivityNotFoundException) { }
    }

    // ---- web views ----

    @SuppressLint("SetJavaScriptEnabled")
    private fun base(w: WebView) {
        w.setBackgroundColor(Color.parseColor("#09090A"))
        w.overScrollMode = View.OVER_SCROLL_NEVER
        w.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            setGeolocationEnabled(true)
            setSupportMultipleWindows(false)
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = userAgentString + " ConductorIO/" + BuildConfig.VERSION_NAME
        }
        w.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String, cb: GeolocationPermissions.Callback) {
                if (!origin.startsWith(SITE)) { cb.invoke(origin, false, false); return }
                if (has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION)) cb.invoke(origin, true, false)
                else { geoPending = origin to cb; permLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) }
            }
            override fun onPermissionRequest(request: PermissionRequest) { request.deny() }
            override fun onShowFileChooser(v: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                filePending?.onReceiveValue(null); filePending = cb
                return try { fileLauncher.launch(params.createIntent()); true } catch (e: Exception) { filePending = null; false }
            }
        }
    }

    private fun site(start: String): WebView = WebView(this).apply {
        tag = start
        base(this)
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                val u = r.url
                val host = u.host ?: ""
                if (u.scheme == "https" && host == "traceytech.app") {
                    if (u.path?.startsWith("/connect/google") == true) { googleInChrome(); return true }
                    if (v === home && u.path == "/voice") { show(TAB_VOICE); return true }
                    if (v === voice && (u.path == "/" || u.path.isNullOrEmpty())) { show(TAB_HOME); return true }
                    return false
                }
                if (host == "accounts.google.com") { googleInChrome(); return true }
                // everything else (maps, links in email) opens in the browser or its own app
                try {
                    val i = if (u.scheme == "intent") Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME) else Intent(Intent.ACTION_VIEW, u)
                    startActivity(i)
                } catch (e: Exception) {}
                return true
            }
            override fun onPageFinished(v: WebView, url: String) {
                swipes[v]?.isRefreshing = false
                if (url.startsWith(SITE)) v.evaluateJavascript(siteJs, null)
                if (v === voice) v.evaluateJavascript(
                    "(function(){var f=document.getElementById('fob');if(f)f.style.display='none';" +
                        "var a=document.querySelector('header a[href=\"/\"]');if(a)a.parentNode.style.display='none';})()", null)
                if (url.startsWith("$SITE/") && !url.startsWith("$SITE/login")) {
                    CookieManager.getInstance().flush()
                    if (Net.signedIn()) {
                        bridge.changed()
                        if (v === home && !siteOpen && tab == TAB_HOME && homeSite.visibility == View.VISIBLE) {
                            homeMode(); if (loaded.add(TAB_HOME)) cond.loadUrl(cond.tag as String) else cond.evaluateJavascript("window.onNativeShow&&onNativeShow()", null)
                        }
                    }
                }
            }
            override fun onRenderProcessGone(v: WebView, d: RenderProcessGoneDetail): Boolean { recreate(); return true }
        }
        setDownloadListener { url, _, _, _, _ -> openExternal(url) }
    }

    private fun local(page: String): WebView {
        val loader = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        return WebView(this).apply {
            tag = LOCAL + page
            base(this)
            addJavascriptInterface(bridge, "Native")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(v: WebView, r: WebResourceRequest): WebResourceResponse? = loader.shouldInterceptRequest(r.url)
                override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                    if (r.url.host == "appassets.androidplatform.net") return false
                    openExternal(r.url.toString()); return true
                }
                override fun onRenderProcessGone(v: WebView, d: RenderProcessGoneDetail): Boolean { recreate(); return true }
                override fun onPageFinished(v: WebView, url: String) {
                    v.evaluateJavascript("(function(){if(window.__ttTop)return;window.__ttTop=1;var P=window.ConductorPage;" +
                        "function r(){try{P&&P.top((window.scrollY||0)<=0&&!document.querySelector('.sheet.on'));}catch(e){}}" +
                        "addEventListener('scroll',r,{passive:true});addEventListener('touchstart',r,{passive:true,capture:true});})()", null)
                }
            }
        }
    }

    fun localViews() = listOf(cond, lists, settings)

    private fun googleInChrome() {
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Connect Google in Chrome")
            .setMessage("Google does not allow its sign-in inside apps. Open traceytech.app in Chrome, sign in there, and connect Google once. Conductor IO then uses the same connection.")
            .setPositiveButton("Open Chrome") { _, _ -> openExternal("$SITE/") }
            .setNegativeButton("Not now", null)
            .show()
    }
}
