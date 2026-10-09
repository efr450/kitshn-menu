package de.kitshn.ui.route.inbox

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import de.kitshn.BackHandler

// Menu fork: the page's window.MenuApp (menu-web/public/inbox.js appBridge): lends the sign-in, opens recipes. It answers only while
// the web view shows the page's own origin; other origins never load in it (shouldOverrideUrlLoading).
private class InboxBridge(
    private val view: WebView,
    private val pageUrl: () -> String,
    private val auth: () -> String?,
    private val onRecipe: (Int) -> Unit
) {
    private val main = Handler(Looper.getMainLooper())

    // the bridge runs on a binder thread; WebView.getUrl() must be read on the main thread
    private fun onPage(): Boolean {
        var url: String? = null
        val done = java.util.concurrent.CountDownLatch(1)
        main.post { url = view.url; done.countDown() }
        done.await(3, java.util.concurrent.TimeUnit.SECONDS)
        return url?.let { inboxKeepsInApp(pageUrl(), it) } == true
    }

    @JavascriptInterface
    fun auth(): String? = if(onPage()) auth.invoke() else null

    @JavascriptInterface
    fun openRecipe(id: Int) {
        if(onPage()) main.post { onRecipe(id) }
    }
}

@SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
@Composable
actual fun InboxPage(url: String, load: Int, auth: () -> String?, onRecipe: (Int) -> Unit, onBack: () -> Unit) {
    val context = LocalContext.current
    val currentUrl by rememberUpdatedState(url)
    val currentAuth by rememberUpdatedState(auth)
    val currentOnRecipe by rememberUpdatedState(onRecipe)
    var webView by remember { mutableStateOf<WebView?>(null) }
    var loaded by remember { mutableStateOf<Pair<String, Int>?>(null) }

    BackHandler {
        val w = webView
        if(w != null && w.canGoBack()) w.goBack() else onBack()
    }

    AndroidView(
        modifier = Modifier.fillMaxSize().safeDrawingPadding(),
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                        val target = request.url.toString()
                        if(inboxKeepsInApp(currentUrl, target)) return false
                        // a recipe's source site or anything else: the browser, not this web view
                        try {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(target)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        } catch(e: android.content.ActivityNotFoundException) {
                            // no browser: stay put
                        }
                        return true
                    }
                }
                addJavascriptInterface(
                    InboxBridge(this, { currentUrl }, { currentAuth() }, { currentOnRecipe(it) }),
                    "MenuApp"
                )
                webView = this
            }
        },
        update = { view ->
            if(loaded != url to load) {
                loaded = url to load
                view.loadUrl(url)
            }
        },
        onRelease = { view ->
            webView = null
            view.destroy()
        }
    )
}
