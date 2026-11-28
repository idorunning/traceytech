# Methods called from the in-app pages through the JavaScript bridge
-keepclassmembers class app.traceytech.conductor.Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
