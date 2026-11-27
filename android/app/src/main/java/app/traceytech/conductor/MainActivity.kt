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
import androidx.webkit.WebViewAssetLoader

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
    private lateinit var home: WebView
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
    }

    override fun onPause() {
        super.onPause()
        FobService.listener = null
        CookieManager.getInstance().flush()
    }

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
        lists = local("lists.html")
        settings = local("settings.html")

        voiceBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        voiceBox.addView(fobStrip(), LinearLayout.LayoutParams(-1, -2))
        voiceBox.addView(voice, LinearLayout.LayoutParams(-1, 0, 1f))

        listOf(home, lists, voiceBox, settings).forEach { content.addView(it, FrameLayout.LayoutParams(-1, -1)); it.visibility = View.GONE }

        nav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(0xFF0E0E10.toInt())
            setPadding(0, dp(6), 0, dp(6))
        }
        val hair = View(this).apply { setBackgroundColor(0x18EFEDE8) }
        root.addView(hair, LinearLayout.LayoutParams(-1, 1))
        root.addView(nav, LinearLayout.LayoutParams(-1, -2))
        addTab(TAB_HOME, "Home", R.drawable.ic_tab_home, home)
        addTab(TAB_LISTS, "Lists", R.drawable.ic_tab_lists, lists)
        addTab(TAB_VOICE, "Voice", R.drawable.ic_tab_voice, voiceBox)
        addTab(TAB_SETTINGS, "Settings", R.drawable.ic_tab_settings, settings)

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

    private fun reselect() {
        when (tab) {
            TAB_HOME -> { home.scrollTo(0, 0); home.reload() }
            TAB_VOICE -> voice.reload()
            else -> current()?.evaluateJavascript("window.onNativeReselect&&onNativeReselect()", null)
        }
    }

    fun show(key: String) {
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
        val w = current() ?: return
        val first = loaded.add(k)
        if (first) w.loadUrl(w.tag as String)
        else w.evaluateJavascript("window.onNativeShow&&onNativeShow()", null)
    }

    private fun current(): WebView? = when (tab) {
        TAB_HOME -> home; TAB_LISTS -> lists; TAB_VOICE -> voice; TAB_SETTINGS -> settings; else -> null
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
            background = GradientDrawable().apply { cornerRadius = dp(20).toFloat(); setColor(0xFFEFEDE8.toInt()) }
            setPadding(dp(16), 0, dp(16), 0); minHeight = dp(40); minimumHeight = dp(40)
            setOnClickListener { toggleFob() }
        }
        row.addView(fobBtn, LinearLayout.LayoutParams(-2, dp(40)).apply { leftMargin = dp(10) })
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
        loaded.remove(TAB_HOME); loaded.remove(TAB_VOICE)
        home.loadUrl("$SITE/login"); voice.clearHistory()
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
                if (v === voice) v.evaluateJavascript(
                    "(function(){var f=document.getElementById('fob');if(f)f.style.display='none';" +
                        "var a=document.querySelector('header a[href=\"/\"]');if(a)a.parentNode.style.display='none';})()", null)
                if (url.startsWith("$SITE/") && !url.startsWith("$SITE/login")) {
                    CookieManager.getInstance().flush()
                    if (Net.signedIn()) bridge.changed()
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
            }
        }
    }

    fun localViews() = listOf(lists, settings)

    private fun googleInChrome() {
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Connect Google in Chrome")
            .setMessage("Google does not allow its sign-in inside apps. Open traceytech.app in Chrome, sign in there, and connect Google once. Conductor IO then uses the same connection.")
            .setPositiveButton("Open Chrome") { _, _ -> openExternal("$SITE/") }
            .setNegativeButton("Not now", null)
            .show()
    }
}
